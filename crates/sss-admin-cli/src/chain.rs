use anyhow::{Context, Result};
use anchor_lang::{InstructionData, ToAccountMetas};
use solana_account_decoder::UiAccountEncoding;
use solana_client::{
    rpc_client::RpcClient,
    rpc_config::{RpcAccountInfoConfig, RpcProgramAccountsConfig},
    rpc_filter::{Memcmp, RpcFilterType},
};
use solana_sdk::{
    commitment_config::CommitmentConfig,
    instruction::Instruction,
    pubkey::Pubkey,
    signature::{Keypair, Signature, Signer},
    system_program, sysvar,
    transaction::Transaction,
};
use spl_token_2022::{
    extension::StateWithExtensionsOwned,
    state::{Account as TokenAccount, Mint as TokenMint},
};
use stablecoin::{
    instruction,
    instructions::{
        initialize::InitializeParams,
        roles::{UpdateMinterParams, UpdateRolesParams},
    },
};
use std::path::Path;

use crate::{
    config::{InitConfigFile, Preset},
    init::InitPlan,
};

const DEFAULT_MINTER_QUOTA: u64 = 1_000_000_000_000;

pub struct ChainClient {
    rpc: RpcClient,
    authority: Keypair,
}

pub struct InitExecution {
    pub mint: Pubkey,
    pub initialize_signature: Signature,
    pub minter_signature: Signature,
}

pub struct HolderRecord {
    pub owner: Pubkey,
    pub token_account: Pubkey,
    pub amount: u64,
}

pub struct MinterRecord {
    pub minter: Pubkey,
    pub quota: u64,
    pub minted: u64,
    pub active: bool,
}

pub struct RoleRecord {
    pub master_authority: Pubkey,
    pub pauser: Pubkey,
    pub burner: Pubkey,
    pub blacklister: Pubkey,
    pub seizer: Pubkey,
}

pub struct StatusRecord {
    pub mint: Pubkey,
    pub authority: Pubkey,
    pub name: String,
    pub symbol: String,
    pub uri: String,
    pub decimals: u8,
    pub paused: bool,
    pub enable_permanent_delegate: bool,
    pub enable_transfer_hook: bool,
    pub default_account_frozen: bool,
    pub total_minted: u64,
    pub total_burned: u64,
    pub supply: u64,
    pub roles: RoleRecord,
}

impl ChainClient {
    pub fn from_runtime(config: Option<&InitConfigFile>, rpc_override: Option<&str>) -> Result<Self> {
        let rpc_url = rpc_override
            .map(str::to_string)
            .or_else(|| config.and_then(|cfg| cfg.rpc_url.clone()))
            .or_else(|| std::env::var("SOLANA_RPC_URL").ok())
            .context("rpc_url must be set via --rpc-url, config, or SOLANA_RPC_URL for direct chain execution")?;
        Ok(Self {
            rpc: RpcClient::new_with_commitment(rpc_url, CommitmentConfig::confirmed()),
            authority: load_keypair(config.and_then(|cfg| cfg.authority_keypair.as_deref()))?,
        })
    }

    pub fn init(&self, plan: &InitPlan) -> Result<InitExecution> {
        let mint = Keypair::new();
        let initialize_signature = self.send_transaction(
            &[initialize_ix(self.authority.pubkey(), mint.pubkey(), &plan.config)],
            &[&mint],
        )?;
        let minter_signature = self.send_transaction(
            &[update_minter_ix(
                self.authority.pubkey(),
                mint.pubkey(),
                self.authority.pubkey(),
                DEFAULT_MINTER_QUOTA,
                true,
            )],
            &[],
        )?;
        Ok(InitExecution {
            mint: mint.pubkey(),
            initialize_signature,
            minter_signature,
        })
    }

    pub fn pause(&self, mint: Pubkey) -> Result<Signature> {
        self.send_transaction(&[pause_ix(self.authority.pubkey(), mint)], &[])
    }

    pub fn unpause(&self, mint: Pubkey) -> Result<Signature> {
        self.send_transaction(&[unpause_ix(self.authority.pubkey(), mint)], &[])
    }

    pub fn add_minter(&self, mint: Pubkey, minter: Pubkey, quota: u64) -> Result<Signature> {
        self.send_transaction(
            &[update_minter_ix(self.authority.pubkey(), mint, minter, quota, true)],
            &[],
        )
    }

