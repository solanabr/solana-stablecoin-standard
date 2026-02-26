use anyhow::Result;
use solana_sdk::transaction::Transaction;
use solana_zk_sdk::encryption::{
  auth_encryption::AeKey,
  elgamal::ElGamalKeypair,
};
use spl_token_2022::extension::confidential_transfer::{
  account_info::ApplyPendingBalanceAccountInfo,
  instruction as ct_instruction,
  ConfidentialTransferAccount, DecryptableBalance,
};
use spl_token_2022::extension::BaseStateWithExtensions;
use spl_token_2022::state::Account as TokenAccount;
use spl_token_confidential_transfer_proof_extraction::instruction::{
  ProofData, ProofLocation,
};

use crate::config::CliContext;
use crate::ConfidentialAction;
use crate::utils;

pub async fn execute(ctx: &CliContext, action: ConfidentialAction) -> Result<()> {
  match action {
    ConfidentialAction::ConfigureAccount { mint, account } => {
      configure_account(ctx, &mint, &account).await
    }
    ConfidentialAction::Deposit { mint, account, amount, decimals } => {
      deposit(ctx, &mint, &account, amount, decimals).await
    }
    ConfidentialAction::ApplyPending { mint, account } => {
      apply_pending(ctx, &mint, &account).await
    }
    ConfidentialAction::Transfer => {
      println!();
      println!("Confidential transfer requires ZK proof generation (solana-zk-sdk).");
      println!("The proof generation involves split range proofs across multiple");
      println!("transactions, which is best handled by the TypeScript SDK.");
      println!();
      println!("Use the TypeScript SDK for this operation:");
      println!("  import {{ SSS3Client }} from '@stbr/sss-token';");
      println!("  await client.confidentialTransfer(mint, from, to, amount);");
      println!();
      Ok(())
    }
    ConfidentialAction::Withdraw => {
      println!();
      println!("Confidential withdraw requires ZK proof generation (solana-zk-sdk).");
      println!("The proof generation involves range proofs and ciphertext validity");
      println!("proofs, which is best handled by the TypeScript SDK.");
      println!();
      println!("Use the TypeScript SDK for this operation:");
      println!("  import {{ SSS3Client }} from '@stbr/sss-token';");
      println!("  await client.confidentialWithdraw(mint, account, amount);");
      println!();
      Ok(())
    }
  }
}

/// Configure a token account for confidential transfers.
///
/// Derives an ElGamal keypair from the payer's Solana keypair, generates the
/// required pubkey validity proof, and submits the ConfigureAccount instruction.
async fn configure_account(
  ctx: &CliContext,
  mint_str: &str,
  account_str: &str,
) -> Result<()> {
  let mint = utils::parse_pubkey(mint_str)?;
  let token_account = utils::parse_pubkey(account_str)?;
  let payer = ctx.payer_pubkey();

  // Derive ElGamal keypair from the Solana signer.
  // This is deterministic: same Solana keypair always produces the same ElGamal keypair.
  let elgamal_keypair = ElGamalKeypair::new_from_signer(&ctx.payer, &token_account.to_bytes())
    .map_err(|e| anyhow::anyhow!("Failed to derive ElGamal keypair: {}", e))?;

  // Derive AES key for authenticated encryption of decryptable balances.
  let aes_key = AeKey::new_from_signer(&ctx.payer, &token_account.to_bytes())
    .map_err(|e| anyhow::anyhow!("Failed to derive AES key: {}", e))?;

  // The initial decryptable balance is an encryption of zero.
  let decryptable_zero_balance: DecryptableBalance = aes_key.encrypt(0_u64).into();

  // Generate the pubkey validity proof data.
  let proof_data = ct_instruction::PubkeyValidityProofData::new(&elgamal_keypair)
    .map_err(|e| anyhow::anyhow!("Failed to generate pubkey validity proof: {:?}", e))?;

  // Maximum pending balance credit counter — use the default.
  let max_pending_credits =
    spl_token_2022::extension::confidential_transfer::DEFAULT_MAXIMUM_PENDING_BALANCE_CREDIT_COUNTER;

  // Build the ConfigureAccount instructions (includes the verify proof ix).
  let proof_location = ProofLocation::InstructionOffset(
    1i8.try_into().map_err(|_| anyhow::anyhow!("Invalid proof offset"))?,
    ProofData::InstructionData(&proof_data),
  );

  let ixs = ct_instruction::configure_account(
    &spl_token_2022::id(),
    &token_account,
    &mint,
    &decryptable_zero_balance,
    max_pending_credits,
    &payer,
    &[],
    proof_location,
  )
  .map_err(|e| anyhow::anyhow!("Failed to build ConfigureAccount instruction: {}", e))?;

  let recent_blockhash = ctx.client.get_latest_blockhash()?;
  let tx = Transaction::new_signed_with_payer(
    &ixs,
    Some(&payer),
    &[&ctx.payer],
    recent_blockhash,
  );

  let sig = ctx.client.send_and_confirm_transaction(&tx)?;

  utils::print_success("Configured account for confidential transfers");
  utils::print_field("Mint", mint_str);
  utils::print_field("Token Account", account_str);
  println!();
  utils::print_tx(&sig.to_string());

  Ok(())
}

