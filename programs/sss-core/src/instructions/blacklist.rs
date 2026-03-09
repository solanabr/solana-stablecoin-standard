use anchor_lang::prelude::*;

use crate::error::SssError;
use crate::events::WalletBlacklisted;
use crate::state::StablecoinConfig;

/// Anchor discriminator for global:add_to_blacklist (sha256("global:add_to_blacklist")[..8])
const ADD_TO_BLACKLIST_DISC: [u8; 8] = [90, 115, 98, 231, 173, 119, 117, 176];

#[derive(Accounts)]
#[instruction(wallet: Pubkey)]
pub struct Blacklist<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        constraint = admin.key() == config.admin @ SssError::Unauthorized,
    )]
    pub admin: Signer<'info>,

    #[account(
        seeds = [b"sss_config", config.mint.as_ref()],
        bump = config.bump,
    )]
    pub config: Account<'info, StablecoinConfig>,

    /// CHECK: HookConfig PDA on the transfer hook program
    pub hook_config: UncheckedAccount<'info>,

    /// CHECK: BlacklistEntry PDA to be created on the transfer hook program
    #[account(mut)]
    pub blacklist_entry: UncheckedAccount<'info>,

    /// CHECK: The transfer hook program
    #[account(
        constraint = transfer_hook_program.key() == config.transfer_hook_program @ SssError::Unauthorized,
    )]
    pub transfer_hook_program: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<Blacklist>, wallet: Pubkey) -> Result<()> {
    // Note: blacklist/unblacklist are exempt from pause checks — compliance must operate during emergencies
    let config = &ctx.accounts.config;

    // Only SSS-2/SSS-3 have compliance features
    require!(config.preset.has_compliance_features(), SssError::PresetFeatureUnavailable);

    // Prevent blacklisting admin, pending_admin, or treasury — would brick the stablecoin
    require!(wallet != config.admin, SssError::CannotBlacklistProtectedAddress);
    require!(wallet != config.treasury, SssError::CannotBlacklistProtectedAddress);
    if config.pending_admin != Pubkey::default() {
        require!(wallet != config.pending_admin, SssError::CannotBlacklistProtectedAddress);
    }
    let cs = crate::utils::ConfigSeeds::new(config);
    let seeds = cs.as_seeds();
    let signer_seeds: &[&[&[u8]]] = &[&seeds];

    // Build the CPI instruction to sss-transfer-hook::add_to_blacklist
    let mut ix_data = ADD_TO_BLACKLIST_DISC.to_vec();
    ix_data.extend_from_slice(&wallet.to_bytes());

    let ix = anchor_lang::solana_program::instruction::Instruction {
        program_id: ctx.accounts.transfer_hook_program.key(),
        accounts: vec![
            anchor_lang::solana_program::instruction::AccountMeta::new(ctx.accounts.payer.key(), true),
            anchor_lang::solana_program::instruction::AccountMeta::new_readonly(ctx.accounts.config.key(), true), // authority = config PDA
            anchor_lang::solana_program::instruction::AccountMeta::new_readonly(ctx.accounts.hook_config.key(), false),
            anchor_lang::solana_program::instruction::AccountMeta::new(ctx.accounts.blacklist_entry.key(), false),
            anchor_lang::solana_program::instruction::AccountMeta::new_readonly(ctx.accounts.system_program.key(), false),
        ],
        data: ix_data,
    };

    anchor_lang::solana_program::program::invoke_signed(
        &ix,
        &[
            ctx.accounts.payer.to_account_info(),
            ctx.accounts.config.to_account_info(),
            ctx.accounts.hook_config.to_account_info(),
            ctx.accounts.blacklist_entry.to_account_info(),
            ctx.accounts.system_program.to_account_info(),
        ],
        signer_seeds,
    )?;

    emit!(WalletBlacklisted {
        config: ctx.accounts.config.key(),
        wallet,
        blacklisted_by: ctx.accounts.admin.key(),
    });

    Ok(())
}
