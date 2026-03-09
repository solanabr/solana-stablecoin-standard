use anchor_lang::prelude::*;
use anchor_spl::{
    token_2022::{self, Burn, MintTo as SplMintTo, Token2022},
    token_interface::Mint,
};

use crate::error::SssError;
use crate::events::TokensSeized;
use crate::state::{Role, RoleAccount, StablecoinConfig};

#[derive(Accounts)]
pub struct Seize<'info> {
    pub seizer: Signer<'info>,

    #[account(
        mut,
        seeds = [b"sss_config", config.mint.as_ref()],
        bump = config.bump,
        has_one = mint,
    )]
    pub config: Account<'info, StablecoinConfig>,

    #[account(
        seeds = [
            b"sss_role",
            config.key().as_ref(),
            seizer.key().as_ref(),
            &[Role::Seizer.discriminant()],
        ],
        bump = role_account.bump,
        constraint = role_account.role == Role::Seizer @ SssError::Unauthorized,
    )]
    pub role_account: Account<'info, RoleAccount>,

    #[account(mut)]
    pub mint: InterfaceAccount<'info, Mint>,

    /// CHECK: Source token account to seize from
    #[account(mut)]
    pub from: UncheckedAccount<'info>,

    /// CHECK: Treasury ATA to receive minted tokens — owner validated in handler
    #[account(mut)]
    pub treasury_ata: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token2022>,
}

pub fn handler(ctx: Context<Seize>, amount: u64) -> Result<()> {
    require!(amount > 0, SssError::ZeroAmount);
    require!(!ctx.accounts.config.paused, SssError::Paused);
    require!(ctx.accounts.config.preset.has_compliance_features(), SssError::PresetFeatureUnavailable);

    // Verify the source account owner is blacklisted — seizure is only valid for blacklisted wallets
    {
        let from_data = ctx.accounts.from.try_borrow_data()?;
        require!(from_data.len() >= 64, SssError::InvalidInput);
        let from_owner = Pubkey::try_from(&from_data[32..64])
            .map_err(|_| SssError::InvalidInput)?;
        drop(from_data);

        let (hook_config_key, _) = Pubkey::find_program_address(
            &[b"hook_config", ctx.accounts.config.mint.as_ref()],
            &ctx.accounts.config.transfer_hook_program,
        );
        let (bl_pda, _) = Pubkey::find_program_address(
            &[b"blacklist", hook_config_key.as_ref(), from_owner.as_ref()],
            &ctx.accounts.config.transfer_hook_program,
        );

        let bl_account = ctx.remaining_accounts.first()
            .ok_or(SssError::BlacklistEntryRequired)?;
        require!(bl_account.key() == bl_pda, SssError::InvalidInput);
        require!(
            bl_account.lamports() > 0 && bl_account.data_len() > 0,
            SssError::NotBlacklisted
        );
    }

    // Validate treasury ATA: must be owned by Token-2022, correct mint, correct owner
    require!(
        *ctx.accounts.treasury_ata.owner == Token2022::id(),
        SssError::Unauthorized
    );
    let treasury_data = ctx.accounts.treasury_ata.try_borrow_data()?;
    require!(treasury_data.len() >= 165, SssError::Unauthorized); // min Token-2022 account size
    let ata_mint = Pubkey::try_from(&treasury_data[0..32])
        .map_err(|_| SssError::Unauthorized)?;
    require!(ata_mint == ctx.accounts.config.mint, SssError::Unauthorized);
    let ata_owner = Pubkey::try_from(&treasury_data[32..64])
        .map_err(|_| SssError::Unauthorized)?;
    require!(ata_owner == ctx.accounts.config.treasury, SssError::Unauthorized);
    drop(treasury_data);

    let config = &ctx.accounts.config;
    let cs = crate::utils::ConfigSeeds::new(config);
    let seeds = cs.as_seeds();
    let signer_seeds: &[&[&[u8]]] = &[&seeds];

    // Step 1: Check if source account is frozen, thaw if needed
    let from_frozen = crate::utils::thaw_if_frozen(
        &ctx.accounts.from.to_account_info(),
        &ctx.accounts.mint,
        &ctx.accounts.config.to_account_info(),
        &ctx.accounts.token_program,
        signer_seeds,
    )?;

    // Step 2: Burn from source (config PDA = permanent delegate)
    token_2022::burn(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Burn {
                mint: ctx.accounts.mint.to_account_info(),
                from: ctx.accounts.from.to_account_info(),
                authority: ctx.accounts.config.to_account_info(),
            },
            signer_seeds,
        ),
        amount,
    )?;

    // Step 3: Re-freeze the source account only if it was frozen before
    crate::utils::refreeze_if_was_frozen(
        from_frozen,
        &ctx.accounts.from.to_account_info(),
        &ctx.accounts.mint,
        &ctx.accounts.config.to_account_info(),
        &ctx.accounts.token_program,
        signer_seeds,
    )?;

    // Step 3.5: Thaw treasury ATA if frozen (SSS-2 DefaultAccountState::Frozen)
    // Note: treasury ATA is intentionally left thawed so treasury can move seized funds.
    crate::utils::thaw_if_frozen(
        &ctx.accounts.treasury_ata.to_account_info(),
        &ctx.accounts.mint,
        &ctx.accounts.config.to_account_info(),
        &ctx.accounts.token_program,
        signer_seeds,
    )?;

    // Step 4: Mint to treasury (config PDA = mint authority)
    token_2022::mint_to(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            SplMintTo {
                mint: ctx.accounts.mint.to_account_info(),
                to: ctx.accounts.treasury_ata.to_account_info(),
                authority: ctx.accounts.config.to_account_info(),
            },
            signer_seeds,
        ),
        amount,
    )?;

    let config = &mut ctx.accounts.config;
    config.total_burned = config
        .total_burned
        .checked_add(amount)
        .ok_or(SssError::Overflow)?;
    config.total_minted = config
        .total_minted
        .checked_add(amount)
        .ok_or(SssError::Overflow)?;
    config.total_seized = config
        .total_seized
        .checked_add(amount)
        .ok_or(SssError::Overflow)?;

    emit!(TokensSeized {
        config: config.key(),
        mint: config.mint,
        from: ctx.accounts.from.key(),
        amount,
        treasury: config.treasury,
        seizer: ctx.accounts.seizer.key(),
    });

    Ok(())
}
