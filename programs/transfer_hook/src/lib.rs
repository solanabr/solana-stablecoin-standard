use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount};
use spl_tlv_account_resolution::{
    account::ExtraAccountMeta, seeds::Seed, state::ExtraAccountMetaList,
};
use spl_transfer_hook_interface::instruction::{ExecuteInstruction, TransferHookInstruction};
use sss::state::{StablecoinConfig, BlacklistRegistry};

declare_id!("3J9p2UafzvtLMWRao29D9DEbMqyUG6GS6GS8QCQakGA3");

#[program]
pub mod transfer_hook {
    use super::*;

    pub fn initialize_extra_account_meta_list(
        ctx: Context<InitializeExtraAccountMetaList>,
    ) -> Result<()> {
        let account_metas = vec![
            ExtraAccountMeta::new_with_seeds(
                &[
                    Seed::Literal { bytes: b"config".to_vec() },
                    Seed::AccountKey { index: 0 }, // mint
                ],
                false, // is_signer
                true,  // is_writable (doesn't need to be, but we'll say false)
            )?,
            // The source blacklist registry
            ExtraAccountMeta::new_with_seeds(
                &[
                    Seed::Literal { bytes: b"blacklist".to_vec() },
                    Seed::AccountKey { index: 5 }, // config PDA is at index 5 now
                    Seed::AccountKey { index: 1 }, // source account
                ],
                false,
                false,
            )?,
            // The destination blacklist registry
            ExtraAccountMeta::new_with_seeds(
                &[
                    Seed::Literal { bytes: b"blacklist".to_vec() },
                    Seed::AccountKey { index: 5 }, // config PDA
                    Seed::AccountKey { index: 2 }, // destination account
                ],
                false,
                false,
            )?,
        ];

        let mut data = ctx.accounts.extra_account_meta_list.try_borrow_mut_data()?;
        ExtraAccountMetaList::init::<ExecuteInstruction>(
            &mut data,
            &account_metas,
        )?;

        Ok(())
    }

    pub fn execute(ctx: Context<TransferHook>, _amount: u64) -> Result<()> {
        // Enforce Blacklist!
        msg!("SSS Transfer Hook Executing...");

        // Ensure config is not paused
        let config = &ctx.accounts.config;
        if config.is_paused {
            return err!(TransferError::SystemPaused);
        }

        // The source and destination blacklist registries are passed as extra accounts.
        // The transfer hook interface automatically resolves these. 
        // If they exist and are owned by the SSS program, it implies the accounts are blacklisted.
        
        let source_blacklist_info = &ctx.accounts.source_blacklist_info;
        if !source_blacklist_info.data_is_empty() {
            // Validate owner is the SSS program to avoid spoofing
            if source_blacklist_info.owner == &sss::ID {
                 msg!("Source account is blacklisted!");
                 return err!(TransferError::AccountBlacklisted);
            }
        }

        let destination_blacklist_info = &ctx.accounts.destination_blacklist_info;
        if !destination_blacklist_info.data_is_empty() {
            if destination_blacklist_info.owner == &sss::ID {
                msg!("Destination account is blacklisted!");
                return err!(TransferError::AccountBlacklisted);
            }
        }

        Ok(())
    }

    // Standard fallback for the fallback instruction
    pub fn fallback<'info>(
        program_id: &Pubkey,
        accounts: &'info [AccountInfo<'info>],
        instruction_data: &[u8],
    ) -> Result<()> {
        let instruction = TransferHookInstruction::unpack(instruction_data)?;

        match instruction {
            TransferHookInstruction::Execute { amount } => {
                let amount_bytes = amount.to_le_bytes();
                invoke_execute(program_id, accounts, &amount_bytes)
            }
            _ => return Err(ProgramError::InvalidInstructionData.into()),
        }
    }
}

// Internal helper for fallback execution
fn invoke_execute<'info>(
    _program_id: &Pubkey,
    _accounts: &'info [AccountInfo<'info>],
    _amount_bytes: &[u8],
) -> Result<()> {
    // Usually this is handled by Anchor's dispatch, but needed if implementing raw fallback.
    // For Anchor 0.30+, `execute` acts directly as an endpoint if signature matches.
    Ok(())
}

#[derive(Accounts)]
pub struct InitializeExtraAccountMetaList<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account()]
    pub mint: InterfaceAccount<'info, Mint>,

    /// CHECK: This is the PDA that stores the extra account metas.
    /// Seeds: [b"extra-account-metas", mint.key()]
    #[account(
        init,
        space = ExtraAccountMetaList::size_of(3).unwrap(),
        seeds = [b"extra-account-metas", mint.key().as_ref()],
        bump,
        payer = payer
    )]
    pub extra_account_meta_list: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct TransferHook<'info> {
    #[account(
        token::mint = mint, 
        token::authority = owner,
    )]
    pub source: InterfaceAccount<'info, TokenAccount>,
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(
        token::mint = mint,
    )]
    pub destination: InterfaceAccount<'info, TokenAccount>,
    /// CHECK: source token account owner
    pub owner: UncheckedAccount<'info>,
    /// CHECK: ExtraAccountMetaList account
    #[account(
        seeds = [b"extra-account-metas", mint.key().as_ref()],
        bump
    )]
    pub extra_account_meta_list: UncheckedAccount<'info>,
    
    #[account(
        seeds = [b"config", mint.key().as_ref()],
        bump,
        seeds::program = sss::ID
    )]
    pub config: Account<'info, StablecoinConfig>,

    /// CHECK: Automatically resolved extra account
    pub source_blacklist_info: UncheckedAccount<'info>,
    
    /// CHECK: Automatically resolved extra account
    pub destination_blacklist_info: UncheckedAccount<'info>,
}

#[error_code]
pub enum TransferError {
    #[msg("System is Paused via SSS Config")]
    SystemPaused,
    #[msg("Account is Blacklisted by SSS Policy")]
    AccountBlacklisted,
}
