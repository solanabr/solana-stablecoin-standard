use anchor_lang::prelude::*;
use anchor_lang::solana_program::{program::invoke_signed, system_instruction};
use anchor_spl::token_interface::{Mint, TokenAccount};
use borsh::BorshDeserialize;
use spl_tlv_account_resolution::{
    account::ExtraAccountMeta, seeds::Seed, state::ExtraAccountMetaList,
};
use spl_transfer_hook_interface::{
    get_extra_account_metas_address_and_bump_seed,
    instruction::{ExecuteInstruction, TransferHookInstruction},
};

declare_id!("CHfiQPpbATb9qDbYMA8sRKPxRu3sYHdMW4s4JG4xJt1H");

const HOOK_CONFIG_SEED: &[u8] = b"hook-config";
const COMPLIANCE_RECORD_SEED: &[u8] = b"compliance";

#[program]
pub mod sss_transfer_hook {
    use super::*;

    pub fn initialize_hook(ctx: Context<InitializeHook>, args: InitializeHookArgs) -> Result<()> {
        let hook_config = &mut ctx.accounts.hook_config;
        hook_config.bump = ctx.bumps.hook_config;
        hook_config.mint = ctx.accounts.mint.key();
        hook_config.stablecoin_program = args.stablecoin_program;
        hook_config.stablecoin_config = args.stablecoin_config;
        hook_config.treasury_token_account = args.treasury_token_account;
        hook_config.enforce_pause = args.enforce_pause;

        emit!(HookInitialized {
            mint: hook_config.mint,
            stablecoin_program: hook_config.stablecoin_program,
            stablecoin_config: hook_config.stablecoin_config,
            treasury_token_account: hook_config.treasury_token_account,
            enforce_pause: hook_config.enforce_pause,
        });

        Ok(())
    }

    pub fn update_hook_config(
        ctx: Context<UpdateHookConfig>,
        args: UpdateHookConfigArgs,
    ) -> Result<()> {
        require_keys_eq!(
            ctx.accounts.hook_config.stablecoin_config,
            ctx.accounts.stablecoin_config.key(),
            HookError::InvalidStablecoinConfig
        );
        require_keys_eq!(
            *ctx.accounts.stablecoin_config.owner,
            ctx.accounts.hook_config.stablecoin_program,
            HookError::InvalidStablecoinProgram
        );
        let stablecoin_view = read_anchor_payload::<StablecoinConfigSnapshot>(
            &ctx.accounts.stablecoin_config.to_account_info(),
        )?;
        require_keys_eq!(
            stablecoin_view.master_authority,
            ctx.accounts.authority.key(),
            HookError::Unauthorized
        );

        let hook_config = &mut ctx.accounts.hook_config;
        if let Some(stablecoin_config) = args.stablecoin_config {
            hook_config.stablecoin_config = stablecoin_config;
        }
        if let Some(treasury_token_account) = args.treasury_token_account {
            hook_config.treasury_token_account = treasury_token_account;
        }
        if let Some(enforce_pause) = args.enforce_pause {
            hook_config.enforce_pause = enforce_pause;
        }

        emit!(HookConfigUpdated {
            mint: hook_config.mint,
            stablecoin_config: hook_config.stablecoin_config,
            treasury_token_account: hook_config.treasury_token_account,
            enforce_pause: hook_config.enforce_pause,
        });

        Ok(())
    }

