use anchor_lang::prelude::*;
use anchor_spl::token_2022::spl_token_2022::{
    extension::{
        transfer_hook::TransferHookAccount, BaseStateWithExtensions, PodStateWithExtensions,
    },
    pod::PodAccount,
};
use anchor_spl::token_interface::{Mint, TokenAccount};

use crate::error::HookError;
use crate::state::*;

#[derive(Accounts)]
pub struct TransferHookCtx<'info> {
    // ── Standard transfer hook accounts (MUST be in this exact order) ────────
    #[account(token::mint = mint)]
    pub source_token: InterfaceAccount<'info, TokenAccount>,

    pub mint: InterfaceAccount<'info, Mint>,

    #[account(token::mint = mint)]
    pub destination_token: InterfaceAccount<'info, TokenAccount>,

    /// CHECK: Source token account owner, passed by Token-2022.
    pub owner: UncheckedAccount<'info>,

    /// CHECK: ExtraAccountMetaList PDA, validated by seeds.
    #[account(
        seeds = [EXTRA_ACCOUNT_METAS_SEED, mint.key().as_ref()],
        bump,
    )]
    pub extra_account_meta_list: UncheckedAccount<'info>,

    // ── Extra accounts (must match ExtraAccountMetaList init order) ──────────
    /// CHECK: Core program ID. Passed for PDA derivation context.
    pub core_program: UncheckedAccount<'info>,

    /// CHECK: StablecoinConfig from sss-core. May be uninitialized in edge cases.
    pub stablecoin_config: UncheckedAccount<'info>,

    /// CHECK: BlacklistEntry for source owner. May not exist (= not blacklisted).
    pub source_blacklist: UncheckedAccount<'info>,

    /// CHECK: BlacklistEntry for destination owner. May not exist (= not blacklisted).
    pub destination_blacklist: UncheckedAccount<'info>,
}

/// Verify this instruction is being called as part of a token transfer,
/// not directly. Prevents manipulation of hook state via direct invocation.
fn check_is_transferring(ctx: &Context<TransferHookCtx>) -> Result<()> {
    let source_token_info = ctx.accounts.source_token.to_account_info();
    let account_data_ref = source_token_info.try_borrow_data()?;
    let account = PodStateWithExtensions::<PodAccount>::unpack(&account_data_ref)?;
    let extension = account.get_extension::<TransferHookAccount>()?;

    if !bool::from(extension.transferring) {
        return err!(HookError::IsNotCurrentlyTransferring);
    }

    Ok(())
}

/// Check if a blacklist account indicates the wallet is blacklisted.
/// Returns Ok(()) if not blacklisted, Err if blacklisted.
/// Non-existent PDAs (empty data or system-owned) are treated as "not blacklisted".
fn check_blacklist(account: &UncheckedAccount) -> Result<()> {
    // If the account doesn't exist or has no data, the wallet is not blacklisted
    if account.data_is_empty() {
        return Ok(());
    }

    // If owned by system program, it's an uninitialized PDA
    if account.owner == &anchor_lang::system_program::ID {
        return Ok(());
    }

    // Try to deserialize as BlacklistEntry
    let data = account.try_borrow_data()?;
    if data.len() < 8 {
        return Ok(());
    }

    // Check the 8-byte Anchor discriminator matches BlacklistEntry
    let expected_discriminator = BlacklistEntry::DISCRIMINATOR;
    if data[..8] != *expected_discriminator {
        return Ok(());
    }

    // Deserialize the entry
    let entry = BlacklistEntry::try_deserialize(&mut &data[..])?;
    if entry.blacklisted {
        return err!(HookError::Blacklisted);
    }

    Ok(())
}

/// Check if the stablecoin is paused by reading the config account.
/// Fail-closed: if the config is missing or malformed, block the transfer.
fn check_paused(config_account: &UncheckedAccount) -> Result<()> {
    // Fail-closed: if config doesn't exist, block the transfer.
    // A missing config indicates a misconfigured deployment — safer to block.
    if config_account.data_is_empty() {
        return err!(HookError::ContractPaused);
    }

    let data = config_account.try_borrow_data()?;

    // Fail-closed: malformed account data blocks transfers.
    if data.len() < 8 {
        return err!(HookError::ContractPaused);
    }

    // Check discriminator matches StablecoinConfig
    let expected_discriminator = sss_core::state::StablecoinConfig::DISCRIMINATOR;
    if data[..8] != *expected_discriminator {
        return err!(HookError::ContractPaused);
    }

    let config = sss_core::state::StablecoinConfig::try_deserialize(&mut &data[..])?;
    if config.paused {
        return err!(HookError::ContractPaused);
    }

    Ok(())
}

pub fn handle_transfer_hook(ctx: Context<TransferHookCtx>, _amount: u64) -> Result<()> {
    // ── 1. Verify this is a genuine transfer (not direct invocation) ────────
    check_is_transferring(&ctx)?;

    // ── 2. Check if contract is paused ──────────────────────────────────────
    check_paused(&ctx.accounts.stablecoin_config)?;

    // ── 3. Check if source owner is blacklisted ─────────────────────────────
    check_blacklist(&ctx.accounts.source_blacklist)?;

    // ── 4. Check if destination owner is blacklisted ────────────────────────
    check_blacklist(&ctx.accounts.destination_blacklist)?;

    // All checks passed — transfer proceeds
    Ok(())
}