    pub fn remove_minter(&self, mint: Pubkey, minter: Pubkey) -> Result<Signature> {
        self.send_transaction(
            &[update_minter_ix(self.authority.pubkey(), mint, minter, 0, false)],
            &[],
        )
    }

    pub fn list_minters(&self, mint: Pubkey) -> Result<Vec<MinterRecord>> {
        let accounts = self.rpc.get_program_accounts_with_config(
            &stablecoin::ID,
            RpcProgramAccountsConfig {
                filters: Some(vec![
                    RpcFilterType::Memcmp(Memcmp::new_raw_bytes(
                        0,
                        stablecoin_client::generated::accounts::MINTER_QUOTA_DISCRIMINATOR.to_vec(),
                    )),
                    RpcFilterType::Memcmp(Memcmp::new_raw_bytes(8, mint.to_bytes().to_vec())),
                ]),
                account_config: RpcAccountInfoConfig::default(),
                with_context: None,
                sort_results: None,
            },
        )?;

        let mut results = Vec::with_capacity(accounts.len());
        for (_, account) in accounts {
            let decoded = stablecoin_client::generated::accounts::MinterQuota::from_bytes(&account.data)
                .context("decode minter quota account")?;
            results.push(MinterRecord {
                minter: Pubkey::new_from_array(decoded.minter.to_bytes()),
                quota: decoded.quota,
                minted: decoded.minted,
                active: decoded.active,
            });
        }
        Ok(results)
    }

    pub fn list_holders(&self, mint: Pubkey, min_balance: Option<u64>) -> Result<Vec<HolderRecord>> {
        match self.rpc.get_program_accounts_with_config(
            &spl_token_2022::id(),
            RpcProgramAccountsConfig {
                filters: Some(vec![RpcFilterType::Memcmp(Memcmp::new_raw_bytes(
                    0,
                    mint.to_bytes().to_vec(),
                ))]),
                account_config: RpcAccountInfoConfig {
                    encoding: Some(UiAccountEncoding::Base64),
                    ..RpcAccountInfoConfig::default()
                },
                with_context: None,
                sort_results: None,
            },
        ) {
            Ok(accounts) => decode_holder_accounts(accounts, min_balance),
            Err(error) if should_fallback_to_largest_accounts(&error.to_string()) => {
                self.list_holders_via_largest_accounts(mint, min_balance)
            }
            Err(error) => Err(error).context("list token accounts for mint"),
        }
    }

    pub fn get_roles(&self, mint: Pubkey) -> Result<RoleRecord> {
        let account = self
            .rpc
            .get_account(&roles_pda(&mint))
            .context("fetch role config account")?;
        let decoded = stablecoin_client::generated::accounts::RoleConfig::from_bytes(&account.data)
            .context("decode role config account")?;
        Ok(RoleRecord {
            master_authority: parse_pubkey_from_address(&decoded.master_authority)?,
            pauser: parse_pubkey_from_address(&decoded.pauser)?,
            burner: parse_pubkey_from_address(&decoded.burner)?,
            blacklister: parse_pubkey_from_address(&decoded.blacklister)?,
            seizer: parse_pubkey_from_address(&decoded.seizer)?,
        })
    }

    fn list_holders_via_largest_accounts(&self, mint: Pubkey, min_balance: Option<u64>) -> Result<Vec<HolderRecord>> {
        let largest_accounts = self
            .rpc
            .get_token_largest_accounts(&mint)
            .context("fetch token largest accounts")?;

        let mut holders = Vec::new();
        for account_balance in largest_accounts {
            let address: Pubkey = account_balance
                .address
                .parse()
                .map_err(|error| anyhow::anyhow!("invalid token account {}: {error}", account_balance.address))?;
            let amount = account_balance
                .amount
                .amount
                .parse::<u64>()
                .context("parse token largest account amount")?;
            if amount == 0 {
                continue;
            }
            if let Some(min_balance) = min_balance {
                if amount < min_balance {
                    continue;
                }
            }
            let account = self
                .rpc
                .get_account(&address)
                .with_context(|| format!("fetch token account {}", address))?;
            let unpacked =
                StateWithExtensionsOwned::<TokenAccount>::unpack(account.data).context("decode token account")?;
            holders.push(HolderRecord {
                owner: unpacked.base.owner,
                token_account: address,
                amount,
            });
        }
        holders.sort_by(|left, right| right.amount.cmp(&left.amount));
        Ok(holders)
    }

