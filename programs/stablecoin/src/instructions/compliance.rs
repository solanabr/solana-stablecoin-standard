use anchor_lang::prelude::*;
use anchor_lang::solana_program::program::invoke_signed;
use anchor_spl::token_interface::{freeze_account, FreezeAccount, Mint};
use anchor_spl::token_interface::{thaw_account, ThawAccount, TokenAccount, TokenInterface};
use spl_token_2022::state::AccountState;
use spl_transfer_hook_interface::onchain::add_extra_accounts_for_execute_cpi;

use sss_common::{
    MAX_REASON_LEN, SEED_BLACKLIST, SEED_CONFIG, SEED_EXTRA_ACCOUNT_METAS, SEED_ROLES,
};

use crate::errors::StablecoinError;
use crate::events::{AddressBlacklisted, AddressUnblacklisted, TokensSeized};
use crate::state::{BlacklistEntry, RoleConfig, StablecoinConfig};

#[event_cpi]
#[derive(Accounts)]
pub struct AddToBlacklist<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        seeds = [SEED_CONFIG, config.mint.as_ref()],
        bump = config.bump
    )]
    pub config: Account<'info, StablecoinConfig>,
    #[account(
        seeds = [SEED_ROLES, config.mint.as_ref()],
        bump = role_config.bump
    )]
    pub role_config: Account<'info, RoleConfig>,
    /// CHECK: Target wallet is only used as a seed and emitted in events.
    pub wallet: UncheckedAccount<'info>,
    #[account(
        init,
        payer = authority,
        space = 8 + BlacklistEntry::INIT_SPACE,
        seeds = [SEED_BLACKLIST, config.mint.as_ref(), wallet.key().as_ref()],
        bump
    )]
    pub blacklist_entry: Account<'info, BlacklistEntry>,
    pub system_program: Program<'info, System>,
}

#[event_cpi]
#[derive(Accounts)]
pub struct RemoveFromBlacklist<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        seeds = [SEED_CONFIG, config.mint.as_ref()],
        bump = config.bump
    )]
    pub config: Account<'info, StablecoinConfig>,
    #[account(
        seeds = [SEED_ROLES, config.mint.as_ref()],
        bump = role_config.bump
    )]
    pub role_config: Account<'info, RoleConfig>,
    #[account(
        mut,
        close = authority,
        seeds = [SEED_BLACKLIST, config.mint.as_ref(), blacklist_entry.wallet.as_ref()],
        bump = blacklist_entry.bump
    )]
    pub blacklist_entry: Account<'info, BlacklistEntry>,
}

#[event_cpi]
#[derive(Accounts)]
pub struct SeizeTokens<'info> {
    pub authority: Signer<'info>,
    #[account(
        mut,
        seeds = [SEED_CONFIG, mint.key().as_ref()],
        bump = config.bump
    )]
    pub config: Box<Account<'info, StablecoinConfig>>,
    #[account(
        seeds = [SEED_ROLES, mint.key().as_ref()],
        bump = role_config.bump
    )]
    pub role_config: Box<Account<'info, RoleConfig>>,
    #[account(mut)]
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(
        mut,
        token::mint = mint,
        token::token_program = token_program
    )]
    pub from: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        mut,
        token::mint = mint,
        token::token_program = token_program
    )]
    pub to: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        seeds = [SEED_BLACKLIST, mint.key().as_ref(), blacklist_entry.wallet.as_ref()],
        bump = blacklist_entry.bump
    )]
    pub blacklist_entry: Box<Account<'info, BlacklistEntry>>,
    /// CHECK: Current program id, forwarded to the transfer hook for SSS-2 seizure flows.
    #[account(address = crate::ID)]
    pub stablecoin_program: UncheckedAccount<'info>,
    /// CHECK: Transfer hook program id, validated against the configured SSS-2 deployment.
    pub transfer_hook_program: UncheckedAccount<'info>,
    /// CHECK: Hook config PDA of the transfer-hook program; required for transfer hook account resolution.
    pub hook_config: UncheckedAccount<'info>,
    /// CHECK: Validation account PDA used by the transfer hook program during delegate seizure.
    #[account(
        seeds = [SEED_EXTRA_ACCOUNT_METAS, mint.key().as_ref()],
        bump,
        seeds::program = transfer_hook_program.key()
    )]
    pub extra_account_meta_list: UncheckedAccount<'info>,
    /// CHECK: Destination blacklist PDA may be absent; only the derived address matters.
    #[account(
        seeds = [SEED_BLACKLIST, mint.key().as_ref(), to.owner.as_ref()],
        bump
    )]
    pub destination_blacklist: UncheckedAccount<'info>,
    pub token_program: Interface<'info, TokenInterface>,
}

