#![allow(unexpected_cfgs)]

use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount};
use spl_tlv_account_resolution::account::ExtraAccountMeta;
use spl_tlv_account_resolution::seeds::Seed;
use spl_tlv_account_resolution::state::ExtraAccountMetaList;
use spl_transfer_hook_interface::instruction::ExecuteInstruction;

use sss_common::{SEED_BLACKLIST, SEED_CONFIG, SEED_EXTRA_ACCOUNT_METAS};

declare_id!("YYTBExpcbtVYTGNmbgcAr7SzEGWfLtByYUrcfzvUz8p");

const SEED_HOOK_CONFIG: &[u8] = b"hook_config";
/// Index of transfer-hook program in execute accounts (first resolved = index 5); used to derive hook_config PDA.
const TRANSFER_HOOK_PROGRAM_INDEX: u8 = 5;
const INITIALIZE_EXTRA_ACCOUNT_META_LIST_DISCRIMINATOR: [u8; 8] =
    [43, 34, 13, 49, 167, 88, 235, 235];
const EXECUTE_DISCRIMINATOR: [u8; 8] = [105, 37, 101, 197, 75, 251, 102, 26];
/// Index of stablecoin program account in execute accounts (used for config/blacklist PDAs).
const CORE_PROGRAM_INDEX: u8 = 7;
const MINT_ACCOUNT_INDEX: u8 = 1;
const SOURCE_TOKEN_ACCOUNT_INDEX: u8 = 0;
const DESTINATION_TOKEN_ACCOUNT_INDEX: u8 = 2;
const TOKEN_ACCOUNT_OWNER_OFFSET: u8 = 32;
const TOKEN_ACCOUNT_OWNER_LENGTH: u8 = 32;

#[program]
pub mod transfer_hook {
    use super::*;

    /// One-time init: sets the stablecoin program ID this hook will validate against.
    /// Call after deploying the transfer-hook program, before any mint uses it.
    pub fn initialize_hook_config(
        ctx: Context<InitializeHookConfig>,
        stablecoin_program_id: Pubkey,
    ) -> Result<()> {
        ctx.accounts.hook_config.stablecoin_program_id = stablecoin_program_id;
        Ok(())
    }

    #[instruction(discriminator = &INITIALIZE_EXTRA_ACCOUNT_META_LIST_DISCRIMINATOR)]
    pub fn initialize_extra_account_meta_list(
        ctx: Context<InitializeExtraAccountMetaList>,
    ) -> Result<()> {
        let stablecoin_program_id = ctx.accounts.hook_config.stablecoin_program_id;
        let extra_metas = build_extra_account_metas(&stablecoin_program_id)?;
        let mut data = ctx.accounts.extra_account_meta_list.try_borrow_mut_data()?;
        ExtraAccountMetaList::init::<ExecuteInstruction>(&mut data, &extra_metas)
            .map_err(|_| error!(TransferHookError::InvalidExtraAccountMetaList))?;

        Ok(())
    }

    #[instruction(discriminator = &EXECUTE_DISCRIMINATOR)]
    pub fn transfer_hook(ctx: Context<TransferHook>, _amount: u64) -> Result<()> {
        let stablecoin_program_id = ctx.accounts.hook_config.stablecoin_program_id;
        let expected_config = Pubkey::find_program_address(
            &[SEED_CONFIG, ctx.accounts.mint.key().as_ref()],
            &stablecoin_program_id,
        )
        .0;
        require!(
            ctx.accounts.stablecoin_program.key() == stablecoin_program_id,
            TransferHookError::InvalidStablecoinProgram
        );
        require!(
            ctx.accounts.config.key() == expected_config,
            TransferHookError::InvalidConfigAccount
        );

        let expected_source_blacklist = Pubkey::find_program_address(
            &[
                SEED_BLACKLIST,
                ctx.accounts.mint.key().as_ref(),
                ctx.accounts.source.owner.as_ref(),
            ],
            &stablecoin_program_id,
        )
        .0;
        let expected_destination_blacklist = Pubkey::find_program_address(
            &[
                SEED_BLACKLIST,
                ctx.accounts.mint.key().as_ref(),
                ctx.accounts.destination.owner.as_ref(),
            ],
            &stablecoin_program_id,
        )
        .0;

        require!(
            ctx.accounts.source_blacklist.key() == expected_source_blacklist,
            TransferHookError::InvalidBlacklistAccount
        );
        require!(
            ctx.accounts.destination_blacklist.key() == expected_destination_blacklist,
            TransferHookError::InvalidBlacklistAccount
        );

        if ctx.accounts.authority.key() == ctx.accounts.config.key() {
            return Ok(());
        }

        if ctx.accounts.source_blacklist.data_len() > 0 {
            return err!(TransferHookError::SourceBlacklisted);
        }

        if ctx.accounts.destination_blacklist.data_len() > 0 {
            return err!(TransferHookError::DestinationBlacklisted);
        }

        Ok(())
    }

    pub fn fallback<'info>(
        program_id: &Pubkey,
        accounts: &'info [AccountInfo<'info>],
        data: &[u8],
    ) -> Result<()> {
        let instruction =
            spl_transfer_hook_interface::instruction::TransferHookInstruction::unpack(data)?;

        match instruction {
            spl_transfer_hook_interface::instruction::TransferHookInstruction::Execute {
                amount,
            } => __private::__global::transfer_hook(program_id, accounts, &amount.to_le_bytes()),
            _ => err!(TransferHookError::InvalidInstruction),
        }
    }
}

