//! Update roles instruction

use crate::{
    constants::CONFIG_SEED, error::StablecoinError, events::RolesUpdated, state::StablecoinConfig,
};
use anchor_lang::prelude::*;

/// Update operational roles
pub fn handler(ctx: Context<UpdateRoles>, args: UpdateRolesArgs) -> Result<()> {
    let config = &mut ctx.accounts.config;
    require_master(config, &ctx.accounts.authority.key())?;

    if let Some(pauser) = args.pauser {
        config.pauser = pauser;
    }
    if let Some(burner) = args.burner {
        config.burner = burner;
    }
    if let Some(blacklister) = args.blacklister {
        config.blacklister = blacklister;
    }
    if let Some(seizer) = args.seizer {
        config.seizer = seizer;
    }
    if let Some(treasury) = args.treasury {
        config.treasury = treasury;
    }

    emit!(RolesUpdated {
        mint: config.mint,
        authority: ctx.accounts.authority.key(),
        pauser: config.pauser,
        burner: config.burner,
        blacklister: config.blacklister,
        seizer: config.seizer,
        treasury: config.treasury,
    });

    Ok(())
}

fn require_master(config: &StablecoinConfig, signer: &Pubkey) -> Result<()> {
    require_keys_eq!(
        config.master_authority,
        *signer,
        StablecoinError::Unauthorized
    );
    Ok(())
}

#[derive(Accounts)]
pub struct UpdateRoles<'info> {
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [CONFIG_SEED, mint.key().as_ref()],
        bump = config.bump,
        has_one = mint @ StablecoinError::InvalidMint
    )]
    pub config: Account<'info, StablecoinConfig>,

    /// CHECK: only used for seed derivation.
    pub mint: UncheckedAccount<'info>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct UpdateRolesArgs {
    pub pauser: Option<Pubkey>,
    pub burner: Option<Pubkey>,
    pub blacklister: Option<Pubkey>,
    pub seizer: Option<Pubkey>,
    pub treasury: Option<Pubkey>,
}