    pub fn initialize_extra_account_meta_list(
        ctx: Context<InitializeExtraAccountMetaList>,
    ) -> Result<()> {
        require_keys_eq!(
            ctx.accounts.hook_config.mint,
            ctx.accounts.mint.key(),
            HookError::InvalidMint
        );

        let (expected_validate_pda, bump) =
            get_extra_account_metas_address_and_bump_seed(&ctx.accounts.mint.key(), &crate::ID);
        require_keys_eq!(
            expected_validate_pda,
            ctx.accounts.extra_account_meta_list.key(),
            HookError::InvalidValidationPda
        );

        let extra_metas = vec![
            ExtraAccountMeta::new_with_pubkey(&ctx.accounts.hook_config.key(), false, false)
                .map_err(anchor_lang::error::Error::from)?,
            ExtraAccountMeta::new_with_pubkey(
                &ctx.accounts.hook_config.stablecoin_program,
                false,
                false,
            )
            .map_err(anchor_lang::error::Error::from)?,
            ExtraAccountMeta::new_with_pubkey(
                &ctx.accounts.hook_config.stablecoin_config,
                false,
                false,
            )
            .map_err(anchor_lang::error::Error::from)?,
            ExtraAccountMeta::new_external_pda_with_seeds(
                6,
                &[
                    Seed::Literal {
                        bytes: COMPLIANCE_RECORD_SEED.to_vec(),
                    },
                    Seed::AccountKey { index: 1 },
                    Seed::AccountData {
                        account_index: 0,
                        data_index: 32,
                        length: 32,
                    },
                ],
                false,
                false,
            )
            .map_err(anchor_lang::error::Error::from)?,
            ExtraAccountMeta::new_external_pda_with_seeds(
                6,
                &[
                    Seed::Literal {
                        bytes: COMPLIANCE_RECORD_SEED.to_vec(),
                    },
                    Seed::AccountKey { index: 1 },
                    Seed::AccountData {
                        account_index: 2,
                        data_index: 32,
                        length: 32,
                    },
                ],
                false,
                false,
            )
            .map_err(anchor_lang::error::Error::from)?,
        ];

        let account_size = ExtraAccountMetaList::size_of(extra_metas.len())
            .map_err(anchor_lang::error::Error::from)?;

        if ctx.accounts.extra_account_meta_list.data_is_empty() {
            let lamports = Rent::get()?.minimum_balance(account_size);
            let mint_key = ctx.accounts.mint.key();
            let signer_seeds: &[&[u8]] = &[b"extra-account-metas", mint_key.as_ref(), &[bump]];

            invoke_signed(
                &system_instruction::create_account(
                    &ctx.accounts.payer.key(),
                    &ctx.accounts.extra_account_meta_list.key(),
                    lamports,
                    account_size as u64,
                    &crate::ID,
                ),
                &[
                    ctx.accounts.payer.to_account_info(),
                    ctx.accounts.extra_account_meta_list.to_account_info(),
                    ctx.accounts.system_program.to_account_info(),
                ],
                &[signer_seeds],
            )?;
        }

        let mut data = ctx.accounts.extra_account_meta_list.try_borrow_mut_data()?;
        ExtraAccountMetaList::init::<ExecuteInstruction>(&mut data, &extra_metas)
            .map_err(anchor_lang::error::Error::from)?;

        emit!(ExtraMetaListInitialized {
            mint: ctx.accounts.mint.key(),
            validation_pda: ctx.accounts.extra_account_meta_list.key(),
            entry_count: extra_metas.len() as u8,
        });

        Ok(())
    }

    #[interface(spl_transfer_hook_interface::execute)]
    pub fn execute(ctx: Context<Execute>, amount: u64) -> Result<()> {
        let hook_config = &ctx.accounts.hook_config;
        require_keys_eq!(
            hook_config.mint,
            ctx.accounts.mint.key(),
            HookError::InvalidMint
        );
        require_keys_eq!(
            hook_config.stablecoin_program,
            ctx.accounts.stablecoin_program.key(),
            HookError::InvalidStablecoinProgram
        );
        require_keys_eq!(
            hook_config.stablecoin_config,
            ctx.accounts.stablecoin_config.key(),
            HookError::InvalidStablecoinConfig
        );
        require_keys_eq!(
            ctx.accounts.source_token.mint,
            ctx.accounts.mint.key(),
            HookError::InvalidTokenAccount
        );
        require_keys_eq!(
            ctx.accounts.destination_token.mint,
            ctx.accounts.mint.key(),
            HookError::InvalidTokenAccount
        );

        let stablecoin_view = read_anchor_payload::<StablecoinConfigSnapshot>(
            &ctx.accounts.stablecoin_config.to_account_info(),
        )?;

        if hook_config.enforce_pause {
            require!(!stablecoin_view.paused, HookError::TransfersPaused);
        }

        if is_seize_path(&ctx, &stablecoin_view) {
            emit!(TransferHookAllowlisted {
                mint: ctx.accounts.mint.key(),
                amount,
                reason: HookAllowReason::SeizeRoute,
            });
            return Ok(());
        }

        let source_is_blacklisted = is_blacklisted(
            &ctx.accounts.source_compliance_record.to_account_info(),
            &ctx.accounts.source_token.owner,
            &ctx.accounts.mint.key(),
            &hook_config.stablecoin_program,
        )?;
        let destination_is_blacklisted = is_blacklisted(
            &ctx.accounts.destination_compliance_record.to_account_info(),
            &ctx.accounts.destination_token.owner,
            &ctx.accounts.mint.key(),
            &hook_config.stablecoin_program,
        )?;

        require!(!source_is_blacklisted, HookError::SourceBlacklisted);
        require!(
            !destination_is_blacklisted,
            HookError::DestinationBlacklisted
        );

        emit!(TransferValidated {
            mint: ctx.accounts.mint.key(),
            source_owner: ctx.accounts.source_token.owner,
            destination_owner: ctx.accounts.destination_token.owner,
            amount,
        });

        Ok(())
    }
}