/// Deposit tokens from the public balance into the confidential pending balance.
///
/// This moves tokens from the non-confidential (visible) balance to the
/// encrypted pending balance. After depositing, call `apply-pending` to make
/// the funds available for confidential transfers.
async fn deposit(
  ctx: &CliContext,
  mint_str: &str,
  account_str: &str,
  amount: u64,
  decimals: u8,
) -> Result<()> {
  let mint = utils::parse_pubkey(mint_str)?;
  let token_account = utils::parse_pubkey(account_str)?;
  let payer = ctx.payer_pubkey();

  let ix = ct_instruction::deposit(
    &spl_token_2022::id(),
    &token_account,
    &mint,
    amount,
    decimals,
    &payer,
    &[],
  )
  .map_err(|e| anyhow::anyhow!("Failed to build Deposit instruction: {}", e))?;

  let recent_blockhash = ctx.client.get_latest_blockhash()?;
  let tx = Transaction::new_signed_with_payer(
    &[ix],
    Some(&payer),
    &[&ctx.payer],
    recent_blockhash,
  );

  let sig = ctx.client.send_and_confirm_transaction(&tx)?;

  utils::print_success(&format!("Deposited {} tokens to confidential balance", amount));
  utils::print_field("Mint", mint_str);
  utils::print_field("Token Account", account_str);
  println!();
  utils::print_tx(&sig.to_string());

  Ok(())
}

/// Apply the pending confidential balance to the available balance.
///
/// Reads the on-chain account state to get the current pending balance credit
/// counter and encrypted balances, then decrypts them using the ElGamal keypair
/// derived from the payer's Solana keypair.
async fn apply_pending(
  ctx: &CliContext,
  mint_str: &str,
  account_str: &str,
) -> Result<()> {
  // Validate mint address format (used for display output).
  let _mint = utils::parse_pubkey(mint_str)?;
  let token_account = utils::parse_pubkey(account_str)?;
  let payer = ctx.payer_pubkey();

  // Derive encryption keys from the Solana signer (same derivation as configure-account).
  let elgamal_keypair = ElGamalKeypair::new_from_signer(&ctx.payer, &token_account.to_bytes())
    .map_err(|e| anyhow::anyhow!("Failed to derive ElGamal keypair: {}", e))?;
  let aes_key = AeKey::new_from_signer(&ctx.payer, &token_account.to_bytes())
    .map_err(|e| anyhow::anyhow!("Failed to derive AES key: {}", e))?;

  // Fetch the on-chain token account to read the confidential transfer extension state.
  let account_data = ctx.client.get_account(&token_account)
    .map_err(|e| anyhow::anyhow!("Failed to fetch token account: {}", e))?;

  let token_account_state =
    spl_token_2022::extension::StateWithExtensionsOwned::<TokenAccount>::unpack(account_data.data)
      .map_err(|e| anyhow::anyhow!("Failed to unpack token account: {}", e))?;

  let ct_extension = token_account_state
    .get_extension::<ConfidentialTransferAccount>()
    .map_err(|e| anyhow::anyhow!(
      "Token account does not have confidential transfer extension: {}", e
    ))?;

  // Build the account info helper from on-chain state.
  let account_info = ApplyPendingBalanceAccountInfo::new(ct_extension);
  let pending_credit_counter = account_info.pending_balance_credit_counter();

  // Compute the new decryptable available balance by decrypting pending balances
  // and adding them to the current available balance.
  let new_decryptable_balance: DecryptableBalance = account_info
    .new_decryptable_available_balance(elgamal_keypair.secret(), &aes_key)
    .map_err(|e| anyhow::anyhow!("Failed to compute new decryptable balance: {:?}", e))?
    .into();

  let ix = ct_instruction::apply_pending_balance(
    &spl_token_2022::id(),
    &token_account,
    pending_credit_counter,
    &new_decryptable_balance,
    &payer,
    &[],
  )
  .map_err(|e| anyhow::anyhow!("Failed to build ApplyPendingBalance instruction: {}", e))?;

  let recent_blockhash = ctx.client.get_latest_blockhash()?;
  let tx = Transaction::new_signed_with_payer(
    &[ix],
    Some(&payer),
    &[&ctx.payer],
    recent_blockhash,
  );

  let sig = ctx.client.send_and_confirm_transaction(&tx)?;

  utils::print_success("Applied pending balance to available confidential balance");
  utils::print_field("Mint", mint_str);
  utils::print_field("Token Account", account_str);
  utils::print_field("Credit Counter", &pending_credit_counter.to_string());
  println!();
  utils::print_tx(&sig.to_string());

  Ok(())
}
