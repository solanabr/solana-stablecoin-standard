use anchor_lang::prelude::*;
use crate::state::BlacklistRecord;

// ДОБАВЛЯЕМ СОБЫТИЕ
#[event]
pub struct BlacklistedEvent { 
    pub wallet: Pubkey, 
    pub reason: String 
}

#[derive(Accounts)]
#[instruction(wallet: Pubkey)]
pub struct ManageBlacklist<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    
    #[account(
        init_if_needed,
        payer = payer,
        space = 8 + 1,
        seeds = [BlacklistRecord::SEED, wallet.as_ref()],
        bump
    )]
    pub blacklist_record: Account<'info, BlacklistRecord>,
    pub system_program: Program<'info, System>,
}

pub fn add_to_blacklist(ctx: Context<ManageBlacklist>, wallet: Pubkey) -> Result<()> {
    ctx.accounts.blacklist_record.bump = ctx.bumps.blacklist_record;
    
    // ВЫЗЫВАЕМ СОБЫТИЕ
    emit!(BlacklistedEvent {
        wallet,
        reason: "Added to blacklist via Hook".to_string() // В идеале передавать reason в аргументах
    });
    
    Ok(())
}

pub fn remove_from_blacklist(_ctx: Context<ManageBlacklist>, _wallet: Pubkey) -> Result<()> {
    Ok(())
}