use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenInterface};
use spl_tlv_account_resolution::{
    account::ExtraAccountMeta,
    seeds::Seed,
    state::ExtraAccountMetaList,
};
use spl_transfer_hook_interface::instruction::ExecuteInstruction;

// Account index mapping for the transfer instruction passed to the hook:
// 0 = source token account
// 1 = mint
// 2 = destination token account
// 3 = owner (source token account owner / authority)
// 4 = extra_account_meta_list PDA
// Extra accounts appended after index 4:
// 5 = sss-token program (needed to derive external PDAs)
// 6 = source owner BlacklistEntry PDA
// 7 = destination owner BlacklistEntry PDA

#[derive(Accounts)]
pub struct InitializeExtraAccountMetaList<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    /// CHECK: ExtraAccountMetaList PDA, initialized by this instruction.
    /// Space calculated by ExtraAccountMetaList::size_of(3) for 3 extra accounts.
    #[account(
        init,
        seeds = [b"extra-account-metas", mint.key().as_ref()],
        bump,
        space = ExtraAccountMetaList::size_of(3).unwrap(),
        payer = payer,
    )]
    pub extra_account_meta_list: UncheckedAccount<'info>,

    pub mint: InterfaceAccount<'info, Mint>,
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<InitializeExtraAccountMetaList>,
    sss_token_program_id: Pubkey,
) -> Result<()> {
    let extra_account_metas = build_extra_account_metas(&sss_token_program_id)?;

    let mut data = ctx.accounts.extra_account_meta_list.try_borrow_mut_data()?;
    ExtraAccountMetaList::init::<ExecuteInstruction>(&mut data, &extra_account_metas)?;

    Ok(())
}

/// Build the three ExtraAccountMeta entries that Token-2022 will pass to the hook.
///
/// Extra account 0 — sss-token program (account index 5):
///   A fixed pubkey for the sss-token program that owns the BlacklistEntry PDAs.
///   Required so Token-2022 can resolve the two external PDAs below.
///
/// Extra account 1 — source owner BlacklistEntry PDA (account index 6):
///   seeds: ["blacklist", mint (account index 1), source_owner (account index 3)]
///   Derived by the sss-token program at account index 5.
///
/// Extra account 2 — destination owner BlacklistEntry PDA (account index 7):
///   seeds: ["blacklist", mint (account index 1), dest_owner derived from dest token account data]
///   The destination token account is at index 2; owner field starts at byte offset 32 (32 bytes).
///   Derived by the sss-token program at account index 5.
pub fn build_extra_account_metas(sss_token_program_id: &Pubkey) -> Result<Vec<ExtraAccountMeta>> {
    // Extra account 0 (index 5): the sss-token program itself.
    let sss_program_meta =
        ExtraAccountMeta::new_with_pubkey(sss_token_program_id, false, false)?;

    // Extra account 1 (index 6): source owner BlacklistEntry PDA.
    // Derived externally by the sss-token program (at account index 5).
    let source_blacklist_meta = ExtraAccountMeta::new_external_pda_with_seeds(
        5, // program_index: sss_token_program at account index 5
        &[
            Seed::Literal {
                bytes: b"blacklist".to_vec(),
            },
            Seed::AccountKey { index: 1 }, // mint
            Seed::AccountKey { index: 3 }, // source token account owner/authority
        ],
        false, // is_signer
        false, // is_writable
    )?;

    // Extra account 2 (index 7): destination owner BlacklistEntry PDA.
    // The destination token account (index 2) stores the owner pubkey at bytes [32..64].
    // spl-tlv-account-resolution reads those bytes at runtime to derive this PDA.
    let dest_blacklist_meta = ExtraAccountMeta::new_external_pda_with_seeds(
        5, // program_index: sss_token_program at account index 5
        &[
            Seed::Literal {
                bytes: b"blacklist".to_vec(),
            },
            Seed::AccountKey { index: 1 }, // mint
            Seed::AccountData {
                account_index: 2, // destination token account
                data_index: 32,   // owner field offset in token account layout
                length: 32,       // Pubkey is 32 bytes
            },
        ],
        false, // is_signer
        false, // is_writable
    )?;

    Ok(vec![sss_program_meta, source_blacklist_meta, dest_blacklist_meta])
}