    pub fn get_status(&self, mint: Pubkey) -> Result<StatusRecord> {
        let config_account = self
            .rpc
            .get_account(&config_pda(&mint))
            .context("fetch stablecoin config account")?;
        let mint_account = self.rpc.get_account(&mint).context("fetch mint account")?;
        let config =
            stablecoin_client::generated::accounts::StablecoinConfig::from_bytes(&config_account.data)
                .context("decode stablecoin config account")?;
        let mint_state =
            StateWithExtensionsOwned::<TokenMint>::unpack(mint_account.data).context("decode mint account")?;
        let roles = self.get_roles(mint)?;

        Ok(StatusRecord {
            mint,
            authority: parse_pubkey_from_address(&config.authority)?,
            name: config.name,
            symbol: config.symbol,
            uri: config.uri,
            decimals: config.decimals,
            paused: config.paused,
            enable_permanent_delegate: config.enable_permanent_delegate,
            enable_transfer_hook: config.enable_transfer_hook,
            default_account_frozen: config.default_account_frozen,
            total_minted: config.total_minted,
            total_burned: config.total_burned,
            supply: mint_state.base.supply,
            roles,
        })
    }

    pub fn update_roles(&self, mint: Pubkey, params: UpdateRolesParams) -> Result<Signature> {
        self.send_transaction(&[update_roles_ix(self.authority.pubkey(), mint, params)], &[])
    }

    pub fn freeze_account(&self, mint: Pubkey, account: Pubkey) -> Result<Signature> {
        self.send_transaction(&[freeze_account_ix(self.authority.pubkey(), mint, account)], &[])
    }

    pub fn thaw_account(&self, mint: Pubkey, account: Pubkey) -> Result<Signature> {
        self.send_transaction(&[thaw_account_ix(self.authority.pubkey(), mint, account)], &[])
    }

    pub fn add_to_blacklist(&self, mint: Pubkey, wallet: Pubkey, reason: String) -> Result<Signature> {
        self.send_transaction(
            &[add_to_blacklist_ix(self.authority.pubkey(), mint, wallet, reason)],
            &[],
        )
    }

    pub fn remove_from_blacklist(&self, mint: Pubkey, wallet: Pubkey) -> Result<Signature> {
        self.send_transaction(
            &[remove_from_blacklist_ix(self.authority.pubkey(), mint, wallet)],
            &[],
        )
    }

    pub fn seize(&self, mint: Pubkey, from: Pubkey, to: Pubkey, amount: Option<u64>) -> Result<Signature> {
        let from_account = self.rpc.get_account(&from).context("fetch frozen source account")?;
        let to_account = self
            .rpc
            .get_account(&to)
            .context("fetch treasury destination account")?;
        let from_state =
            StateWithExtensionsOwned::<TokenAccount>::unpack(from_account.data).context("decode source account")?;
        let to_state =
            StateWithExtensionsOwned::<TokenAccount>::unpack(to_account.data).context("decode treasury account")?;
        let seize_amount = amount.unwrap_or(from_state.base.amount);
        let status = self.get_status(mint)?;

        self.send_transaction(
            &[seize_ix_with_amount(
                self.authority.pubkey(),
                mint,
                from,
                to,
                from_state.base.owner,
                to_state.base.owner,
                seize_amount,
                status.enable_transfer_hook,
            )],
            &[],
        )
    }

    fn send_transaction(&self, instructions: &[Instruction], extra_signers: &[&Keypair]) -> Result<Signature> {
        let recent = self.rpc.get_latest_blockhash().context("get latest blockhash")?;
        let mut signers: Vec<&Keypair> = vec![&self.authority];
        signers.extend_from_slice(extra_signers);
        let tx = Transaction::new_signed_with_payer(
            instructions,
            Some(&self.authority.pubkey()),
            &signers,
            recent,
        );
        self.rpc
            .send_and_confirm_transaction(&tx)
            .context("send and confirm transaction")
    }
}

