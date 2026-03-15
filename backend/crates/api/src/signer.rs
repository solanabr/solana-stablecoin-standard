//! Authority signer using the Codama-generated stablecoin client.
//! Loads keypair from env, builds mint/burn instructions via the client, sends transactions.

use std::str::FromStr;

use async_trait::async_trait;
use solana_client::rpc_client::RpcClient;
use solana_sdk::{
    commitment_config::CommitmentConfig,
    instruction::Instruction as SdkInstruction,
    pubkey::Pubkey,
    signature::{Keypair, Signer},
    transaction::Transaction,
};
use stablecoin_client::instructions::{BurnBuilder, MintBuilder};
use sss_domain::{
    LifecycleExecutionResult, LifecycleRequest, LifecycleRequestType, SignerBackend, WorkerError,
};

// Seeds match programs/stablecoin (sss-common) and Anchor event_authority
const SEED_CONFIG: &[u8] = b"config";
const SEED_MINTER: &[u8] = b"minter";
const SEED_ROLES: &[u8] = b"roles";
const SEED_EVENT_AUTHORITY: &[u8] = b"__event_authority";

/// Token-2022 (extensions); devnet presets and SSS-1/SSS-2 use this. Override with SSS_TOKEN_PROGRAM_ID if needed.
const TOKEN_2022_PROGRAM_ID: &str = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
const SPL_ASSOCIATED_TOKEN_PROGRAM_ID: &str = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";

/// Default stablecoin program ID (matches programs/stablecoin declare_id, program-ids.json)
const DEFAULT_STABLECOIN_PROGRAM_ID: &str = "Gbq8ZoZ4fE2J8wywFDYgSREPWL5qhtaneAX9PwQuQyCC";

fn pubkey_to_address(p: &Pubkey) -> solana_address::Address {
    solana_address::Address::try_from(p.to_bytes().as_slice()).expect("address from pubkey")
}

fn address_to_pubkey(a: solana_address::Address) -> Pubkey {
    let bytes: [u8; 32] = a.as_ref().try_into().expect("32 bytes");
    Pubkey::new_from_array(bytes)
}

/// Convert Codama client instruction (solana_instruction 3.x) to solana_sdk 2.x for Transaction.
fn to_sdk_instruction(ix: solana_instruction::Instruction) -> SdkInstruction {
    SdkInstruction {
        program_id: address_to_pubkey(ix.program_id),
        accounts: ix
            .accounts
            .into_iter()
            .map(|m| solana_sdk::instruction::AccountMeta {
                pubkey: address_to_pubkey(m.pubkey),
                is_signer: m.is_signer,
                is_writable: m.is_writable,
            })
            .collect(),
        data: ix.data,
    }
}

fn config_pda(mint: &Pubkey, program_id: &Pubkey) -> Pubkey {
    let (pda, _) = Pubkey::find_program_address(&[SEED_CONFIG, mint.as_ref()], program_id);
    pda
}

fn minter_quota_pda(mint: &Pubkey, authority: &Pubkey, program_id: &Pubkey) -> Pubkey {
    let (pda, _) =
        Pubkey::find_program_address(&[SEED_MINTER, mint.as_ref(), authority.as_ref()], program_id);
    pda
}

fn roles_pda(mint: &Pubkey, program_id: &Pubkey) -> Pubkey {
    let (pda, _) = Pubkey::find_program_address(&[SEED_ROLES, mint.as_ref()], program_id);
    pda
}

fn event_authority_pda(program_id: &Pubkey) -> Pubkey {
    let (pda, _) = Pubkey::find_program_address(&[SEED_EVENT_AUTHORITY], program_id);
    pda
}

