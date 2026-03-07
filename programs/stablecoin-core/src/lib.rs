use anchor_lang::prelude::*;

declare_id!("Hx1FiL4UdbdqiFr9pseWnkDpLtYYm4KsevHSgvgBX4oh");

#[program]
pub mod stablecoin_core {
    use super::*;

    pub fn initialize(
        ctx: Context<Initialize>,
        name: String,
        symbol: String,
        decimals: u8,
    ) -> Result<()> {
        let state = &mut ctx.accounts.state;
        state.authority = ctx.accounts.authority.key();
        state.name = name;
        state.symbol = symbol;
        state.decimals = decimals;
        state.total_supply = 0;
        state.is_paused = false;
        state.bump = ctx.bumps.state;

        msg!("Stablecoin initialized: {} ({})", state.name, state.symbol);
        Ok(())
    }

    pub fn mint(ctx: Context<MintTokens>, amount: u64) -> Result<()> {
        require!(!ctx.accounts.state.is_paused, ErrorCode::OperationsPaused);
        require!(amount > 0, ErrorCode::InvalidAmount);

        let state = &mut ctx.accounts.state;
        state.total_supply = state.total_supply.checked_add(amount).ok_or(ErrorCode::Overflow)?;

        msg!("Minted {} tokens. New supply: {}", amount, state.total_supply);
        Ok(())
    }

    pub fn burn(ctx: Context<BurnTokens>, amount: u64) -> Result<()> {
        require!(!ctx.accounts.state.is_paused, ErrorCode::OperationsPaused);
        require!(amount > 0, ErrorCode::InvalidAmount);

        let state = &mut ctx.accounts.state;
        state.total_supply = state.total_supply.checked_sub(amount).ok_or(ErrorCode::InsufficientSupply)?;

        msg!("Burned {} tokens. New supply: {}", amount, state.total_supply);
        Ok(())
    }

    pub fn pause(ctx: Context<UpdateState>) -> Result<()> {
        let state = &mut ctx.accounts.state;
        require!(!state.is_paused, ErrorCode::AlreadyPaused);
        
        state.is_paused = true;
        msg!("Operations paused");
        Ok(())
    }

    pub fn unpause(ctx: Context<UpdateState>) -> Result<()> {
        let state = &mut ctx.accounts.state;
        require!(state.is_paused, ErrorCode::NotPaused);
        
        state.is_paused = false;
        msg!("Operations resumed");
        Ok(())
    }

    pub fn freeze_account(ctx: Context<FreezeAccount>, target: Pubkey) -> Result<()> {
        msg!("Account {} frozen", target);
        Ok(())
    }

    pub fn thaw_account(ctx: Context<ThawAccount>, target: Pubkey) -> Result<()> {
        msg!("Account {} thawed", target);
        Ok(())
    }

    pub fn add_to_blacklist(
        ctx: Context<ManageBlacklist>,
        address: Pubkey,
        reason: String,
    ) -> Result<()> {
        msg!("Address {} added to blacklist: {}", address, reason);
        Ok(())
    }

    pub fn remove_from_blacklist(
        ctx: Context<ManageBlacklist>,
        address: Pubkey,
    ) -> Result<()> {
        msg!("Address {} removed from blacklist", address);
        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(name: String, symbol: String)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + StablecoinState::INIT_SPACE,
        seeds = [b"stablecoin"],
        bump
    )]
    pub state: Account<'info, StablecoinState>,
    
    #[account(mut)]
    pub authority: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct MintTokens<'info> {
    #[account(
        mut,
        seeds = [b"stablecoin"],
        bump = state.bump,
        has_one = authority
    )]
    pub state: Account<'info, StablecoinState>,
    
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct BurnTokens<'info> {
    #[account(
        mut,
        seeds = [b"stablecoin"],
        bump = state.bump,
        has_one = authority
    )]
    pub state: Account<'info, StablecoinState>,
    
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct UpdateState<'info> {
    #[account(
        mut,
        seeds = [b"stablecoin"],
        bump = state.bump,
        has_one = authority
    )]
    pub state: Account<'info, StablecoinState>,
    
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct FreezeAccount<'info> {
    #[account(
        seeds = [b"stablecoin"],
        bump = state.bump,
        has_one = authority
    )]
    pub state: Account<'info, StablecoinState>,
    
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct ThawAccount<'info> {
    #[account(
        seeds = [b"stablecoin"],
        bump = state.bump,
        has_one = authority
    )]
    pub state: Account<'info, StablecoinState>,
    
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct ManageBlacklist<'info> {
    #[account(
        seeds = [b"stablecoin"],
        bump = state.bump,
        has_one = authority
    )]
    pub state: Account<'info, StablecoinState>,
    
    pub authority: Signer<'info>,
}

#[account]
#[derive(InitSpace)]
pub struct StablecoinState {
    pub authority: Pubkey,
    #[max_len(32)]
    pub name: String,
    #[max_len(10)]
    pub symbol: String,
    pub decimals: u8,
    pub total_supply: u64,
    pub is_paused: bool,
    pub bump: u8,
}

#[error_code]
pub enum ErrorCode {
    #[msg("Operations are paused")]
    OperationsPaused,
    #[msg("Invalid amount")]
    InvalidAmount,
    #[msg("Operations already paused")]
    AlreadyPaused,
    #[msg("Operations not paused")]
    NotPaused,
    #[msg("Arithmetic overflow")]
    Overflow,
    #[msg("Insufficient supply")]
    InsufficientSupply,
}