fn initialize_ix(authority: Pubkey, mint: Pubkey, config: &InitConfigFile) -> Instruction {
    let params = InitializeParams {
        name: config.name.clone(),
        symbol: config.symbol.clone(),
        uri: config.uri.clone(),
        decimals: config.decimals,
        enable_permanent_delegate: config.features.enable_permanent_delegate,
        enable_transfer_hook: config.features.enable_transfer_hook,
        default_account_frozen: config.features.default_account_frozen,
    };
    let accounts = stablecoin::accounts::Initialize {
        authority,
        mint,
        config: config_pda(&mint),
        role_config: roles_pda(&mint),
        extra_account_meta_list: (config.preset == Preset::Sss2).then_some(extra_account_meta_list_pda(&mint)),
        hook_config: (config.preset == Preset::Sss2).then_some(hook_config_pda()),
        transfer_hook_program: (config.preset == Preset::Sss2).then_some(transfer_hook::ID),
        token_program: spl_token_2022::id(),
        system_program: system_program::ID,
        rent: sysvar::rent::ID,
        event_authority: event_authority_pda(),
        program: stablecoin::ID,
    };

    Instruction {
        program_id: stablecoin::ID,
        accounts: accounts.to_account_metas(None),
        data: instruction::Initialize { params }.data(),
    }
}

fn update_minter_ix(authority: Pubkey, mint: Pubkey, minter: Pubkey, quota: u64, active: bool) -> Instruction {
    let accounts = stablecoin::accounts::UpdateMinter {
        authority,
        config: config_pda(&mint),
        role_config: roles_pda(&mint),
        mint,
        minter,
        minter_quota: minter_quota_pda(&mint, &minter),
        system_program: system_program::ID,
        event_authority: event_authority_pda(),
        program: stablecoin::ID,
    };

    Instruction {
        program_id: stablecoin::ID,
        accounts: accounts.to_account_metas(None),
        data: instruction::UpdateMinter {
            params: UpdateMinterParams {
                minter,
                quota,
                active,
            },
        }
        .data(),
    }
}

fn update_roles_ix(authority: Pubkey, mint: Pubkey, params: UpdateRolesParams) -> Instruction {
    let accounts = stablecoin::accounts::UpdateRoles {
        authority,
        config: config_pda(&mint),
        role_config: roles_pda(&mint),
        event_authority: event_authority_pda(),
        program: stablecoin::ID,
    };

    Instruction {
        program_id: stablecoin::ID,
        accounts: accounts.to_account_metas(None),
        data: instruction::UpdateRoles { params }.data(),
    }
}

fn pause_ix(authority: Pubkey, mint: Pubkey) -> Instruction {
    let accounts = stablecoin::accounts::PauseOps {
        authority,
        config: config_pda(&mint),
        role_config: roles_pda(&mint),
        event_authority: event_authority_pda(),
        program: stablecoin::ID,
    };
    Instruction {
        program_id: stablecoin::ID,
        accounts: accounts.to_account_metas(None),
        data: instruction::Pause {}.data(),
    }
}

fn unpause_ix(authority: Pubkey, mint: Pubkey) -> Instruction {
    let accounts = stablecoin::accounts::UnpauseOps {
        authority,
        config: config_pda(&mint),
        role_config: roles_pda(&mint),
        event_authority: event_authority_pda(),
        program: stablecoin::ID,
    };
    Instruction {
        program_id: stablecoin::ID,
        accounts: accounts.to_account_metas(None),
        data: instruction::Unpause {}.data(),
    }
}

fn freeze_account_ix(authority: Pubkey, mint: Pubkey, account: Pubkey) -> Instruction {
    let accounts = stablecoin::accounts::FreezeTokenAccount {
        authority,
        config: config_pda(&mint),
        role_config: roles_pda(&mint),
        mint,
        account,
        token_program: spl_token_2022::id(),
        event_authority: event_authority_pda(),
        program: stablecoin::ID,
    };

    Instruction {
        program_id: stablecoin::ID,
        accounts: accounts.to_account_metas(None),
        data: instruction::FreezeAccount {}.data(),
    }
}

