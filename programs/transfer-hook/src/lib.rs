use anchor_lang::prelude::*;
use anchor_lang::system_program;
use anchor_lang::pubkey;
use spl_transfer_hook_interface::instruction::ExecuteInstruction;
use spl_tlv_account_resolution::{
    account::ExtraAccountMeta,
    seeds::Seed,
    state::ExtraAccountMetaList,
};

declare_id!("Fi6N4Z2Xm47dRmLoDRcVAvoiQ1UnT2WcuzvwjXvcB8mu");

/// The stablecoin program ID (where Config and Blacklist PDAs live)
const STABLECOIN_PROGRAM_ID: Pubkey = pubkey!("SSSW3EixhrbB6yYpTdKmH2nCReqsA1VJqJkhwvcdzLA");

#[error_code]
pub enum TransferHookError {
    #[msg("Token is paused")]
    TokenPaused,
    #[msg("Address is blacklisted")]
    AddressBlacklisted,
}

#[program]
pub mod transfer_hook {
    use super::*;

    pub fn initialize_extra_account_meta_list(
        ctx: Context<InitializeExtraAccountMetaList>,
    ) -> Result<()> {
        // Account indices in full transfer_checked invocation:
        // [0] source token, [1] mint, [2] dest token, [3] source owner, [4] extra_account_meta_list
        // Extra accounts start at [5]:
        // [5] stablecoin program ID (static pubkey)
        // [6] config PDA (external PDA from [5])
        // [7] source blacklist PDA (external PDA from [5])
        // [8] dest blacklist PDA (external PDA from [5])

        let extra_account_metas = vec![
            // [5] Stablecoin program ID
            ExtraAccountMeta::new_with_pubkey(&STABLECOIN_PROGRAM_ID, false, false)?,

            // [6] Config PDA: stablecoin_program.find_pda(["config", mint])
            ExtraAccountMeta::new_external_pda_with_seeds(
                5, // program at account index 5
                &[
                    Seed::Literal { bytes: b"config".to_vec() },
                    Seed::AccountKey { index: 1 }, // mint
                ],
                false,
                false,
            )?,

            // [7] Source blacklist PDA: stablecoin_program.find_pda(["blacklist", mint, source_owner])
            ExtraAccountMeta::new_external_pda_with_seeds(
                5,
                &[
                    Seed::Literal { bytes: b"blacklist".to_vec() },
                    Seed::AccountKey { index: 1 }, // mint
                    Seed::AccountKey { index: 3 }, // source owner
                ],
                false,
                false,
            )?,

            // [8] Dest blacklist PDA: stablecoin_program.find_pda(["blacklist", mint, dest_owner])
            // dest_owner is at byte offset 32 in dest token account data
            ExtraAccountMeta::new_external_pda_with_seeds(
                5,
                &[
                    Seed::Literal { bytes: b"blacklist".to_vec() },
                    Seed::AccountKey { index: 1 }, // mint
                    Seed::AccountData { account_index: 2, data_index: 32, length: 32 }, // dest token owner
                ],
                false,
                false,
            )?,
        ];

        let account_size = ExtraAccountMetaList::size_of(extra_account_metas.len())?;
        let lamports = Rent::get()?.minimum_balance(account_size);
        let mint = ctx.accounts.mint.key();
        let signer_seeds: &[&[u8]] = &[b"extra-account-metas", mint.as_ref()];
        let (_, bump) = Pubkey::find_program_address(signer_seeds, ctx.program_id);
        let signer_seeds_with_bump: &[&[u8]] = &[b"extra-account-metas", mint.as_ref(), &[bump]];

        system_program::create_account(
            CpiContext::new_with_signer(
                ctx.accounts.system_program.to_account_info(),
                system_program::CreateAccount {
                    from: ctx.accounts.payer.to_account_info(),
                    to: ctx.accounts.extra_account_meta_list.to_account_info(),
                },
                &[signer_seeds_with_bump],
            ),
            lamports,
            account_size as u64,
            ctx.program_id,
        )?;

        ExtraAccountMetaList::init::<ExecuteInstruction>(
            &mut ctx.accounts.extra_account_meta_list.try_borrow_mut_data()?,
            &extra_account_metas,
        )?;

        Ok(())
    }

