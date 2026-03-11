use anchor_lang::prelude::*;
use anchor_lang::solana_program::{instruction::{AccountMeta, Instruction}, program::invoke_signed};

use crate::state::*;
use crate::errors::SSSError;
use crate::events::OwnershipTransferEvent;

// ============ Transfer Ownership (two-step) ============

#[derive(Accounts)]
pub struct TransferOwnership<'info> {
    pub owner: Signer<'info>,

    #[account(
        mut,
        seeds = [b"config", config.mint.as_ref()],
        bump = config.bump,
        constraint = config.owner == owner.key() @ SSSError::Unauthorized,
    )]
    pub config: Account<'info, StablecoinConfig>,
}

pub fn transfer_ownership_handler(
    ctx: Context<TransferOwnership>,
    new_owner: Pubkey,
) -> Result<()> {
    ctx.accounts.config.pending_owner = Some(new_owner);
    Ok(())
}

// ============ Accept Ownership ============

#[derive(Accounts)]
pub struct AcceptOwnership<'info> {
    pub new_owner: Signer<'info>,

    #[account(
        mut,
        seeds = [b"config", config.mint.as_ref()],
        bump = config.bump,
        constraint = config.pending_owner.is_some() @ SSSError::NoPendingOwner,
        constraint = config.pending_owner == Some(new_owner.key()) @ SSSError::PendingOwnerMismatch,
    )]
    pub config: Account<'info, StablecoinConfig>,
}

pub fn accept_ownership_handler(ctx: Context<AcceptOwnership>) -> Result<()> {
    let config = &mut ctx.accounts.config;
    let old_owner = config.owner;
    config.owner = ctx.accounts.new_owner.key();
    config.pending_owner = None;

    emit!(OwnershipTransferEvent {
        mint: config.mint,
        from: old_owner,
        to: config.owner,
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}

// ============ Approve Confidential Account (SSS-3) ============

#[derive(Accounts)]
pub struct ApproveConfidential<'info> {
    pub authority: Signer<'info>,

    #[account(
        seeds = [b"config", config.mint.as_ref()],
        bump = config.bump,
        constraint = (config.owner == authority.key() || config.blacklister == authority.key()) @ SSSError::Unauthorized,
        constraint = config.enable_confidential_transfers @ SSSError::FeatureNotEnabled,
    )]
    pub config: Account<'info, StablecoinConfig>,

    /// CHECK: The mint
    pub mint: UncheckedAccount<'info>,

    /// CHECK: PDA that is the confidential transfer authority
    #[account(
        seeds = [b"authority", config.mint.as_ref()],
        bump,
    )]
    pub mint_authority: UncheckedAccount<'info>,

    /// CHECK: The token account to approve for confidential transfers
    #[account(mut)]
    pub token_account: UncheckedAccount<'info>,

    /// CHECK: Token-2022 program
    pub token_program: UncheckedAccount<'info>,
}

pub fn approve_confidential_handler(ctx: Context<ApproveConfidential>) -> Result<()> {
    let mint_key = ctx.accounts.config.mint;
    let bump = ctx.bumps.mint_authority;
    let signer_seeds: &[&[&[u8]]] = &[&[b"authority", mint_key.as_ref(), &[bump]]];

    // Build ApproveAccount instruction manually
    // Accounts: [writable] token_account, [] mint, [signer] authority
    let accounts = vec![
        AccountMeta::new(ctx.accounts.token_account.key(), false),
        AccountMeta::new_readonly(ctx.accounts.mint.key(), false),
        AccountMeta::new_readonly(ctx.accounts.mint_authority.key(), true),
    ];

    // Data: ConfidentialTransferExtension instruction tag (26) + ApproveAccount sub-instruction (1)
    let mut data = spl_token_2022::instruction::TokenInstruction::ConfidentialTransferExtension.pack();
    data.push(1); // ApproveAccount = 1

    let ix = Instruction {
        program_id: ctx.accounts.token_program.key(),
        accounts,
        data,
    };

    invoke_signed(
        &ix,
        &[
            ctx.accounts.token_account.to_account_info(),
            ctx.accounts.mint.to_account_info(),
            ctx.accounts.mint_authority.to_account_info(),
        ],
        signer_seeds,
    )?;

    Ok(())
}