pub fn fallback<'info>(
    program_id: &Pubkey,
    accounts: &'info [AccountInfo<'info>],
    data: &[u8],
) -> Result<()> {
    match TransferHookInstruction::unpack(data)
        .map_err(|_| error!(HookError::InvalidFallbackData))?
    {
        TransferHookInstruction::Execute { amount } => {
            crate::__private::__global::execute(program_id, accounts, &amount.to_le_bytes())
        }
        _ => err!(HookError::InvalidFallbackData),
    }
}

fn is_seize_path(ctx: &Context<Execute>, stablecoin_view: &StablecoinConfigSnapshot) -> bool {
    ctx.accounts.authority.key() == ctx.accounts.stablecoin_config.key()
        && ctx.accounts.destination_token.key() == stablecoin_view.treasury
}

fn is_blacklisted(
    record_info: &AccountInfo,
    owner: &Pubkey,
    mint: &Pubkey,
    stablecoin_program: &Pubkey,
) -> Result<bool> {
    let (expected, _) = Pubkey::find_program_address(
        &[COMPLIANCE_RECORD_SEED, mint.as_ref(), owner.as_ref()],
        stablecoin_program,
    );
    require_keys_eq!(
        expected,
        record_info.key(),
        HookError::InvalidComplianceRecord
    );

    if record_info.owner != stablecoin_program {
        return Ok(false);
    }

    let record = read_anchor_payload::<ComplianceRecordSnapshot>(record_info)?;
    if record.wallet != *owner || record.mint != *mint {
        return Ok(false);
    }

    Ok(record.blacklisted)
}

fn read_anchor_payload<T: BorshDeserialize>(account_info: &AccountInfo) -> Result<T> {
    let data = account_info.try_borrow_data()?;
    if data.len() < 8 {
        return err!(HookError::AccountDataTooSmall);
    }

    T::deserialize(&mut &data[8..]).map_err(|_| error!(HookError::DecodeFailed))
}

