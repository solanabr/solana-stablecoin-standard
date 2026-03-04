use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenInterface};
use spl_tlv_account_resolution::state::ExtraAccountMetaList;
use spl_transfer_hook_interface::instruction::ExecuteInstruction;
use crate::instructions::initialize::build_extra_account_metas;

#[derive(Accounts)]
pub struct UpdateExtraAccountMetaList<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    /// CHECK: ExtraAccountMetaList PDA — updated in place.
    #[account(
        mut,
        seeds = [b"extra-account-metas", mint.key().as_ref()],
        bump,
    )]
    pub extra_account_meta_list: UncheckedAccount<'info>,

    pub mint: InterfaceAccount<'info, Mint>,
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<UpdateExtraAccountMetaList>,
    sss_token_program_id: Pubkey,
) -> Result<()> {
    let extra_account_metas = build_extra_account_metas(&sss_token_program_id)?;

    let mut data = ctx.accounts.extra_account_meta_list.try_borrow_mut_data()?;
    ExtraAccountMetaList::update::<ExecuteInstruction>(&mut data, &extra_account_metas)?;

    Ok(())
}
