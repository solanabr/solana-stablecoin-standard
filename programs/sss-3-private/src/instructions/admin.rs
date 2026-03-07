use anchor_lang::prelude::*;
use crate::state::PrivateStablecoinState;
use crate::errors::SSSPrivateError;
use crate::events::AuditorUpdatedEvent;

// ─── Update Auditor ──────────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct UpdateAuditor<'info> {
    /// The authority managing this stablecoin
    #[account(mut)]
    pub authority: Signer<'info>,

    /// The private stablecoin state
    #[account(
        mut,
        has_one = authority @ SSSPrivateError::Unauthorized,
    )]
    pub state: Account<'info, PrivateStablecoinState>,
}

pub fn update_auditor_handler(
    ctx: Context<UpdateAuditor>,
    new_auditor_elgamal_pubkey: [u8; 32],
) -> Result<()> {
    // Validate new key is not all zeros
    require!(
        new_auditor_elgamal_pubkey != [0u8; 32],
        SSSPrivateError::InvalidAuditorKey
    );

    let clock = Clock::get()?;
    let state = &mut ctx.accounts.state;

    let old_key = state.auditor_elgamal_pubkey;
    state.auditor_elgamal_pubkey = new_auditor_elgamal_pubkey;

    // NOTE: In production, this would also call:
    //   spl_token_2022::extension::confidential_transfer::instruction::update_mint(
    //       token_program_id,
    //       mint,
    //       new_authority,
    //       auto_approve_new_accounts,
    //       new_auditor_elgamal_pubkey,
    //   )

    msg!(
        "SSS-3: Updated auditor ElGamal key for {}",
        state.mint
    );

    emit!(AuditorUpdatedEvent {
        state: state.key(),
        old_auditor_key: old_key,
        new_auditor_key: new_auditor_elgamal_pubkey,
        updated_by: ctx.accounts.authority.key(),
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}
