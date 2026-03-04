use anchor_lang::prelude::*;

declare_id!("6XUKT63WZFKU8Lvgydv9XeczoigNhag1JtvqkmV7nf47");

pub mod error;
pub mod instructions;
pub mod state;

use instructions::*;

#[program]
pub mod transfer_hook {
    use super::*;

    /// Initialize the ExtraAccountMetaList PDA for a mint.
    /// Must be called after the mint is created with TransferHook extension
    /// and before any token transfers occur.
    /// `sss_token_program_id` is the deployed address of the sss-token program
    /// that owns the BlacklistEntry PDAs we will be reading.
    pub fn initialize_extra_account_meta_list(
        ctx: Context<InitializeExtraAccountMetaList>,
        sss_token_program_id: Pubkey,
    ) -> Result<()> {
        instructions::initialize::handler(ctx, sss_token_program_id)
    }

    /// Called by Token-2022 on every transfer to enforce blacklist rules.
    ///
    /// The `#[interface]` macro overrides the Anchor discriminator with the
    /// canonical SPL transfer hook interface discriminator so Token-2022
    /// can route the CPI correctly.
    #[interface(spl_transfer_hook_interface::execute)]
    pub fn transfer_hook(ctx: Context<TransferHook>, amount: u64) -> Result<()> {
        instructions::execute::handler(ctx, amount)
    }

    /// Update the ExtraAccountMetaList in place.
    /// Use this if the sss-token program is redeployed to a new address.
    pub fn update_extra_account_meta_list(
        ctx: Context<UpdateExtraAccountMetaList>,
        sss_token_program_id: Pubkey,
    ) -> Result<()> {
        instructions::update::handler(ctx, sss_token_program_id)
    }
}