#[derive(Accounts)]
pub struct InitializeHook<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        init,
        payer = payer,
        space = 8 + HookConfig::INIT_SPACE,
        seeds = [HOOK_CONFIG_SEED, mint.key().as_ref()],
        bump
    )]
    pub hook_config: Account<'info, HookConfig>,

    /// CHECK: mint is validated by PDA relationship and client-side creation flow.
    pub mint: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateHookConfig<'info> {
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [HOOK_CONFIG_SEED, mint.key().as_ref()],
        bump = hook_config.bump,
        has_one = mint @ HookError::InvalidMint
    )]
    pub hook_config: Account<'info, HookConfig>,

    /// CHECK: checked via has_one.
    pub mint: UncheckedAccount<'info>,
    /// CHECK: owner and layout validated in instruction.
    pub stablecoin_config: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct InitializeExtraAccountMetaList<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        seeds = [HOOK_CONFIG_SEED, mint.key().as_ref()],
        bump = hook_config.bump,
        has_one = mint @ HookError::InvalidMint
    )]
    pub hook_config: Account<'info, HookConfig>,

    /// CHECK: Transfer Hook validation account PDA for this mint.
    #[account(mut)]
    pub extra_account_meta_list: UncheckedAccount<'info>,

    pub mint: InterfaceAccount<'info, Mint>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Execute<'info> {
    pub source_token: InterfaceAccount<'info, TokenAccount>,

    pub mint: InterfaceAccount<'info, Mint>,

    pub destination_token: InterfaceAccount<'info, TokenAccount>,

    /// CHECK: source account authority/delegate from token transfer.
    pub authority: UncheckedAccount<'info>,

    /// CHECK: validated by transfer-hook interface seeds.
    #[account(seeds = [b"extra-account-metas", mint.key().as_ref()], bump)]
    pub extra_account_meta_list: UncheckedAccount<'info>,

    #[account(seeds = [HOOK_CONFIG_SEED, mint.key().as_ref()], bump = hook_config.bump)]
    pub hook_config: Account<'info, HookConfig>,

    /// CHECK: owner and layout validated at runtime.
    pub stablecoin_program: UncheckedAccount<'info>,
    /// CHECK: owner and layout validated at runtime.
    pub stablecoin_config: UncheckedAccount<'info>,
    /// CHECK: optional record PDA; owner and layout validated at runtime.
    pub source_compliance_record: UncheckedAccount<'info>,
    /// CHECK: optional record PDA; owner and layout validated at runtime.
    pub destination_compliance_record: UncheckedAccount<'info>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct InitializeHookArgs {
    pub stablecoin_program: Pubkey,
    pub stablecoin_config: Pubkey,
    pub treasury_token_account: Pubkey,
    pub enforce_pause: bool,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct UpdateHookConfigArgs {
    pub stablecoin_config: Option<Pubkey>,
    pub treasury_token_account: Option<Pubkey>,
    pub enforce_pause: Option<bool>,
}

#[account]
#[derive(InitSpace)]
pub struct HookConfig {
    pub bump: u8,
    pub mint: Pubkey,
    pub stablecoin_program: Pubkey,
    pub stablecoin_config: Pubkey,
    pub treasury_token_account: Pubkey,
    pub enforce_pause: bool,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct StablecoinConfigSnapshot {
    pub bump: u8,
    pub mint: Pubkey,
    pub preset: u8,
    pub decimals: u8,
    pub name: String,
    pub symbol: String,
    pub uri: String,
    pub master_authority: Pubkey,
    pub pauser: Pubkey,
    pub burner: Pubkey,
    pub blacklister: Pubkey,
    pub seizer: Pubkey,
    pub treasury: Pubkey,
    pub compliance_enabled: bool,
    pub paused: bool,
    pub seize_requires_blacklist: bool,
    pub permanent_delegate_enabled: bool,
    pub transfer_hook_enabled: bool,
    pub default_account_frozen: bool,
    pub transfer_hook_program: Pubkey,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct ComplianceRecordSnapshot {
    pub bump: u8,
    pub mint: Pubkey,
    pub wallet: Pubkey,
    pub blacklisted: bool,
    pub reason_hash: [u8; 32],
    pub updated_at: i64,
}

#[event]
pub struct HookInitialized {
    pub mint: Pubkey,
    pub stablecoin_program: Pubkey,
    pub stablecoin_config: Pubkey,
    pub treasury_token_account: Pubkey,
    pub enforce_pause: bool,
}

#[event]
pub struct HookConfigUpdated {
    pub mint: Pubkey,
    pub stablecoin_config: Pubkey,
    pub treasury_token_account: Pubkey,
    pub enforce_pause: bool,
}

#[event]
pub struct ExtraMetaListInitialized {
    pub mint: Pubkey,
    pub validation_pda: Pubkey,
    pub entry_count: u8,
}

#[event]
pub struct TransferValidated {
    pub mint: Pubkey,
    pub source_owner: Pubkey,
    pub destination_owner: Pubkey,
    pub amount: u64,
}

#[event]
pub struct TransferHookAllowlisted {
    pub mint: Pubkey,
    pub amount: u64,
    pub reason: HookAllowReason,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy)]
pub enum HookAllowReason {
    SeizeRoute,
}

#[error_code]
pub enum HookError {
    #[msg("Mint mismatch")]
    InvalidMint,
    #[msg("Invalid validation PDA")]
    InvalidValidationPda,
    #[msg("Unable to decode account data")]
    DecodeFailed,
    #[msg("Anchor account payload is too small")]
    AccountDataTooSmall,
    #[msg("Source owner is blacklisted")]
    SourceBlacklisted,
    #[msg("Destination owner is blacklisted")]
    DestinationBlacklisted,
    #[msg("Transfers are paused")]
    TransfersPaused,
    #[msg("Invalid compliance record PDA")]
    InvalidComplianceRecord,
    #[msg("Invalid stablecoin program account")]
    InvalidStablecoinProgram,
    #[msg("Invalid stablecoin config account")]
    InvalidStablecoinConfig,
    #[msg("Invalid token account")]
    InvalidTokenAccount,
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("Invalid fallback payload")]
    InvalidFallbackData,
}