fn associated_token_address(wallet: &Pubkey, mint: &Pubkey) -> Pubkey {
    let token_program_id = std::env::var("SSS_TOKEN_PROGRAM_ID")
        .ok()
        .and_then(|value| Pubkey::from_str(&value).ok())
        .unwrap_or_else(|| Pubkey::from_str(TOKEN_2022_PROGRAM_ID).expect("token program id"));
    let ata_program_id = Pubkey::from_str(SPL_ASSOCIATED_TOKEN_PROGRAM_ID).expect("ata program id");
    let (pda, _) = Pubkey::find_program_address(
        &[
            wallet.as_ref(),
            token_program_id.as_ref(),
            mint.as_ref(),
        ],
        &ata_program_id,
    );
    pda
}

/// Authority keypair signer: uses Codama client to build mint/burn instructions, then sends txs.
pub struct AuthorityKeypairSigner {
    keypair: Keypair,
    rpc_url: String,
    program_id: Pubkey,
}

impl AuthorityKeypairSigner {
    /// Load from env: SSS_AUTHORITY_KEYPAIR (path to JSON keypair) or SSS_AUTHORITY_SECRET_KEY (base58),
    /// SOLANA_RPC_URL, optional SSS_STABLECOIN_PROGRAM_ID.
    pub fn from_env() -> Result<Self, String> {
        let keypair = load_keypair_from_env()?;
        let rpc_url = std::env::var("SOLANA_RPC_URL")
            .map_err(|_| "SOLANA_RPC_URL must be set for authority signer".to_string())?;
        let program_id = std::env::var("SSS_STABLECOIN_PROGRAM_ID")
            .unwrap_or_else(|_| DEFAULT_STABLECOIN_PROGRAM_ID.to_string());
        let program_id = Pubkey::from_str(&program_id)
            .map_err(|e| format!("invalid SSS_STABLECOIN_PROGRAM_ID: {}", e))?;
        Ok(Self {
            keypair,
            rpc_url,
            program_id,
        })
    }

    fn program_id_address(&self) -> solana_address::Address {
        pubkey_to_address(&self.program_id)
    }

    fn execute_mint(&self, request: &LifecycleRequest) -> Result<LifecycleExecutionResult, WorkerError> {
        let mint = Pubkey::from_str(&request.mint)
            .map_err(|e| WorkerError::Dependency(format!("invalid mint pubkey: {}", e)))?;
        let amount = u64::try_from(request.amount)
            .ok()
            .and_then(|a| if a > 0 { Some(a) } else { None })
            .ok_or_else(|| WorkerError::Dependency("mint requires positive amount".to_string()))?;
        let authority = self.keypair.pubkey();
        let to_token_account = Pubkey::from_str(&request.token_account)
            .map_err(|e| WorkerError::Dependency(format!("invalid token_account: {}", e)))?;

        let program_addr = self.program_id_address();
        let token_program_addr = solana_address::Address::from_str(TOKEN_2022_PROGRAM_ID)
            .map_err(|e| WorkerError::Dependency(format!("token program id: {}", e)))?;

        let ix = MintBuilder::new()
            .authority(pubkey_to_address(&authority))
            .config(pubkey_to_address(&config_pda(&mint, &self.program_id)))
            .minter_quota(pubkey_to_address(&minter_quota_pda(&mint, &authority, &self.program_id)))
            .mint(pubkey_to_address(&mint))
            .to(pubkey_to_address(&to_token_account))
            .token_program(token_program_addr)
            .event_authority(pubkey_to_address(&event_authority_pda(&self.program_id)))
            .program(program_addr)
            .amount(amount)
            .instruction();

        self.send_transaction(&request.id, &[to_sdk_instruction(ix)])
    }