pub fn add_to_blacklist_handler(ctx: Context<AddToBlacklist>, reason: String) -> Result<()> {
    require!(
        ctx.accounts.config.is_sss2(),
        StablecoinError::ComplianceNotEnabled
    );
    require!(
        ctx.accounts
            .role_config
            .is_blacklister(&ctx.accounts.authority.key()),
        StablecoinError::NotBlacklister
    );
    require!(
        !reason.is_empty() && reason.len() <= MAX_REASON_LEN,
        StablecoinError::InvalidUri
    );
    require!(
        ctx.accounts.wallet.key() != ctx.accounts.config.authority,
        StablecoinError::CannotBlacklistTreasury
    );

    let blacklist_entry = &mut ctx.accounts.blacklist_entry;
    blacklist_entry.mint = ctx.accounts.config.mint;
    blacklist_entry.wallet = ctx.accounts.wallet.key();
    blacklist_entry.reason = reason.clone();
    blacklist_entry.blacklisted_by = ctx.accounts.authority.key();
    blacklist_entry.blacklisted_at = Clock::get()?.unix_timestamp;
    blacklist_entry.bump = ctx.bumps.blacklist_entry;

    emit_cpi!(AddressBlacklisted {
        mint: ctx.accounts.config.mint,
        wallet: ctx.accounts.wallet.key(),
        authority: ctx.accounts.authority.key(),
        reason,
    });

    Ok(())
}

pub fn remove_from_blacklist_handler(ctx: Context<RemoveFromBlacklist>) -> Result<()> {
    require!(
        ctx.accounts.config.is_sss2(),
        StablecoinError::ComplianceNotEnabled
    );
    require!(
        ctx.accounts
            .role_config
            .is_blacklister(&ctx.accounts.authority.key()),
        StablecoinError::NotBlacklister
    );

    emit_cpi!(AddressUnblacklisted {
        mint: ctx.accounts.config.mint,
        wallet: ctx.accounts.blacklist_entry.wallet,
        authority: ctx.accounts.authority.key(),
    });

    Ok(())
}

pub fn seize_handler(ctx: Context<SeizeTokens>, amount: u64) -> Result<()> {
    require!(amount > 0, StablecoinError::ZeroAmount);
    require!(
        !ctx.accounts.config.paused,
        StablecoinError::StablecoinPaused
    );
    require!(
        ctx.accounts.config.enable_permanent_delegate,
        StablecoinError::PermanentDelegateNotEnabled
    );
    require!(
        ctx.accounts
            .role_config
            .is_seizer(&ctx.accounts.authority.key()),
        StablecoinError::NotSeizer
    );
    require!(
        ctx.accounts.blacklist_entry.mint == ctx.accounts.mint.key(),
        StablecoinError::InvalidMint
    );
    require!(
        ctx.accounts.blacklist_entry.wallet == ctx.accounts.from.owner,
        StablecoinError::InvalidBlacklistTarget
    );
    require!(
        ctx.accounts.from.state == AccountState::Frozen,
        StablecoinError::TargetAccountNotFrozen
    );
    require!(
        ctx.accounts.to.owner == ctx.accounts.config.authority,
        StablecoinError::InvalidTreasuryAccount
    );
    if ctx.accounts.config.enable_transfer_hook {
        require!(
            ctx.accounts.transfer_hook_program.key() == transfer_hook::ID,
            StablecoinError::InvalidTransferHookProgram
        );
    }

    let mint_key = ctx.accounts.mint.key();
    let signer_seeds: &[&[&[u8]]] =
        &[&[SEED_CONFIG, mint_key.as_ref(), &[ctx.accounts.config.bump]]];

    thaw_account(CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        ThawAccount {
            account: ctx.accounts.from.to_account_info(),
            mint: ctx.accounts.mint.to_account_info(),
            authority: ctx.accounts.config.to_account_info(),
        },
        signer_seeds,
    ))?;

    let mut transfer_ix = spl_token_2022::instruction::transfer_checked(
        &ctx.accounts.token_program.key(),
        &ctx.accounts.from.key(),
        &ctx.accounts.mint.key(),
        &ctx.accounts.to.key(),
        &ctx.accounts.config.key(),
        &[],
        amount,
        ctx.accounts.mint.decimals,
    )?;
    let mut transfer_accounts = vec![
        ctx.accounts.from.to_account_info(),
        ctx.accounts.mint.to_account_info(),
        ctx.accounts.to.to_account_info(),
        ctx.accounts.config.to_account_info(),
    ];
    if ctx.accounts.config.enable_transfer_hook {
        let additional_accounts = [
            ctx.accounts.extra_account_meta_list.to_account_info(),
            ctx.accounts.hook_config.to_account_info(),
            ctx.accounts.stablecoin_program.to_account_info(),
            ctx.accounts.config.to_account_info(),
            ctx.accounts.blacklist_entry.to_account_info(),
            ctx.accounts.destination_blacklist.to_account_info(),
            ctx.accounts.transfer_hook_program.to_account_info(),
        ];
        add_extra_accounts_for_execute_cpi(
            &mut transfer_ix,
            &mut transfer_accounts,
            &ctx.accounts.transfer_hook_program.key(),
            ctx.accounts.from.to_account_info(),
            ctx.accounts.mint.to_account_info(),
            ctx.accounts.to.to_account_info(),
            ctx.accounts.config.to_account_info(),
            amount,
            &additional_accounts,
        )?;
    }
    invoke_signed(&transfer_ix, &transfer_accounts, signer_seeds)?;

    freeze_account(CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        FreezeAccount {
            account: ctx.accounts.from.to_account_info(),
            mint: ctx.accounts.mint.to_account_info(),
            authority: ctx.accounts.config.to_account_info(),
        },
        signer_seeds,
    ))?;

    emit_cpi!(TokensSeized {
        mint: ctx.accounts.mint.key(),
        from: ctx.accounts.from.key(),
        to: ctx.accounts.to.key(),
        authority: ctx.accounts.authority.key(),
        amount,
    });

    Ok(())
}
