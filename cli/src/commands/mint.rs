use crate::config::CliConfig;
use crate::pda::{get_blacklist_pda, get_config_pda, get_minter_info_pda, SSS_TOKEN_PROGRAM_ID};
use anchor_lang::{InstructionData, ToAccountMetas};
use anyhow::Result;
use clap::Args;
use solana_sdk::{pubkey::Pubkey, signer::Signer, transaction::Transaction};

#[derive(Args)]
pub struct MintArgs {
    #[arg(long)]
    pub mint: Pubkey,
    #[arg(long)]
    pub amount: u64,
    #[arg(long)]
    pub recipient: Pubkey,
}

pub fn execute(config: &CliConfig, args: &MintArgs) -> Result<()> {
    let (config_pda, _) = get_config_pda(&args.mint);
    let (minter_info_pda, _) = get_minter_info_pda(&config_pda, &config.payer.pubkey());
    let (recipient_blacklist_pda, _) = get_blacklist_pda(&config_pda, &args.recipient);
    let recipient_token_account = get_associated_token_account_2022(&args.recipient, &args.mint);

    let accounts = sss_token::accounts::MintTokens {
        minter_authority: config.payer.pubkey(),
        config: config_pda,
        minter_info: minter_info_pda,
        mint: args.mint,
        recipient_token_account,
        recipient_blacklist: recipient_blacklist_pda,
        token_program: spl_token_2022_id(),
    }
    .to_account_metas(None);

    let ix_data = sss_token::instruction::MintTokens {
        amount: args.amount,
    }
    .data();

    let ix = solana_sdk::instruction::Instruction {
        program_id: SSS_TOKEN_PROGRAM_ID,
        accounts,
        data: ix_data,
    };

    let recent_blockhash = config.rpc_client.get_latest_blockhash()?;
    let tx = Transaction::new_signed_with_payer(
        &[ix],
        Some(&config.payer.pubkey()),
        &[&config.payer],
        recent_blockhash,
    );

    let sig = config.rpc_client.send_and_confirm_transaction(&tx)?;
    println!("Minted {} tokens. Signature: {}", args.amount, sig);

    Ok(())
}

fn spl_token_2022_id() -> Pubkey {
    solana_sdk::pubkey!("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb")
}

fn get_associated_token_account_2022(owner: &Pubkey, mint: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(
        &[owner.as_ref(), spl_token_2022_id().as_ref(), mint.as_ref()],
        &associated_token_program_id(),
    )
    .0
}

fn associated_token_program_id() -> Pubkey {
    solana_sdk::pubkey!("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL")
}
