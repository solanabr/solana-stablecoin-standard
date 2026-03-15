use anchor_lang::prelude::*;
use anchor_spl::token_2022::Token2022;
use anchor_spl::token_interface::Mint;
use spl_tlv_account_resolution::{
    account::ExtraAccountMeta,
    seeds::Seed,
    state::ExtraAccountMetaList,
};
use crate::constants::*;

/// Accounts required to initialize the extra account meta list for a mint.
/// This tells Token-2022 which extra accounts the hook needs at transfer time.
#[derive(Accounts)]
pub struct InitializeExtraAccountMetaList<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    /// CHECK: The ExtraAccountMetaList PDA — validated by seeds
    #[account(
        mut,
        seeds = [EXTRA_ACCOUNT_METAS_SEED, mint.key().as_ref()],
        bump,
    )]
    pub extra_account_meta_list: UncheckedAccount<'info>,

    pub mint: InterfaceAccount<'info, Mint>,

    pub token_program: Program<'info, Token2022>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<InitializeExtraAccountMetaList>) -> Result<()> {
    let mint_key = ctx.accounts.mint.key();

    // We register two extra accounts the execute hook needs:
    //   1. Blacklist PDA for the source token account owner (wallet)
    //      seeds: [BLACKLIST_SEED, mint, source_owner]
    //      The source owner is account index 3 in the transfer instruction.
    //      (source_account=0, mint=1, destination_account=2, source_owner=3)
    //   2. Blacklist PDA for the destination token account owner (wallet)
    //      seeds: [BLACKLIST_SEED, mint, destination_owner]
    //      Token-2022 does not pass the destination owner as a separate account.
    //      We extract it from the destination token account data using
    //      Seed::AccountData (offset 32, 32 bytes = owner field in TokenAccount).
    //      This correctly maps any ATA back to the owning wallet so that
    //      blacklisted wallets cannot bypass enforcement by creating new ATAs.
    //
    // Transfer instruction account layout:
    //   0: source_token_account
    //   1: mint
    //   2: destination_token_account
    //   3: owner/authority (source token account owner)
    //   4: extra_account_meta_list (always included by Token-2022)
    // Extra accounts (index 5+):
    //   5: blacklist_entry for source owner  — seeds derived from index 3
    //   6: blacklist_entry for destination owner — seeds derived from data of index 2

    // Register the two blacklist PDA derivations using seed references:
    // Seed::AccountKey { index } references the account at that position in the
    // transfer instruction accounts array.

    // source blacklist PDA: seeds = [BLACKLIST_SEED, mint(idx 1), source_owner(idx 3)]
    // The source owner is the wallet that owns the source token account (passed at index 3).
    let source_blacklist_meta = ExtraAccountMeta::new_with_seeds(
        &[
            Seed::Literal {
                bytes: BLACKLIST_SEED.to_vec(),
            },
            Seed::AccountKey { index: 1 }, // mint
            Seed::AccountKey { index: 3 }, // source owner (wallet)
        ],
        false, // is_signer
        false, // is_writable
    )?;

    // destination blacklist PDA: seeds = [BLACKLIST_SEED, mint(idx 1), destination_owner]
    //
    // The destination owner is NOT a separate account in the transfer instruction.
    // We read it from the token account data at account index 2 (destination_token_account).
    //
    // Token-2022 token account layout:
    //   offset  0..32 — mint  (Pubkey)
    //   offset 32..64 — owner (Pubkey)  <-- we read this
    //   offset 64..72 — amount (u64)
    //
    // Using Seed::AccountData extracts 32 bytes starting at offset 32 from the
    // destination token account, giving us the owner wallet pubkey. This ensures
    // that blacklisted wallets cannot bypass enforcement by creating new ATAs —
    // every ATA they own maps to the same wallet pubkey in the blacklist.
    let dest_blacklist_meta = ExtraAccountMeta::new_with_seeds(
        &[
            Seed::Literal {
                bytes: BLACKLIST_SEED.to_vec(),
            },
            Seed::AccountKey { index: 1 }, // mint
            Seed::AccountData {
                account_index: 2, // destination_token_account
                data_index: 32,   // offset of owner field in TokenAccount layout
                length: 32,       // size of Pubkey
            },
        ],
        false,
        false,
    )?;

    let extra_metas = vec![source_blacklist_meta, dest_blacklist_meta];

    // Calculate required space
    let account_size = ExtraAccountMetaList::size_of(extra_metas.len())?;
    let lamports = Rent::get()?.minimum_balance(account_size);

    let mint_key_ref = mint_key.as_ref();
    let bump = ctx.bumps.extra_account_meta_list;
    let signer_seeds: &[&[&[u8]]] = &[&[
        EXTRA_ACCOUNT_METAS_SEED,
        mint_key_ref,
        &[bump],
    ]];

    // Create the PDA account
    anchor_lang::solana_program::program::invoke_signed(
        &anchor_lang::solana_program::system_instruction::create_account(
            ctx.accounts.authority.key,
            ctx.accounts.extra_account_meta_list.key,
            lamports,
            account_size as u64,
            ctx.program_id,
        ),
        &[
            ctx.accounts.authority.to_account_info(),
            ctx.accounts.extra_account_meta_list.to_account_info(),
            ctx.accounts.system_program.to_account_info(),
        ],
        signer_seeds,
    )?;

    // Write the extra account metas into the account
    ExtraAccountMetaList::init::<spl_transfer_hook_interface::instruction::ExecuteInstruction>(
        &mut ctx.accounts.extra_account_meta_list.try_borrow_mut_data()?,
        &extra_metas,
    )?;

    Ok(())
}