    fn execute_burn(&self, request: &LifecycleRequest) -> Result<LifecycleExecutionResult, WorkerError> {
        let mint = Pubkey::from_str(&request.mint)
            .map_err(|e| WorkerError::Dependency(format!("invalid mint pubkey: {}", e)))?;
        let amount = u64::try_from(request.amount)
            .ok()
            .and_then(|a| if a > 0 { Some(a) } else { None })
            .ok_or_else(|| WorkerError::Dependency("burn requires positive amount".to_string()))?;
        let authority = self.keypair.pubkey();
        let from_token_account = Pubkey::from_str(&request.token_account)
            .map_err(|e| WorkerError::Dependency(format!("invalid token_account: {}", e)))?;

        let program_addr = self.program_id_address();
        let token_program_addr = solana_address::Address::from_str(TOKEN_2022_PROGRAM_ID)
            .map_err(|e| WorkerError::Dependency(format!("token program id: {}", e)))?;

        let ix = BurnBuilder::new()
            .authority(pubkey_to_address(&authority))
            .config(pubkey_to_address(&config_pda(&mint, &self.program_id)))
            .role_config(pubkey_to_address(&roles_pda(&mint, &self.program_id)))
            .mint(pubkey_to_address(&mint))
            .from(pubkey_to_address(&from_token_account))
            .token_program(token_program_addr)
            .event_authority(pubkey_to_address(&event_authority_pda(&self.program_id)))
            .program(program_addr)
            .amount(amount)
            .instruction();

        self.send_transaction(&request.id, &[to_sdk_instruction(ix)])
    }

    fn send_transaction(
        &self,
        request_id: &str,
        instructions: &[SdkInstruction],
    ) -> Result<LifecycleExecutionResult, WorkerError> {
        let client = RpcClient::new_with_commitment(
            self.rpc_url.clone(),
            CommitmentConfig::confirmed(),
        );
        let recent = client
            .get_latest_blockhash()
            .map_err(|e| WorkerError::Dependency(format!("get_latest_blockhash: {}", e)))?;
        // Override program_id: generated client uses build-time ID; we use SSS_STABLECOIN_PROGRAM_ID
        let instructions: Vec<_> = instructions
            .iter()
            .map(|ix| SdkInstruction {
                program_id: self.program_id,
                accounts: ix.accounts.clone(),
                data: ix.data.clone(),
            })
            .collect();
        let tx = Transaction::new_signed_with_payer(
            &instructions,
            Some(&self.keypair.pubkey()),
            &[&self.keypair],
            recent,
        );
        let sig = client
            .send_and_confirm_transaction(&tx)
            .map_err(|e| WorkerError::Dependency(format!("send_and_confirm: {}", e)))?;
        Ok(LifecycleExecutionResult {
            request_id: request_id.to_string(),
            tx_signature: sig.to_string(),
        })
    }
}

fn load_keypair_from_env() -> Result<Keypair, String> {
    if let Ok(path) = std::env::var("SSS_AUTHORITY_KEYPAIR") {
        let data = std::fs::read_to_string(&path)
            .map_err(|e| format!("read keypair file {}: {}", path, e))?;
        let bytes: Vec<u8> = serde_json::from_str(&data)
            .map_err(|e| format!("keypair file not a JSON array of bytes: {}", e))?;
        return Keypair::from_bytes(&bytes).map_err(|e| format!("invalid keypair: {}", e));
    }
    if let Ok(secret) = std::env::var("SSS_AUTHORITY_SECRET_KEY") {
        use base58::FromBase58;
        let bytes = secret.from_base58().map_err(|e| format!("base58 decode: {:?}", e))?;
        return Keypair::from_bytes(&bytes).map_err(|e| format!("invalid keypair: {}", e));
    }
    Err("set SSS_AUTHORITY_KEYPAIR (path to JSON keypair) or SSS_AUTHORITY_SECRET_KEY (base58)".to_string())
}

#[async_trait]
impl SignerBackend for AuthorityKeypairSigner {
    fn name(&self) -> &'static str {
        "authority_keypair"
    }

    async fn execute(&self, request: &LifecycleRequest) -> Result<LifecycleExecutionResult, WorkerError> {
        match request.type_ {
            LifecycleRequestType::Mint => self.execute_mint(request),
            LifecycleRequestType::Burn => self.execute_burn(request),
        }
    }
}
