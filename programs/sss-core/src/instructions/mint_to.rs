use anchor_lang::prelude::*;
use anchor_spl::{
    token_2022::{self, MintTo as SplMintTo, Token2022},
    token_interface::Mint,
};

use crate::error::SssError;
use crate::events::TokensMinted;
use crate::state::{RoleAccount, Role, StablecoinConfig};

#[derive(Accounts)]
pub struct MintTo<'info> {
    pub minter: Signer<'info>,

    #[account(
        mut,
        seeds = [b"sss_config", config.mint.as_ref()],
        bump = config.bump,
        has_one = mint,
    )]
    pub config: Account<'info, StablecoinConfig>,

    #[account(
        mut,
        seeds = [
            b"sss_role",
            config.key().as_ref(),
            minter.key().as_ref(),
            &[Role::Minter.discriminant()],
        ],
        bump = role_account.bump,
        constraint = role_account.role == Role::Minter @ SssError::Unauthorized,
    )]
    pub role_account: Account<'info, RoleAccount>,

    #[account(mut)]
    pub mint: InterfaceAccount<'info, Mint>,

    /// CHECK: Token account to mint to, validated by token program CPI
    #[account(mut)]
    pub to: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token2022>,
}

pub fn handler(ctx: Context<MintTo>, amount: u64) -> Result<()> {
    require!(amount > 0, SssError::ZeroAmount);
    require!(!ctx.accounts.config.paused, SssError::Paused);

    // For SSS-2/SSS-3: check that the destination wallet owner is not blacklisted.
    // Caller must pass the blacklist entry PDA as the first remaining account.
    if ctx.accounts.config.preset.has_compliance_features() {
        let to_data = ctx.accounts.to.try_borrow_data()?;
        require!(to_data.len() >= 64, SssError::InvalidInput);
        let to_owner = Pubkey::try_from(&to_data[32..64]).unwrap();
        drop(to_data);

        let (hook_config_key, _) = Pubkey::find_program_address(
            &[b"hook_config", ctx.accounts.config.mint.as_ref()],
            &ctx.accounts.config.transfer_hook_program,
        );
        let (bl_pda, _) = Pubkey::find_program_address(
            &[b"blacklist", hook_config_key.as_ref(), to_owner.as_ref()],
            &ctx.accounts.config.transfer_hook_program,
        );

        let bl_account = ctx.remaining_accounts.first()
            .ok_or(SssError::BlacklistEntryRequired)?;
        require!(bl_account.key() == bl_pda, SssError::InvalidInput);
        if bl_account.lamports() > 0 && bl_account.data_len() > 0 {
            return Err(SssError::Blacklisted.into());
        }
    }

    // Decrement allowance — always enforced, allowance=0 means no remaining allowance
    let role_account = &mut ctx.accounts.role_account;
    require!(amount <= role_account.allowance, SssError::AllowanceExceeded);
    role_account.allowance = role_account.allowance.checked_sub(amount).ok_or(SssError::Overflow)?;

    let config = &ctx.accounts.config;
    let cs = crate::utils::ConfigSeeds::new(config);
    let seeds = cs.as_seeds();
    let signer_seeds: &[&[&[u8]]] = &[&seeds];

    // For SSS-2/SSS-3 (DefaultAccountState::Frozen), thaw the destination account
    // before minting so the mint CPI doesn't fail on frozen accounts.
    // Note: destination is intentionally left thawed after minting so the recipient can use tokens.
    // Compliance officer can explicitly freeze if needed.
    if config.preset.has_compliance_features() {
        crate::utils::thaw_if_frozen(
            &ctx.accounts.to.to_account_info(),
            &ctx.accounts.mint,
            &ctx.accounts.config.to_account_info(),
            &ctx.accounts.token_program,
            signer_seeds,
        )?;
    }

    token_2022::mint_to(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            SplMintTo {
                mint: ctx.accounts.mint.to_account_info(),
                to: ctx.accounts.to.to_account_info(),
                authority: ctx.accounts.config.to_account_info(),
            },
            signer_seeds,
        ),
        amount,
    )?;

    let config = &mut ctx.accounts.config;
    config.total_minted = config
        .total_minted
        .checked_add(amount)
        .ok_or(SssError::Overflow)?;

    emit!(TokensMinted {
        config: config.key(),
        mint: config.mint,
        to: ctx.accounts.to.key(),
        amount,
        minter: ctx.accounts.minter.key(),
        remaining_allowance: ctx.accounts.role_account.allowance,
    });

    Ok(())
}
