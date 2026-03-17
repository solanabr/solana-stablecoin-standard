use std::path::PathBuf;

use anchor_lang::{AccountDeserialize, InstructionData, ToAccountMetas};
use litesvm::{types::TransactionResult, LiteSVM};
use solana_sdk::{
    instruction::{AccountMeta, Instruction},
    pubkey::Pubkey,
    signature::{Keypair, Signer},
    system_program, sysvar,
    transaction::Transaction,
};
use sss_common::SEED_BLACKLIST;
use stablecoin::instructions::initialize::InitializeParams;
use stablecoin::instructions::roles::{UpdateMinterParams, UpdateRolesParams};

use sss_common::{SEED_CONFIG, SEED_EXTRA_ACCOUNT_METAS, SEED_ROLES};

pub fn new_svm() -> LiteSVM {
    let mut svm = LiteSVM::new();
    svm.add_program_from_file(stablecoin::ID, deploy_artifact("stablecoin.so"))
        .expect("stablecoin program artifact");
    svm.add_program_from_file(transfer_hook::ID, deploy_artifact("transfer_hook.so"))
        .expect("transfer-hook program artifact");
    svm
}

pub fn deploy_artifact(file_name: &str) -> PathBuf {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../target/deploy")
        .join(file_name);
    assert!(path.exists(), "missing deploy artifact: {}", path.display());
    path
}

pub fn funded_keypair(svm: &mut LiteSVM) -> Keypair {
    let keypair = Keypair::new();
    svm.airdrop(
        &keypair.pubkey(),
        10 * solana_sdk::native_token::LAMPORTS_PER_SOL,
    )
    .expect("airdrop");
    keypair
}

pub fn send_tx(
    svm: &mut LiteSVM,
    payer: &Keypair,
    instructions: &[Instruction],
    signers: &[&Keypair],
) -> TransactionResult {
    let blockhash = svm.latest_blockhash();
    let tx =
        Transaction::new_signed_with_payer(instructions, Some(&payer.pubkey()), signers, blockhash);
    svm.send_transaction(tx)
}

pub fn config_pda(mint: &solana_sdk::pubkey::Pubkey) -> solana_sdk::pubkey::Pubkey {
    solana_sdk::pubkey::Pubkey::find_program_address(&[SEED_CONFIG, mint.as_ref()], &stablecoin::ID)
        .0
}

pub fn roles_pda(mint: &solana_sdk::pubkey::Pubkey) -> solana_sdk::pubkey::Pubkey {
    solana_sdk::pubkey::Pubkey::find_program_address(&[SEED_ROLES, mint.as_ref()], &stablecoin::ID)
        .0
}

pub fn minter_quota_pda(
    mint: &solana_sdk::pubkey::Pubkey,
    minter: &solana_sdk::pubkey::Pubkey,
) -> solana_sdk::pubkey::Pubkey {
    solana_sdk::pubkey::Pubkey::find_program_address(
        &[sss_common::SEED_MINTER, mint.as_ref(), minter.as_ref()],
        &stablecoin::ID,
    )
    .0
}

pub fn blacklist_pda(
    mint: &solana_sdk::pubkey::Pubkey,
    wallet: &solana_sdk::pubkey::Pubkey,
) -> solana_sdk::pubkey::Pubkey {
    solana_sdk::pubkey::Pubkey::find_program_address(
        &[SEED_BLACKLIST, mint.as_ref(), wallet.as_ref()],
        &stablecoin::ID,
    )
    .0
}

pub fn hook_config_pda() -> solana_sdk::pubkey::Pubkey {
    solana_sdk::pubkey::Pubkey::find_program_address(&[b"hook_config"], &transfer_hook::ID).0
}

pub fn extra_account_meta_list_pda(
    mint: &solana_sdk::pubkey::Pubkey,
) -> solana_sdk::pubkey::Pubkey {
    solana_sdk::pubkey::Pubkey::find_program_address(
        &[SEED_EXTRA_ACCOUNT_METAS, mint.as_ref()],
        &transfer_hook::ID,
    )
    .0
}

pub fn stablecoin_event_authority_pda() -> solana_sdk::pubkey::Pubkey {
    solana_sdk::pubkey::Pubkey::find_program_address(&[b"__event_authority"], &stablecoin::ID).0
}

