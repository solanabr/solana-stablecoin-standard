use anchor_lang::prelude::*;

pub mod constants;
pub mod error;
pub mod events;
pub mod instructions;
pub mod state;

use instructions::*;

declare_id!("Corep3pXJzUGaqpw2xzWQi4q63cn1STABiCDMJhMECB");

#[program]
pub mod sss_core {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>, args: InitializeArgs) -> Result<()> {
        instructions::initialize::handler_initialize(ctx, args)
    }

    pub fn mint_tokens(ctx: Context<MintTokens>, amount: u64) -> Result<()> {
        instructions::mint_tokens::handler_mint_tokens(ctx, amount)
    }

    pub fn burn_tokens(ctx: Context<BurnTokens>, amount: u64) -> Result<()> {
        instructions::burn_tokens::handler_burn_tokens(ctx, amount)
    }

    pub fn freeze_account(ctx: Context<FreezeTokenAccount>) -> Result<()> {
        instructions::freeze_account::handler_freeze_account(ctx)
    }

    pub fn thaw_account(ctx: Context<ThawTokenAccount>) -> Result<()> {
        instructions::thaw_account::handler_thaw_account(ctx)
    }

    pub fn pause(ctx: Context<Pause>) -> Result<()> {
        instructions::pause::handler_pause(ctx)
    }

    pub fn unpause(ctx: Context<Unpause>) -> Result<()> {
        instructions::unpause::handler_unpause(ctx)
    }

    pub fn seize(ctx: Context<Seize>, amount: u64) -> Result<()> {
        instructions::seize::handler_seize(ctx, amount)
    }

    pub fn grant_role(ctx: Context<GrantRole>, role: u8) -> Result<()> {
        instructions::manage_roles::handler_grant(ctx, role)
    }

    pub fn revoke_role(ctx: Context<RevokeRole>) -> Result<()> {
        instructions::manage_roles::handler_revoke(ctx)
    }

    pub fn update_supply_cap(
        ctx: Context<UpdateSupplyCap>,
        new_supply_cap: Option<u64>,
    ) -> Result<()> {
        instructions::update_config::handler_update_supply_cap(ctx, new_supply_cap)
    }
}
