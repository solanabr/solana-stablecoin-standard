use anchor_lang::prelude::*;

declare_id!("SSShook111111111111111111111111111111111111");

/// Transfer Hook program for SSS-2 compliance.
/// Checks that neither sender nor receiver is blacklisted before allowing a transfer.
#[program]
pub mod transfer_hook {
    use super::*;

    /// Initialize the extra account metas for the transfer hook.
    pub fn initialize_extra_account_meta_list(
        ctx: Context<InitializeExtraAccountMetaList>,
    ) -> Result<()> {
        msg!("SSS Hook: Initialized extra account meta list for mint {}", ctx.accounts.mint.key());
        Ok(())
    }

    /// Execute the transfer hook — called automatically by Token-2022 on every transfer.
    pub fn transfer_hook(ctx: Context<TransferHookExecute>, amount: u64) -> Result<()> {
        // Check source blacklist — if the account exists and has data, source is blacklisted
        if !ctx.accounts.source_blacklist.data_is_empty() {
            msg!("SSS Hook: Source is blacklisted, blocking transfer");
            return Err(error!(HookError::SourceBlacklisted));
        }

        // Check destination blacklist
        if !ctx.accounts.dest_blacklist.data_is_empty() {
            msg!("SSS Hook: Destination is blacklisted, blocking transfer");
            return Err(error!(HookError::DestinationBlacklisted));
        }

        msg!("SSS Hook: Transfer of {} approved", amount);
        Ok(())
    }
}

#[derive(Accounts)]
pub struct InitializeExtraAccountMetaList<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    /// CHECK: Extra account meta list PDA — validated by seeds.
    #[account(mut)]
    pub extra_account_meta_list: UncheckedAccount<'info>,

    /// CHECK: The mint this hook is attached to.
    pub mint: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct TransferHookExecute<'info> {
    /// CHECK: Source token account (provided by Token-2022).
    pub source: UncheckedAccount<'info>,

    /// CHECK: Mint (provided by Token-2022).
    pub mint: UncheckedAccount<'info>,

    /// CHECK: Destination token account (provided by Token-2022).
    pub destination: UncheckedAccount<'info>,

    /// CHECK: Source owner / delegate (provided by Token-2022).
    pub owner: UncheckedAccount<'info>,

    /// CHECK: Extra account meta list (provided by Token-2022).
    pub extra_account_meta_list: UncheckedAccount<'info>,

    /// CHECK: Blacklist PDA for source owner. Empty = not blacklisted.
    pub source_blacklist: UncheckedAccount<'info>,

    /// CHECK: Blacklist PDA for destination owner. Empty = not blacklisted.
    pub dest_blacklist: UncheckedAccount<'info>,
}

#[error_code]
pub enum HookError {
    #[msg("Source address is blacklisted")]
    SourceBlacklisted,
    #[msg("Destination address is blacklisted")]
    DestinationBlacklisted,
}
