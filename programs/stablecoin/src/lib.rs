#![allow(unexpected_cfgs)]

use anchor_lang::prelude::*;

pub mod errors;
pub mod events;
pub mod instructions;
pub mod state;

use instructions::blacklist::{
    __client_accounts_add_to_blacklist, __client_accounts_remove_from_blacklist,
};
use instructions::burn::__client_accounts_burn_tokens;
use instructions::compliance::{
    __client_accounts_revoke_proof_receipt, __client_accounts_submit_proof_receipt,
    __client_accounts_update_compliance_root,
};
use instructions::freeze::{__client_accounts_freeze_account, __client_accounts_thaw_account};
use instructions::initialize::__client_accounts_initialize;
use instructions::mint::__client_accounts_mint_tokens;
use instructions::pause::__client_accounts_toggle_pause;
use instructions::roles::{
    __client_accounts_accept_authority, __client_accounts_propose_authority,
    __client_accounts_update_roles,
};
use instructions::seize::__client_accounts_seize_tokens;

use instructions::blacklist::{add_handler, remove_handler, AddToBlacklist, RemoveFromBlacklist};
use instructions::burn::{handler as burn_handler, BurnTokens};
use instructions::compliance::{
    revoke_proof_receipt_handler, submit_proof_receipt_handler, update_compliance_root_handler,
    RevokeProofReceipt, SubmitProofReceipt, SubmitProofReceiptParams, UpdateComplianceRoot,
};
use instructions::freeze::{freeze_handler, thaw_handler, FreezeAccount, ThawAccount};
use instructions::initialize::{handler as initialize_handler, Initialize, InitializeParams};
use instructions::mint::{handler as mint_handler, MintTokens};
use instructions::pause::{pause_handler, unpause_handler, TogglePause};
use instructions::roles::{
    accept_authority_handler, propose_authority_handler, update_roles_handler, AcceptAuthority,
    ProposeAuthority, UpdateRoleParams, UpdateRoles,
};
use instructions::seize::{handler as seize_handler, SeizeTokens};

declare_id!("Gm2SdmH1ydLKmPtjNE4W2ZLjW5kMvPrx784L7oUcw4w");

#[program]
pub mod stablecoin {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>, params: InitializeParams) -> Result<()> {
        initialize_handler(ctx, params)
    }

    pub fn mint(ctx: Context<MintTokens>, amount: u64) -> Result<()> {
        mint_handler(ctx, amount)
    }

    pub fn burn(ctx: Context<BurnTokens>, amount: u64) -> Result<()> {
        burn_handler(ctx, amount)
    }

    pub fn freeze_account(ctx: Context<FreezeAccount>) -> Result<()> {
        freeze_handler(ctx)
    }

    pub fn thaw_account(ctx: Context<ThawAccount>) -> Result<()> {
        thaw_handler(ctx)
    }

    pub fn pause(ctx: Context<TogglePause>) -> Result<()> {
        pause_handler(ctx)
    }

    pub fn unpause(ctx: Context<TogglePause>) -> Result<()> {
        unpause_handler(ctx)
    }

    pub fn update_roles(ctx: Context<UpdateRoles>, params: UpdateRoleParams) -> Result<()> {
        update_roles_handler(ctx, params)
    }

    pub fn propose_authority(ctx: Context<ProposeAuthority>, pending: Pubkey) -> Result<()> {
        propose_authority_handler(ctx, pending)
    }

    pub fn accept_authority(ctx: Context<AcceptAuthority>) -> Result<()> {
        accept_authority_handler(ctx)
    }

    pub fn add_to_blacklist(
        ctx: Context<AddToBlacklist>,
        address: Pubkey,
        reason: String,
    ) -> Result<()> {
        add_handler(ctx, address, reason)
    }

    pub fn remove_from_blacklist(ctx: Context<RemoveFromBlacklist>) -> Result<()> {
        remove_handler(ctx)
    }

    pub fn seize<'info>(ctx: Context<'_, '_, '_, 'info, SeizeTokens<'info>>) -> Result<()> {
        seize_handler(ctx)
    }

    pub fn update_compliance_root(
        ctx: Context<UpdateComplianceRoot>,
        root: String,
    ) -> Result<()> {
        update_compliance_root_handler(ctx, root)
    }

    pub fn submit_proof_receipt(
        ctx: Context<SubmitProofReceipt>,
        params: SubmitProofReceiptParams,
    ) -> Result<()> {
        submit_proof_receipt_handler(ctx, params)
    }

    pub fn revoke_proof_receipt(ctx: Context<RevokeProofReceipt>) -> Result<()> {
        revoke_proof_receipt_handler(ctx)
    }
}