    pub fn transfer_hook(ctx: Context<TransferHook>, _amount: u64) -> Result<()> {
        // Check global pause
        let config_info = &ctx.accounts.config;
        let config_data = config_info.try_borrow_data()?;
        if config_data.len() > 8 {
            let mut data_slice = &config_data[8..];
            if let Ok(config) = stablecoin_config::StablecoinConfig::deserialize(&mut data_slice) {
                require!(!config.is_paused, TransferHookError::TokenPaused);
            }
        }

        // Check source blacklist
        if !ctx.accounts.source_blacklist.data_is_empty() {
            let data = ctx.accounts.source_blacklist.try_borrow_data()?;
            if data.len() > 8 {
                return err!(TransferHookError::AddressBlacklisted);
            }
        }

        // Check destination blacklist
        if !ctx.accounts.destination_blacklist.data_is_empty() {
            let data = ctx.accounts.destination_blacklist.try_borrow_data()?;
            if data.len() > 8 {
                return err!(TransferHookError::AddressBlacklisted);
            }
        }

        Ok(())
    }

    /// Fallback for SPL Transfer Hook interface discriminator bridging
    pub fn fallback<'info>(
        program_id: &Pubkey,
        accounts: &'info [AccountInfo<'info>],
        data: &[u8],
    ) -> Result<()> {
        let instruction = spl_transfer_hook_interface::instruction::TransferHookInstruction::unpack(data)?;
        match instruction {
            spl_transfer_hook_interface::instruction::TransferHookInstruction::Execute { amount } => {
                let amount_bytes = amount.to_le_bytes();
                __private::__global::transfer_hook(program_id, accounts, &amount_bytes)
            }
            spl_transfer_hook_interface::instruction::TransferHookInstruction::InitializeExtraAccountMetaList { .. } => {
                __private::__global::initialize_extra_account_meta_list(program_id, accounts, &[])
            }
            _ => Err(ProgramError::InvalidInstructionData.into()),
        }
    }
}

mod stablecoin_config {
    use anchor_lang::prelude::*;

    #[derive(AnchorDeserialize)]
    pub struct StablecoinConfig {
        pub mint: Pubkey,
        pub preset: u8,
        pub name: String,
        pub symbol: String,
        pub uri: String,
        pub decimals: u8,
        pub owner: Pubkey,
        pub pending_owner: Option<Pubkey>,
        pub master_minter: Pubkey,
        pub pauser: Pubkey,
        pub blacklister: Pubkey,
        pub is_paused: bool,
    }
}

#[derive(Accounts)]
pub struct InitializeExtraAccountMetaList<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    /// CHECK: ExtraAccountMetaList PDA, created in this instruction
    #[account(
        mut,
        seeds = [b"extra-account-metas", mint.key().as_ref()],
        bump,
    )]
    pub extra_account_meta_list: UncheckedAccount<'info>,

    /// CHECK: The mint
    pub mint: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

/// Accounts passed by Token-2022 during transfer_checked + extra accounts from ExtraAccountMetaList
#[derive(Accounts)]
pub struct TransferHook<'info> {
    /// CHECK: Source token account
    pub source_token: UncheckedAccount<'info>,
    /// CHECK: Mint
    pub mint: UncheckedAccount<'info>,
    /// CHECK: Destination token account
    pub destination_token: UncheckedAccount<'info>,
    /// CHECK: Source authority/owner
    pub owner: UncheckedAccount<'info>,
    /// CHECK: ExtraAccountMetaList PDA
    pub extra_account_meta_list: UncheckedAccount<'info>,
    // --- Extra accounts ---
    /// CHECK: Stablecoin program ID
    pub stablecoin_program: UncheckedAccount<'info>,
    /// CHECK: Config PDA
    pub config: UncheckedAccount<'info>,
    /// CHECK: Source blacklist PDA
    pub source_blacklist: UncheckedAccount<'info>,
    /// CHECK: Destination blacklist PDA
    pub destination_blacklist: UncheckedAccount<'info>,
}
