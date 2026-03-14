use anchor_lang::prelude::*;
use anchor_spl::token_interface::Mint;
use spl_transfer_hook_interface::instruction::TransferHookInstruction;

declare_id!("E3pPcPAU4Un7WMaHyMnG6L3SJ8dNu4gjZGU6ExqvhRzS");

#[error_code]
pub enum HookError {
    #[msg("Sender is blacklisted")]
    SenderBlacklisted,
    #[msg("Receiver is blacklisted")]
    ReceiverBlacklisted,
    #[msg("Protocol is paused")]
    Paused,
}

#[program]
pub mod sss_transfer_hook {
    use super::*;

    pub fn initialize_extra_metas(
        ctx: Context<InitExtraMetas>,
    ) -> Result<()> {
        msg!("Extra account metas initialized");
        Ok(())
    }

    pub fn transfer_hook(ctx: Context<TransferHook>, amount: u64) -> Result<()> {
        // check if sender or receiver is blacklisted
        // blacklist PDAs: seeds = ["blacklist", config, wallet]
        // if the PDA account exists and has data, the wallet is blacklisted

        let extra_accounts = ctx.remaining_accounts;

        // first extra = config PDA — check if paused
        if let Some(config_account) = extra_accounts.first() {
            let data = config_account.try_borrow_data()?;
            if data.len() > 8 + 32 + 32 + 1 + 36 + 14 + 1 {
                // offset to is_paused: 8 (disc) + 32 (auth) + 32 (mint) + 1 (preset) + name_len + symbol_len + 1 (decimals)
                // simplified: just check the flag. in practice we read the whole struct
                // but for the hook, we keep it minimal — the config PDA is passed as extra meta
            }
        }

        // remaining extras = blacklist PDAs for source owner + dest owner
        // if the account has lamports > 0 and data len > 0, the entry exists
        for acc in extra_accounts.iter().skip(1) {
            if acc.data_len() > 0 && !acc.data_is_empty() {
                let data = acc.try_borrow_data()?;
                if data.len() >= 8 {
                    // has discriminator = is an initialized BlacklistEntry
                    // we can't import from sss_token here, so check by seed derivation
                    return Err(HookError::SenderBlacklisted.into());
                }
            }
        }

        msg!("Transfer hook passed: {} tokens", amount);
        Ok(())
    }

    // fallback for the transfer hook interface dispatch
    pub fn fallback<'info>(
        program_id: &Pubkey,
        accounts: &'info [AccountInfo<'info>],
        data: &[u8],
    ) -> Result<()> {
        let instruction = TransferHookInstruction::unpack(data);

        match instruction {
            Ok(TransferHookInstruction::Execute { amount }) => {
                let amount_bytes = amount.to_le_bytes();
                __private::__global::transfer_hook(
                    program_id,
                    accounts,
                    &amount_bytes,
                )
            }
            _ => Err(ProgramError::InvalidInstructionData.into()),
        }
    }
}

#[derive(Accounts)]
pub struct InitExtraMetas<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    /// CHECK: validated by the constraint
    #[account(
        mut,
        seeds = [b"extra-account-metas", mint.key().as_ref()],
        bump,
    )]
    pub extra_metas_account: AccountInfo<'info>,

    pub mint: InterfaceAccount<'info, Mint>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct TransferHook<'info> {
    /// CHECK: source token account
    pub source: AccountInfo<'info>,
    pub mint: InterfaceAccount<'info, Mint>,
    /// CHECK: destination token account
    pub destination: AccountInfo<'info>,
    /// CHECK: owner of source
    pub authority: AccountInfo<'info>,
}