#[account]
pub struct HookConfig {
    pub stablecoin_program_id: Pubkey,
}

#[derive(Accounts)]
pub struct InitializeHookConfig<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        init,
        seeds = [SEED_HOOK_CONFIG],
        bump,
        payer = payer,
        space = 8 + 32
    )]
    pub hook_config: Account<'info, HookConfig>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct InitializeExtraAccountMetaList<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        seeds = [SEED_HOOK_CONFIG],
        bump
    )]
    pub hook_config: Account<'info, HookConfig>,
    /// CHECK: PDA created and owned by this program.
    #[account(
        init,
        seeds = [SEED_EXTRA_ACCOUNT_METAS, mint.key().as_ref()],
        bump,
        payer = payer,
        space = ExtraAccountMetaList::size_of(
            build_extra_account_metas(&hook_config.stablecoin_program_id)?.len()
        )?
    )]
    pub extra_account_meta_list: AccountInfo<'info>,
    pub mint: InterfaceAccount<'info, Mint>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct TransferHook<'info> {
    #[account(token::mint = mint)]
    pub source: InterfaceAccount<'info, TokenAccount>,
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(token::mint = mint)]
    pub destination: InterfaceAccount<'info, TokenAccount>,
    /// CHECK: Source owner or delegate authority provided by Token-2022.
    pub authority: UncheckedAccount<'info>,
    /// CHECK: Extra account meta list PDA resolved by Token-2022.
    #[account(
        seeds = [SEED_EXTRA_ACCOUNT_METAS, mint.key().as_ref()],
        bump
    )]
    pub extra_account_meta_list: UncheckedAccount<'info>,
    /// CHECK: Transfer-hook program (first in extra list for PDA resolution).
    pub transfer_hook_program: UncheckedAccount<'info>,
    #[account(seeds = [SEED_HOOK_CONFIG], bump)]
    pub hook_config: Account<'info, HookConfig>,
    /// CHECK: Stablecoin program id extra meta.
    pub stablecoin_program: UncheckedAccount<'info>,
    /// CHECK: Stablecoin config PDA extra meta.
    pub config: UncheckedAccount<'info>,
    /// CHECK: Source blacklist PDA extra meta.
    pub source_blacklist: UncheckedAccount<'info>,
    /// CHECK: Destination blacklist PDA extra meta.
    pub destination_blacklist: UncheckedAccount<'info>,
}

#[error_code]
pub enum TransferHookError {
    #[msg("Stablecoin program account is invalid")]
    InvalidStablecoinProgram,
    #[msg("Stablecoin config account is invalid")]
    InvalidConfigAccount,
    #[msg("Blacklist PDA account is invalid")]
    InvalidBlacklistAccount,
    #[msg("Source address is blacklisted")]
    SourceBlacklisted,
    #[msg("Destination address is blacklisted")]
    DestinationBlacklisted,
    #[msg("Extra account meta list is invalid")]
    InvalidExtraAccountMetaList,
    #[msg("Unsupported transfer hook instruction")]
    InvalidInstruction,
}

fn build_extra_account_metas(stablecoin_program_id: &Pubkey) -> Result<Vec<ExtraAccountMeta>> {
    Ok(vec![
        ExtraAccountMeta::new_with_pubkey(&crate::ID, false, false)?,
        ExtraAccountMeta::new_external_pda_with_seeds(
            TRANSFER_HOOK_PROGRAM_INDEX,
            &[Seed::Literal {
                bytes: SEED_HOOK_CONFIG.to_vec(),
            }],
            false,
            false,
        )?,
        ExtraAccountMeta::new_with_pubkey(stablecoin_program_id, false, false)?,
        ExtraAccountMeta::new_external_pda_with_seeds(
            CORE_PROGRAM_INDEX,
            &[
                Seed::Literal {
                    bytes: SEED_CONFIG.to_vec(),
                },
                Seed::AccountKey {
                    index: MINT_ACCOUNT_INDEX,
                },
            ],
            false,
            false,
        )?,
        ExtraAccountMeta::new_external_pda_with_seeds(
            CORE_PROGRAM_INDEX,
            &[
                Seed::Literal {
                    bytes: SEED_BLACKLIST.to_vec(),
                },
                Seed::AccountKey {
                    index: MINT_ACCOUNT_INDEX,
                },
                Seed::AccountData {
                    account_index: SOURCE_TOKEN_ACCOUNT_INDEX,
                    data_index: TOKEN_ACCOUNT_OWNER_OFFSET,
                    length: TOKEN_ACCOUNT_OWNER_LENGTH,
                },
            ],
            false,
            false,
        )?,
        ExtraAccountMeta::new_external_pda_with_seeds(
            CORE_PROGRAM_INDEX,
            &[
                Seed::Literal {
                    bytes: SEED_BLACKLIST.to_vec(),
                },
                Seed::AccountKey {
                    index: MINT_ACCOUNT_INDEX,
                },
                Seed::AccountData {
                    account_index: DESTINATION_TOKEN_ACCOUNT_INDEX,
                    data_index: TOKEN_ACCOUNT_OWNER_OFFSET,
                    length: TOKEN_ACCOUNT_OWNER_LENGTH,
                },
            ],
            false,
            false,
        )?,
    ])
}
