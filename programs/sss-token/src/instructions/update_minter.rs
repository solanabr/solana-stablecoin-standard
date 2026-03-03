use anchor_lang::prelude::*;

use crate::{errors::SssError, events::MinterUpdated, state::{MinterInfo, StablecoinState}};

#[derive(Accounts)]
#[instruction(quota: u64, active: bool)]
pub struct UpdateMinter<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(mut)]
    pub state: Account<'info, StablecoinState>,

    ///CHECK: We only need the minter's pubkey, so we can use UncheckedAccount to save compute by skipping deserialization
    pub minter: UncheckedAccount<'info>,

    #[account(
        init,
        payer = authority,
        space = MinterInfo::LEN,
    )]
    pub minter_info: Account<'info, MinterInfo>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<UpdateMinter>, quota: u64, active: bool) -> Result<()> {
    require!(ctx.accounts.authority.key() == ctx.accounts.state.master_authority, SssError::Unauthorized);
    
    // Verify state is the correct PDA
    let (expected_state_pda, _) = Pubkey::find_program_address(
        &[b"stablecoin", ctx.accounts.state.mint.as_ref()],
        &crate::ID,
    );
    require!(ctx.accounts.state.key() == expected_state_pda, SssError::Unauthorized);
    
    // Verify minter_info is the correct PDA
    let (expected_minter_pda, bump) = Pubkey::find_program_address(
        &[
            b"minter",
            ctx.accounts.state.key().as_ref(),
            ctx.accounts.minter.key().as_ref(),
        ],
        &crate::ID,
    );
    require!(ctx.accounts.minter_info.key() == expected_minter_pda, SssError::Unauthorized);
    
    let minter_info = &mut ctx.accounts.minter_info;
    
    // Only initialize on first creation
    if minter_info.stablecoin == Pubkey::default() {
        minter_info.stablecoin = ctx.accounts.state.key();
        minter_info.minter = ctx.accounts.minter.key();
        minter_info.minted_this_epoch = 0;
        minter_info.bump = bump;
    }

    minter_info.quota = quota;
    minter_info.active = active;

    // Reset epoch counter when re-activating or changing quota
    if !active {
        minter_info.minted_this_epoch = 0;
    }

    emit!(MinterUpdated {
        mint: ctx.accounts.state.mint,
        minter: ctx.accounts.minter.key(),
        quota,
        active,
        authority: ctx.accounts.authority.key(),
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}