fn thaw_account_ix(authority: Pubkey, mint: Pubkey, account: Pubkey) -> Instruction {
    let accounts = stablecoin::accounts::ThawTokenAccount {
        authority,
        config: config_pda(&mint),
        role_config: roles_pda(&mint),
        mint,
        account,
        token_program: spl_token_2022::id(),
        event_authority: event_authority_pda(),
        program: stablecoin::ID,
    };

    Instruction {
        program_id: stablecoin::ID,
        accounts: accounts.to_account_metas(None),
        data: instruction::ThawAccount {}.data(),
    }
}

fn add_to_blacklist_ix(authority: Pubkey, mint: Pubkey, wallet: Pubkey, reason: String) -> Instruction {
    let accounts = stablecoin::accounts::AddToBlacklist {
        authority,
        config: config_pda(&mint),
        role_config: roles_pda(&mint),
        wallet,
        blacklist_entry: blacklist_pda(&mint, &wallet),
        system_program: system_program::ID,
        event_authority: event_authority_pda(),
        program: stablecoin::ID,
    };

    Instruction {
        program_id: stablecoin::ID,
        accounts: accounts.to_account_metas(None),
        data: instruction::AddToBlacklist { reason }.data(),
    }
}

fn remove_from_blacklist_ix(authority: Pubkey, mint: Pubkey, wallet: Pubkey) -> Instruction {
    let accounts = stablecoin::accounts::RemoveFromBlacklist {
        authority,
        config: config_pda(&mint),
        role_config: roles_pda(&mint),
        blacklist_entry: blacklist_pda(&mint, &wallet),
        event_authority: event_authority_pda(),
        program: stablecoin::ID,
    };

    Instruction {
        program_id: stablecoin::ID,
        accounts: accounts.to_account_metas(None),
        data: instruction::RemoveFromBlacklist {}.data(),
    }
}

fn seize_ix_with_amount(
    authority: Pubkey,
    mint: Pubkey,
    from: Pubkey,
    to: Pubkey,
    victim_wallet: Pubkey,
    treasury_owner: Pubkey,
    amount: u64,
    transfer_hook_enabled: bool,
) -> Instruction {
    let accounts = stablecoin::accounts::SeizeTokens {
        authority,
        config: config_pda(&mint),
        role_config: roles_pda(&mint),
        mint,
        from,
        to,
        blacklist_entry: blacklist_pda(&mint, &victim_wallet),
        stablecoin_program: stablecoin::ID,
        transfer_hook_program: transfer_hook::ID,
        hook_config: hook_config_pda(),
        extra_account_meta_list: extra_account_meta_list_pda(&mint),
        destination_blacklist: blacklist_pda(&mint, &treasury_owner),
        token_program: spl_token_2022::id(),
        event_authority: event_authority_pda(),
        program: stablecoin::ID,
    };
    let mut metas = accounts.to_account_metas(None);
    if !transfer_hook_enabled {
        for meta in &mut metas {
            if meta.pubkey == extra_account_meta_list_pda(&mint)
                || meta.pubkey == blacklist_pda(&mint, &treasury_owner)
                || meta.pubkey == transfer_hook::ID
                || meta.pubkey == stablecoin::ID
            {
                meta.is_writable = false;
            }
        }
    }

    Instruction {
        program_id: stablecoin::ID,
        accounts: metas,
        data: instruction::Seize { amount }.data(),
    }
}

fn config_pda(mint: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(&[sss_common::SEED_CONFIG, mint.as_ref()], &stablecoin::ID).0
}

fn roles_pda(mint: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(&[sss_common::SEED_ROLES, mint.as_ref()], &stablecoin::ID).0
}

fn minter_quota_pda(mint: &Pubkey, minter: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(
        &[sss_common::SEED_MINTER, mint.as_ref(), minter.as_ref()],
        &stablecoin::ID,
    )
    .0
}

fn blacklist_pda(mint: &Pubkey, wallet: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(
        &[sss_common::SEED_BLACKLIST, mint.as_ref(), wallet.as_ref()],
        &stablecoin::ID,
    )
    .0
}

fn extra_account_meta_list_pda(mint: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(
        &[sss_common::SEED_EXTRA_ACCOUNT_METAS, mint.as_ref()],
        &transfer_hook::ID,
    )
    .0
}

fn hook_config_pda() -> Pubkey {
    Pubkey::find_program_address(&[b"hook_config"], &transfer_hook::ID).0
}

