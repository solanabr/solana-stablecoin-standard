use anchor_lang::prelude::*;
use anchor_lang::system_program::{create_account, CreateAccount};
use anchor_spl::token_2022::Token2022;
use anchor_spl::token_interface::Mint;
use spl_tlv_account_resolution::{
    account::ExtraAccountMeta, seeds::Seed, state::ExtraAccountMetaList,
};
use spl_transfer_hook_interface::instruction::ExecuteInstruction;

use crate::state::*;
use sss_events::HookInitialized;

#[derive(Accounts)]
pub struct InitializeHook<'info> {
    /// Authority paying for account creation.
    #[account(mut)]
    pub authority: Signer<'info>,

    /// The stablecoin Token-2022 mint.
    pub mint: InterfaceAccount<'info, Mint>,

    /// The core program's StablecoinConfig. Validates this mint has a config.
    /// CHECK: Validated by reading and deserializing account data.
    pub stablecoin_config: UncheckedAccount<'info>,

    /// Hook configuration PDA.
    #[account(
        init,
        payer = authority,
        space = 8 + HookConfig::INIT_SPACE,
        seeds = [HOOK_CONFIG_SEED, mint.key().as_ref()],
        bump,
    )]
    pub hook_config: Account<'info, HookConfig>,

    /// The ExtraAccountMetaList PDA required by spl-transfer-hook-interface.
    /// CHECK: Created in this instruction. PDA validated by seeds.
    #[account(
        mut,
        seeds = [EXTRA_ACCOUNT_METAS_SEED, mint.key().as_ref()],
        bump,
    )]
    pub extra_account_meta_list: UncheckedAccount<'info>,

    /// The sss-core program ID (needed for external PDA derivation).
    /// CHECK: Stored in hook_config for future validation.
    pub core_program: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token2022>,
    pub system_program: Program<'info, System>,
}

pub fn handle_initialize_hook(ctx: Context<InitializeHook>) -> Result<()> {
    let mint_key = ctx.accounts.mint.key();
    let core_program_key = ctx.accounts.core_program.key();

    // ── 1. Populate HookConfig ──────────────────────────────────────────────
    let hook_config = &mut ctx.accounts.hook_config;
    hook_config.mint = mint_key;
    hook_config.stablecoin_config = ctx.accounts.stablecoin_config.key();
    hook_config.core_program = core_program_key;
    hook_config.bump = ctx.bumps.hook_config;

    // ── 2. Build ExtraAccountMeta list ──────────────────────────────────────
    // During transfer_hook execution, Token-2022 passes these accounts:
    // [0] source_token, [1] mint, [2] destination_token, [3] owner,
    // [4] extra_account_meta_list
    //
    // Our extra accounts:
    // [5] core_program (literal pubkey)
    // [6] stablecoin_config (external PDA from core program)
    // [7] blacklist entry for source owner (PDA from this program)
    // [8] blacklist entry for dest owner (PDA from this program)

    let extra_account_metas = vec![
        // [5] Core program ID as a literal account
        ExtraAccountMeta::new_with_pubkey(&core_program_key, false, false)?,
        // [6] StablecoinConfig — external PDA owned by sss-core
        // Derived: PDA([b"config", mint.key()], core_program)
        ExtraAccountMeta::new_external_pda_with_seeds(
            5, // program at index 5 (core_program)
            &[
                Seed::Literal {
                    bytes: b"config".to_vec(),
                },
                Seed::AccountKey { index: 1 }, // mint pubkey
            ],
            false, // not signer
            false, // not writable
        )?,
        // [7] BlacklistEntry for SOURCE owner — PDA owned by this hook program
        // Derived: PDA([b"blacklist", mint.key(), source_token.owner], this_program)
        ExtraAccountMeta::new_with_seeds(
            &[
                Seed::Literal {
                    bytes: b"blacklist".to_vec(),
                },
                Seed::AccountKey { index: 1 }, // mint pubkey
                Seed::AccountData {
                    account_index: 0, // source_token account
                    data_index: 32,   // owner field offset in token account
                    length: 32,       // pubkey length
                },
            ],
            false, // not signer
            false, // not writable
        )?,
        // [8] BlacklistEntry for DESTINATION owner — PDA owned by this hook program
        // Derived: PDA([b"blacklist", mint.key(), dest_token.owner], this_program)
        ExtraAccountMeta::new_with_seeds(
            &[
                Seed::Literal {
                    bytes: b"blacklist".to_vec(),
                },
                Seed::AccountKey { index: 1 }, // mint pubkey
                Seed::AccountData {
                    account_index: 2, // destination_token account
                    data_index: 32,   // owner field offset
                    length: 32,
                },
            ],
            false,
            false,
        )?,
    ];

    // ── 3. Create and initialize the ExtraAccountMetaList ───────────────────
    let account_size = ExtraAccountMetaList::size_of(extra_account_metas.len())? as u64;
    let lamports = Rent::get()?.minimum_balance(account_size as usize);

    let signer_seeds: &[&[&[u8]]] = &[&[
        EXTRA_ACCOUNT_METAS_SEED,
        mint_key.as_ref(),
        &[ctx.bumps.extra_account_meta_list],
    ]];

    create_account(
        CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            CreateAccount {
                from: ctx.accounts.authority.to_account_info(),
                to: ctx.accounts.extra_account_meta_list.to_account_info(),
            },
        )
        .with_signer(signer_seeds),
        lamports,
        account_size,
        &crate::ID,
    )?;

    ExtraAccountMetaList::init::<ExecuteInstruction>(
        &mut ctx.accounts.extra_account_meta_list.try_borrow_mut_data()?,
        &extra_account_metas,
    )?;

    // ── 4. EMIT EVENT ───────────────────────────────────────────────────────
    emit!(HookInitialized {
        mint: mint_key,
        hook_config: ctx.accounts.hook_config.key(),
    });

    Ok(())
}
