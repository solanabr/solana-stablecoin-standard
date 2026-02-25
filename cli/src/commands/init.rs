use anchor_lang::InstructionData;
use anchor_lang::ToAccountMetas;
use anyhow::Result;
use solana_client::rpc_client::RpcClient;
use solana_sdk::instruction::Instruction;
use solana_sdk::pubkey::Pubkey;
use solana_sdk::signature::Keypair;
use solana_sdk::signer::Signer;
use solana_sdk::system_instruction;
use solana_sdk::transaction::Transaction;

use crate::config::CliContext;
use crate::utils;

pub async fn execute(
  ctx: &CliContext,
  preset: &str,
  name: &str,
  symbol: &str,
  uri: &str,
  decimals: u8,
  supply_cap: Option<u64>,
) -> Result<()> {
  let preset_u8 = utils::parse_preset(preset)?;
  let payer = ctx.payer_pubkey();

  // Generate a new mint keypair
  let mint_keypair = Keypair::new();
  let mint_pubkey = mint_keypair.pubkey();

  println!("Initializing {} stablecoin...", utils::preset_name(preset_u8));
  println!();

  // Build mint creation instructions with Token-2022 extensions
  let mint_ixs = build_mint_instructions(
    &ctx.client,
    &payer,
    &mint_pubkey,
    preset_u8,
    decimals,
  )?;

  // Derive PDAs
  let (config_pda, _) = utils::derive_config_pda(&mint_pubkey);
  let (admin_role_pda, _) = utils::derive_role_pda(&config_pda, &payer, 0); // Admin = 0

  // Build sss-core initialize instruction
  let init_args = sss_core::instructions::InitializeArgs {
    preset: preset_u8,
    name: name.to_string(),
    symbol: symbol.to_string(),
    uri: uri.to_string(),
    decimals,
    supply_cap,
  };

  let ix_data = sss_core::instruction::Initialize {
    args: init_args,
  }.data();

  let accounts = sss_core::accounts::Initialize {
    authority: payer,
    config: config_pda,
    mint: mint_pubkey,
    admin_role: admin_role_pda,
    token_program: spl_token_2022::id(),
    system_program: solana_sdk::system_program::id(),
  }.to_account_metas(None);

  let init_ix = Instruction {
    program_id: sss_core::ID,
    accounts,
    data: ix_data,
  };

  // Combine all instructions into a single transaction
  let mut all_ixs = mint_ixs;
  all_ixs.push(init_ix);

  // If SSS-2, also initialize ExtraAccountMetas for the transfer hook
  if preset_u8 == 2 {
    let (extra_metas_pda, _) = utils::derive_extra_account_metas_pda(&mint_pubkey);

    let hook_ix_data = sss_transfer_hook::instruction::InitializeExtraAccountMetas {}.data();
    let hook_accounts = sss_transfer_hook::accounts::InitializeExtraAccountMetas {
      payer,
      extra_account_metas: extra_metas_pda,
      mint: mint_pubkey,
      system_program: solana_sdk::system_program::id(),
    }.to_account_metas(None);

    let hook_ix = Instruction {
      program_id: sss_transfer_hook::ID,
      accounts: hook_accounts,
      data: hook_ix_data,
    };

    all_ixs.push(hook_ix);
  }

  let recent_blockhash = ctx.client.get_latest_blockhash()?;
  let tx = Transaction::new_signed_with_payer(
    &all_ixs,
    Some(&payer),
    &[&ctx.payer, &mint_keypair],
    recent_blockhash,
  );

  let sig = ctx.client.send_and_confirm_transaction(&tx)?;

  println!();
  utils::print_success("Stablecoin initialized successfully!");
  println!();
  utils::print_field("Mint", &mint_pubkey.to_string());
  utils::print_field("Config PDA", &config_pda.to_string());
  utils::print_field("Preset", utils::preset_name(preset_u8));
  utils::print_field("Decimals", &decimals.to_string());
  if let Some(cap) = supply_cap {
    utils::print_field("Supply Cap", &utils::format_amount(cap, decimals));
  } else {
    utils::print_field("Supply Cap", "Unlimited");
  }
  println!();
  utils::print_tx(&sig.to_string());

  Ok(())
}

/// Build Token-2022 mint creation instructions with the appropriate extensions
/// based on the preset tier.
fn build_mint_instructions(
  client: &RpcClient,
  payer: &Pubkey,
  mint: &Pubkey,
  preset: u8,
  decimals: u8,
) -> Result<Vec<Instruction>> {
  let mut ixs = Vec::new();

  // Derive the config PDA which will be the mint authority, freeze authority,
  // and permanent delegate.
  let (config_pda, _) = utils::derive_config_pda(mint);

  // All presets use these extensions:
  // - MintCloseAuthority (config PDA)
  // - PermanentDelegate (config PDA)
  // SSS-2 additionally uses TransferHook

  let mint_len = get_mint_len(preset)?;
  let lamports = client.get_minimum_balance_for_rent_exemption(mint_len)?;

  // Create the mint account
  ixs.push(system_instruction::create_account(
    payer,
    mint,
    lamports,
    mint_len as u64,
    &spl_token_2022::id(),
  ));

  // Initialize MintCloseAuthority extension
  ixs.push(
    spl_token_2022::instruction::initialize_mint_close_authority(
      &spl_token_2022::id(),
      mint,
      Some(&config_pda),
    )?,
  );

  // Initialize PermanentDelegate extension
  ixs.push(
    spl_token_2022::instruction::initialize_permanent_delegate(
      &spl_token_2022::id(),
      mint,
      &config_pda,
    )?,
  );

  // SSS-2: Initialize TransferHook extension
  if preset == 2 {
    ixs.push(
      spl_token_2022::extension::transfer_hook::instruction::initialize(
        &spl_token_2022::id(),
        mint,
        Some(config_pda),
        Some(sss_transfer_hook::ID),
      )?,
    );
  }

  // Initialize the mint itself (must come after extension init)
  ixs.push(
    spl_token_2022::instruction::initialize_mint(
      &spl_token_2022::id(),
      mint,
      &config_pda,    // mint authority
      Some(&config_pda), // freeze authority
      decimals,
    )?,
  );

  Ok(ixs)
}

/// Calculate mint account length based on preset extensions.
fn get_mint_len(preset: u8) -> Result<usize> {
  use spl_token_2022::extension::ExtensionType;

  let mut extensions = vec![
    ExtensionType::MintCloseAuthority,
    ExtensionType::PermanentDelegate,
  ];

  if preset == 2 {
    extensions.push(ExtensionType::TransferHook);
  }

  Ok(ExtensionType::try_calculate_account_len::<spl_token_2022::state::Mint>(&extensions)
    .map_err(|e| anyhow::anyhow!("Failed to calculate mint length: {}", e))?)
}
