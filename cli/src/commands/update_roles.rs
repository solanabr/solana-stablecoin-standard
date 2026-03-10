use std::{rc::Rc, str::FromStr};

use anchor_client::{Client, Cluster};
use anyhow::{Context, Result};
use clap::Args;
use solana_sdk::{
    commitment_config::CommitmentConfig, pubkey::Pubkey, signer::Signer,
    sysvar,
};
use solana_system_interface::program::ID as SYSTEM_PROGRAM_ID;

use crate::{
    config::CliConfig,
    pda,
    program_client::{accounts, args, event_authority, sss, PROGRAM_ID},
};

#[derive(Args)]
pub struct UpdateRolesArgs {
    /// Role to assign: burner | pauser | blacklister | seizer
    #[arg(long)]
    pub role: String,
    /// New holder address for the role
    #[arg(long)]
    pub new_key: String,
    /// Previous holder address (required to close old PDA; omit if adding new)
    #[arg(long)]
    pub old_key: Option<String>,
    /// Minting allowance (only for role = minter)
    #[arg(long, default_value_t = 0)]
    pub allowance: u64,
}

pub async fn run(cfg: CliConfig, ua: UpdateRolesArgs) -> Result<()> {
    let new_key = Pubkey::from_str(&ua.new_key)
        .with_context(|| format!("Invalid --new-key: {}", ua.new_key))?;
    let old_key = ua
        .old_key
        .as_deref()
        .map(|s| Pubkey::from_str(s).with_context(|| format!("Invalid --old-key: {s}")))
        .transpose()?;

    let signer = Rc::new(cfg.keypair);
    let signer_pubkey = signer.pubkey();
    let mint = cfg.mint.expect("mint required");

    let (master_role, _) = pda::master_role_pda(&PROGRAM_ID, &mint, &signer_pubkey);

    // Build remaining accounts (old PDA first if closing, then new PDA)
    let role_seed = role_seed(&ua.role)?;
    let mut remaining: Vec<solana_sdk::instruction::AccountMeta> = vec![];

    if let Some(old) = old_key {
        let (old_pda, _) = pda::role_pda(&PROGRAM_ID, &mint, role_seed, &old);
        remaining.push(solana_sdk::instruction::AccountMeta::new(old_pda, false));
    }

    let (new_pda, _) = pda::role_pda(&PROGRAM_ID, &mint, role_seed, &new_key);
    remaining.push(solana_sdk::instruction::AccountMeta::new(new_pda, false));

    let update = sss::types::UpdateRole {
        role: ua.role.clone(),
        old_key,
        new_key,
        allowance: ua.allowance,
    };

    let client = Client::new_with_options(
        Cluster::Custom(cfg.rpc_url.clone(), cfg.rpc_url),
        signer.clone(),
        CommitmentConfig::confirmed(),
    );
    let program = client.program(PROGRAM_ID)?;

    let sig = program
        .request()
        .accounts(accounts::UpdateRoles {
            master: signer_pubkey,
            mint,
            master_role,
            system_program: Pubkey::from_str(&SYSTEM_PROGRAM_ID.to_string())?,
            rent: sysvar::rent::ID,
            event_authority: event_authority(),
            program: PROGRAM_ID,
        })
        .args(args::UpdateRoles { roles: vec![update] })
        .accounts(remaining)
        .send()
        .await?;

    println!("Updated role '{}' -> {}", ua.role, new_key);
    println!("Tx: {}", sig);
    Ok(())
}

fn role_seed(role: &str) -> Result<&'static [u8]> {
    match role {
        "master" => Ok(pda::MASTER_ROLE),
        "minter" => Ok(pda::MINTER_ROLE),
        "burner" => Ok(pda::BURNER_ROLE),
        "pauser" => Ok(pda::PAUSER_ROLE),
        "blacklister" => Ok(pda::BLACKLISTER_ROLE),
        "seizer" => Ok(pda::SEIZER_ROLE),
        _ => anyhow::bail!("Unknown role '{}'. Valid: master|minter|burner|pauser|blacklister|seizer", role),
    }
}