pub fn initialize_hook_config_ix(
    payer: solana_sdk::pubkey::Pubkey,
    stablecoin_program_id: solana_sdk::pubkey::Pubkey,
) -> Instruction {
    let accounts = transfer_hook::accounts::InitializeHookConfig {
        payer,
        hook_config: hook_config_pda(),
        system_program: system_program::ID,
    };

    Instruction {
        program_id: transfer_hook::ID,
        accounts: accounts.to_account_metas(None),
        data: transfer_hook::instruction::InitializeHookConfig {
            stablecoin_program_id,
        }
        .data(),
    }
}

pub fn initialize_ix(
    authority: solana_sdk::pubkey::Pubkey,
    mint: solana_sdk::pubkey::Pubkey,
    params: InitializeParams,
) -> Instruction {
    let accounts = stablecoin::accounts::Initialize {
        authority,
        mint,
        config: config_pda(&mint),
        role_config: roles_pda(&mint),
        extra_account_meta_list: params
            .enable_transfer_hook
            .then_some(extra_account_meta_list_pda(&mint)),
        hook_config: params.enable_transfer_hook.then_some(hook_config_pda()),
        transfer_hook_program: params.enable_transfer_hook.then_some(transfer_hook::ID),
        token_program: spl_token_2022::id(),
        system_program: system_program::ID,
        rent: sysvar::rent::ID,
        event_authority: stablecoin_event_authority_pda(),
        program: stablecoin::ID,
    };

    Instruction {
        program_id: stablecoin::ID,
        accounts: accounts.to_account_metas(None),
        data: stablecoin::instruction::Initialize { params }.data(),
    }
}

pub fn update_minter_ix(
    authority: solana_sdk::pubkey::Pubkey,
    mint: solana_sdk::pubkey::Pubkey,
    minter: solana_sdk::pubkey::Pubkey,
    quota: u64,
    active: bool,
) -> Instruction {
    let accounts = stablecoin::accounts::UpdateMinter {
        authority,
        config: config_pda(&mint),
        role_config: roles_pda(&mint),
        mint,
        minter,
        minter_quota: minter_quota_pda(&mint, &minter),
        system_program: system_program::ID,
        event_authority: stablecoin_event_authority_pda(),
        program: stablecoin::ID,
    };

    Instruction {
        program_id: stablecoin::ID,
        accounts: accounts.to_account_metas(None),
        data: stablecoin::instruction::UpdateMinter {
            params: UpdateMinterParams {
                minter,
                quota,
                active,
            },
        }
        .data(),
    }
}

pub fn update_roles_ix(
    authority: solana_sdk::pubkey::Pubkey,
    mint: solana_sdk::pubkey::Pubkey,
    params: UpdateRolesParams,
) -> Instruction {
    let accounts = stablecoin::accounts::UpdateRoles {
        authority,
        config: config_pda(&mint),
        role_config: roles_pda(&mint),
        event_authority: stablecoin_event_authority_pda(),
        program: stablecoin::ID,
    };

    Instruction {
        program_id: stablecoin::ID,
        accounts: accounts.to_account_metas(None),
        data: stablecoin::instruction::UpdateRoles { params }.data(),
    }
}

pub fn transfer_authority_ix(
    authority: solana_sdk::pubkey::Pubkey,
    mint: solana_sdk::pubkey::Pubkey,
    new_authority: solana_sdk::pubkey::Pubkey,
) -> Instruction {
    let accounts = stablecoin::accounts::TransferAuthority {
        authority,
        config: config_pda(&mint),
        role_config: roles_pda(&mint),
        event_authority: stablecoin_event_authority_pda(),
        program: stablecoin::ID,
    };

    Instruction {
        program_id: stablecoin::ID,
        accounts: accounts.to_account_metas(None),
        data: stablecoin::instruction::TransferAuthority { new_authority }.data(),
    }
}

