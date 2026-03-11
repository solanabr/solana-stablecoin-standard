use anchor_lang::prelude::*;

pub mod errors;
pub mod events;
pub mod instructions;
pub mod state;

use instructions::*;
use state::*;

declare_id!("SSSW3EixhrbB6yYpTdKmH2nCReqsA1VJqJkhwvcdzLA");

#[program]
pub mod stablecoin {
    use super::*;

    /// Initialize a new stablecoin with Token-2022 extensions based on preset
    pub fn initialize(ctx: Context<Initialize>, params: InitializeParams) -> Result<()> {
        instructions::initialize::handler(ctx, params)
    }

    /// Mint tokens (requires active minter with sufficient allowance)
    pub fn mint_tokens(ctx: Context<MintTokens>, amount: u64) -> Result<()> {
        instructions::mint::handler(ctx, amount)
    }

    /// Burn tokens from caller's account
    pub fn burn_tokens(ctx: Context<BurnTokens>, amount: u64) -> Result<()> {
        instructions::burn::handler(ctx, amount)
    }

    /// Freeze a token account
    pub fn freeze_account(ctx: Context<FreezeTokenAccount>) -> Result<()> {
        instructions::freeze::freeze_handler(ctx)
    }

    /// Thaw a frozen token account
    pub fn thaw_account(ctx: Context<ThawTokenAccount>) -> Result<()> {
        instructions::freeze::thaw_handler(ctx)
    }

    /// Pause all transfers
    pub fn pause(ctx: Context<Pause>) -> Result<()> {
        instructions::pause::pause_handler(ctx)
    }

    /// Unpause transfers
    pub fn unpause(ctx: Context<Unpause>) -> Result<()> {
        instructions::pause::unpause_handler(ctx)
    }

    /// Add address to blacklist (SSS-2 only)
    pub fn blacklist_add(ctx: Context<BlacklistAdd>, reason: String) -> Result<()> {
        instructions::blacklist::blacklist_add_handler(ctx, reason)
    }

    /// Remove address from blacklist (SSS-2 only)
    pub fn blacklist_remove(ctx: Context<BlacklistRemove>) -> Result<()> {
        instructions::blacklist::blacklist_remove_handler(ctx)
    }

    /// Seize tokens from a blacklisted account (SSS-2 only, owner only)
    pub fn seize<'a, 'b, 'c, 'info>(ctx: Context<'a, 'b, 'c, 'info, Seize<'info>>, amount: u64) -> Result<()> {
        instructions::seize::handler(ctx, amount)
    }

    /// Assign a role
    pub fn assign_role(ctx: Context<AssignRole>, role: Role, assignee: Pubkey) -> Result<()> {
        instructions::roles::assign_role_handler(ctx, role, assignee)
    }

    /// Revoke a role
    pub fn revoke_role(ctx: Context<RevokeRole>, role: Role, assignee: Pubkey) -> Result<()> {
        instructions::roles::revoke_role_handler(ctx, role, assignee)
    }

    /// Add a minter with allowance
    pub fn add_minter(ctx: Context<AddMinter>, minter: Pubkey, allowance: u64) -> Result<()> {
        instructions::roles::add_minter_handler(ctx, minter, allowance)
    }

    /// Remove a minter
    pub fn remove_minter(ctx: Context<RemoveMinter>) -> Result<()> {
        instructions::roles::remove_minter_handler(ctx)
    }

    /// Update a minter's allowance
    pub fn update_minter_allowance(
        ctx: Context<UpdateMinterAllowance>,
        new_allowance: u64,
    ) -> Result<()> {
        instructions::roles::update_minter_allowance_handler(ctx, new_allowance)
    }

    /// Transfer ownership (step 1 of 2)
    pub fn transfer_ownership(
        ctx: Context<TransferOwnership>,
        new_owner: Pubkey,
    ) -> Result<()> {
        instructions::configure::transfer_ownership_handler(ctx, new_owner)
    }

    /// Accept ownership (step 2 of 2)
    pub fn accept_ownership(ctx: Context<AcceptOwnership>) -> Result<()> {
        instructions::configure::accept_ownership_handler(ctx)
    }

    /// Approve a token account for confidential transfers (SSS-3 only)
    pub fn approve_confidential_account(ctx: Context<ApproveConfidential>) -> Result<()> {
        instructions::configure::approve_confidential_handler(ctx)
    }
}