fn event_authority_pda() -> Pubkey {
    Pubkey::find_program_address(&[b"__event_authority"], &stablecoin::ID).0
}

fn load_keypair(config_path: Option<&str>) -> Result<Keypair> {
    if let Ok(path) = std::env::var("SSS_AUTHORITY_KEYPAIR") {
        return load_keypair_file(Path::new(&path));
    }
    if let Some(path) = config_path {
        return load_keypair_file(Path::new(path));
    }
    let default_path = dirs::home_dir()
        .map(|home| home.join(".config/solana/id.json"))
        .context("home directory not found for default Solana keypair")?;
    load_keypair_file(&default_path)
}

fn load_keypair_file(path: &Path) -> Result<Keypair> {
    let contents =
        std::fs::read_to_string(path).with_context(|| format!("read keypair file {}", path.display()))?;
    let bytes: Vec<u8> =
        serde_json::from_str(&contents).with_context(|| format!("parse keypair file {}", path.display()))?;
    Keypair::from_bytes(&bytes).context("invalid authority keypair")
}

fn parse_pubkey_from_address(address: &impl ToString) -> Result<Pubkey> {
    address
        .to_string()
        .parse()
        .map_err(|error| anyhow::anyhow!("invalid address {}: {error}", address.to_string()))
}

fn decode_holder_accounts(
    accounts: Vec<(Pubkey, solana_sdk::account::Account)>,
    min_balance: Option<u64>,
) -> Result<Vec<HolderRecord>> {
    let mut holders = Vec::new();
    for (address, account) in accounts {
        let unpacked =
            StateWithExtensionsOwned::<TokenAccount>::unpack(account.data).context("decode token account")?;
        if unpacked.base.amount == 0 {
            continue;
        }
        if let Some(min_balance) = min_balance {
            if unpacked.base.amount < min_balance {
                continue;
            }
        }
        holders.push(HolderRecord {
            owner: unpacked.base.owner,
            token_account: address,
            amount: unpacked.base.amount,
        });
    }
    holders.sort_by(|left, right| right.amount.cmp(&left.amount));
    Ok(holders)
}

fn should_fallback_to_largest_accounts(error_text: &str) -> bool {
    error_text.contains("excluded from account secondary indexes")
        || error_text.contains("Encoded binary (base 58) data should be less than 128 bytes")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        path::Path,
        sync::{Mutex, OnceLock},
    };
    use tempfile::tempdir;

    fn env_lock() -> &'static Mutex<()> {
        static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
        LOCK.get_or_init(|| Mutex::new(()))
    }

    fn write_keypair(path: &Path, keypair: &Keypair) {
        let contents = serde_json::to_string(&keypair.to_bytes().to_vec()).unwrap();
        std::fs::write(path, contents).unwrap();
    }

    #[test]
    fn load_keypair_prefers_env_over_config_path() {
        let _guard = env_lock().lock().unwrap();
        let previous = std::env::var("SSS_AUTHORITY_KEYPAIR").ok();

        let dir = tempdir().unwrap();
        let config_path = dir.path().join("config-authority.json");
        let env_path = dir.path().join("env-authority.json");
        let config_keypair = Keypair::new();
        let env_keypair = Keypair::new();
        write_keypair(&config_path, &config_keypair);
        write_keypair(&env_path, &env_keypair);
        std::env::set_var("SSS_AUTHORITY_KEYPAIR", &env_path);

        let loaded = load_keypair(config_path.to_str()).unwrap();

        if let Some(previous) = previous {
            std::env::set_var("SSS_AUTHORITY_KEYPAIR", previous);
        } else {
            std::env::remove_var("SSS_AUTHORITY_KEYPAIR");
        }

        assert_eq!(loaded.pubkey(), env_keypair.pubkey());
    }

    #[test]
    fn holder_fallback_matches_known_rpc_errors() {
        assert!(should_fallback_to_largest_accounts(
            "RPC response error -32600: Encoded binary (base 58) data should be less than 128 bytes, please use Base64 encoding.;"
        ));
        assert!(should_fallback_to_largest_accounts(
            "Transaction history is not available from this node: excluded from account secondary indexes"
        ));
        assert!(!should_fallback_to_largest_accounts("some other rpc error"));
    }
}