pub fn mint_ix(
    authority: solana_sdk::pubkey::Pubkey,
    mint: solana_sdk::pubkey::Pubkey,
    to: solana_sdk::pubkey::Pubkey,
    amount: u64,
) -> Instruction {
    let accounts = stablecoin::accounts::MintTokens {
        authority,
        config: config_pda(&mint),
        minter_quota: minter_quota_pda(&mint, &authority),
        mint,
        to,
        token_program: spl_token_2022::id(),
        event_authority: stablecoin_event_authority_pda(),
        program: stablecoin::ID,
    };

    Instruction {
        program_id: stablecoin::ID,
        accounts: accounts.to_account_metas(None),
        data: stablecoin::instruction::Mint { amount }.data(),
    }
}

pub fn pause_ix(authority: Pubkey, mint: Pubkey) -> Instruction {
    let accounts = stablecoin::accounts::PauseOps {
        authority,
        config: config_pda(&mint),
        role_config: roles_pda(&mint),
        event_authority: stablecoin_event_authority_pda(),
        program: stablecoin::ID,
    };

    Instruction {
        program_id: stablecoin::ID,
        accounts: accounts.to_account_metas(None),
        data: stablecoin::instruction::Pause {}.data(),
    }
}

pub fn unpause_ix(authority: Pubkey, mint: Pubkey) -> Instruction {
    let accounts = stablecoin::accounts::UnpauseOps {
        authority,
        config: config_pda(&mint),
        role_config: roles_pda(&mint),
        event_authority: stablecoin_event_authority_pda(),
        program: stablecoin::ID,
    };

    Instruction {
        program_id: stablecoin::ID,
        accounts: accounts.to_account_metas(None),
        data: stablecoin::instruction::Unpause {}.data(),
    }
}

pub fn burn_ix(authority: Pubkey, mint: Pubkey, from: Pubkey, amount: u64) -> Instruction {
    let accounts = stablecoin::accounts::BurnTokens {
        authority,
        config: config_pda(&mint),
        role_config: roles_pda(&mint),
        mint,
        from,
        token_program: spl_token_2022::id(),
        event_authority: stablecoin_event_authority_pda(),
        program: stablecoin::ID,
    };

    Instruction {
        program_id: stablecoin::ID,
        accounts: accounts.to_account_metas(None),
        data: stablecoin::instruction::Burn { amount }.data(),
    }
}

pub fn add_to_blacklist_ix(
    authority: Pubkey,
    mint: Pubkey,
    wallet: Pubkey,
    reason: String,
) -> Instruction {
    let accounts = stablecoin::accounts::AddToBlacklist {
        authority,
        config: config_pda(&mint),
        role_config: roles_pda(&mint),
        wallet,
        blacklist_entry: blacklist_pda(&mint, &wallet),
        system_program: system_program::ID,
        event_authority: stablecoin_event_authority_pda(),
        program: stablecoin::ID,
    };

    Instruction {
        program_id: stablecoin::ID,
        accounts: accounts.to_account_metas(None),
        data: stablecoin::instruction::AddToBlacklist { reason }.data(),
    }
}

pub fn remove_from_blacklist_ix(authority: Pubkey, mint: Pubkey, wallet: Pubkey) -> Instruction {
    let accounts = stablecoin::accounts::RemoveFromBlacklist {
        authority,
        config: config_pda(&mint),
        role_config: roles_pda(&mint),
        blacklist_entry: blacklist_pda(&mint, &wallet),
        event_authority: stablecoin_event_authority_pda(),
        program: stablecoin::ID,
    };

    Instruction {
        program_id: stablecoin::ID,
        accounts: accounts.to_account_metas(None),
        data: stablecoin::instruction::RemoveFromBlacklist {}.data(),
    }
}

pub fn seize_ix(
    authority: Pubkey,
    mint: Pubkey,
    from: Pubkey,
    to: Pubkey,
    victim_wallet: Pubkey,
    treasury_owner: Pubkey,
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
        event_authority: stablecoin_event_authority_pda(),
        program: stablecoin::ID,
    };

    Instruction {
        program_id: stablecoin::ID,
        accounts: accounts.to_account_metas(None),
        data: stablecoin::instruction::Seize { amount: 0 }.data(),
    }
}

pub fn freeze_account_ix(authority: Pubkey, mint: Pubkey, account: Pubkey) -> Instruction {
    let accounts = stablecoin::accounts::FreezeTokenAccount {
        authority,
        config: config_pda(&mint),
        role_config: roles_pda(&mint),
        mint,
        account,
        token_program: spl_token_2022::id(),
        event_authority: stablecoin_event_authority_pda(),
        program: stablecoin::ID,
    };

    Instruction {
        program_id: stablecoin::ID,
        accounts: accounts.to_account_metas(None),
        data: stablecoin::instruction::FreezeAccount {}.data(),
    }
}

pub fn thaw_account_ix(authority: Pubkey, mint: Pubkey, account: Pubkey) -> Instruction {
    let accounts = stablecoin::accounts::ThawTokenAccount {
        authority,
        config: config_pda(&mint),
        role_config: roles_pda(&mint),
        mint,
        account,
        token_program: spl_token_2022::id(),
        event_authority: stablecoin_event_authority_pda(),
        program: stablecoin::ID,
    };

    Instruction {
        program_id: stablecoin::ID,
        accounts: accounts.to_account_metas(None),
        data: stablecoin::instruction::ThawAccount {}.data(),
    }
}

pub fn token2022_ata(owner: &Pubkey, mint: &Pubkey) -> Pubkey {
    spl_associated_token_account::get_associated_token_address_with_program_id(
        owner,
        mint,
        &spl_token_2022::id(),
    )
}

pub fn create_token2022_ata_ix(payer: Pubkey, owner: Pubkey, mint: Pubkey) -> Instruction {
    spl_associated_token_account::instruction::create_associated_token_account(
        &payer,
        &owner,
        &mint,
        &spl_token_2022::id(),
    )
}

pub fn seize_ix_with_amount(
    authority: Pubkey,
    mint: Pubkey,
    from: Pubkey,
    to: Pubkey,
    victim_wallet: Pubkey,
    treasury_owner: Pubkey,
    amount: u64,
) -> Instruction {
    let mut ix = seize_ix(authority, mint, from, to, victim_wallet, treasury_owner);
    ix.data = stablecoin::instruction::Seize { amount }.data();
    ix
}

pub fn transfer_checked_with_hook_ix(
    source: Pubkey,
    mint: Pubkey,
    destination: Pubkey,
    authority: Pubkey,
    source_owner: Pubkey,
    destination_owner: Pubkey,
    amount: u64,
    decimals: u8,
) -> Instruction {
    let mut ix = spl_token_2022::instruction::transfer_checked(
        &spl_token_2022::id(),
        &source,
        &mint,
        &destination,
        &authority,
        &[],
        amount,
        decimals,
    )
    .expect("transfer_checked instruction");

    ix.accounts.extend([
        AccountMeta::new_readonly(extra_account_meta_list_pda(&mint), false),
        AccountMeta::new_readonly(hook_config_pda(), false),
        AccountMeta::new_readonly(stablecoin::ID, false),
        AccountMeta::new_readonly(config_pda(&mint), false),
        AccountMeta::new_readonly(blacklist_pda(&mint, &source_owner), false),
        AccountMeta::new_readonly(blacklist_pda(&mint, &destination_owner), false),
        AccountMeta::new_readonly(transfer_hook::ID, false),
    ]);

    ix
}

pub fn initialize_stablecoin(
    svm: &mut LiteSVM,
    authority: &Keypair,
    params: InitializeParams,
) -> solana_sdk::pubkey::Pubkey {
    let mint = Keypair::new();
    if params.enable_transfer_hook && svm.get_account(&hook_config_pda()).is_none() {
        let result = send_tx(
            svm,
            authority,
            &[initialize_hook_config_ix(authority.pubkey(), stablecoin::ID)],
            &[authority],
        );
        assert!(result.is_ok(), "initialize_hook_config should succeed: {result:?}");
    }
    let result = send_tx(
        svm,
        authority,
        &[initialize_ix(authority.pubkey(), mint.pubkey(), params)],
        &[authority, &mint],
    );
    assert!(result.is_ok(), "initialize should succeed: {result:?}");
    mint.pubkey()
}

pub fn deserialize_anchor_account<T: AccountDeserialize>(
    svm: &LiteSVM,
    pubkey: &solana_sdk::pubkey::Pubkey,
) -> T {
    let account = svm.get_account(pubkey).expect("account should exist");
    let mut data = account.data.as_slice();
    T::try_deserialize(&mut data).expect("anchor account should deserialize")
}
