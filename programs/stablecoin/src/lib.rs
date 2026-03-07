//! Solana Stablecoin Standard (SSS)
//! 
//! Modular SDK para stablecoins em Solana com dois presets:
//! - SSS-1: Minimal Stablecoin (mint + freeze + metadata)
//! - SSS-2: Compliant Stablecoin (SSS-1 + blacklist + seize)

use anchor_lang::prelude::*;
use anchor_spl::{
    token_2022::{self, Token2022},
    token_interface::{Mint, TokenAccount},
};

declare_id!("Stable111111111111111111111111111111111111111");

#[program]
pub mod stablecoin {
    use super::*;

    /// Inicializa uma nova stablecoin com configuração customizável
    pub fn initialize(ctx: Context<Initialize>, config: StablecoinConfig) -> Result<()> {
        let stablecoin = &mut ctx.accounts.stablecoin;
        stablecoin.authority = ctx.accounts.authority.key();
        stablecoin.mint = ctx.accounts.mint.key();
        stablecoin.config = config;
        stablecoin.paused = false;
        stablecoin.total_supply = 0;
        Ok(())
    }

    /// Mint de tokens (apenas para minters autorizados)
    pub fn mint(ctx: Context<Mint>, amount: u64) -> Result<()> {
        let stablecoin = &ctx.accounts.stablecoin;
        require!(!stablecoin.paused, StablecoinError::VaultPaused);
        require!(amount > 0, StablecoinError::ZeroAmount);

        token_2022::mint_to(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                token_2022::MintTo {
                    mint: ctx.accounts.mint.to_account_info(),
                    to: ctx.accounts.to.to_account_info(),
                    authority: ctx.accounts.minter.to_account_info(),
                },
            ),
            amount,
        )?;

        ctx.accounts.stablecoin.total_supply = ctx.accounts.stablecoin.total_supply.checked_add(amount).unwrap();
        emit!(MintEvent { amount, to: ctx.accounts.to.key() });
        Ok(())
    }

    /// Burn de tokens
    pub fn burn(ctx: Context<Burn>, amount: u64) -> Result<()> {
        let stablecoin = &ctx.accounts.stablecoin;
        require!(!stablecoin.paused, StablecoinError::VaultPaused);
        require!(amount > 0, StablecoinError::ZeroAmount);

        token_2022::burn(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                token_2022::Burn {
                    mint: ctx.accounts.mint.to_account_info(),
                    from: ctx.accounts.from.to_account_info(),
                    authority: ctx.accounts.authority.to_account_info(),
                },
            ),
            amount,
        )?;

        ctx.accounts.stablecoin.total_supply = ctx.accounts.stablecoin.total_supply.checked_sub(amount).unwrap();
        emit!(BurnEvent { amount, from: ctx.accounts.from.key() });
        Ok(())
    }

    /// Freeze de conta (apenas para autoridade)
    pub fn freeze_account(ctx: Context<FreezeAccount>) -> Result<()> {
        let stablecoin = &ctx.accounts.stablecoin;
        require!(!stablecoin.paused, StablecoinError::VaultPaused);

        token_2022::freeze_account(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                token_2022::FreezeAccount {
                    mint: ctx.accounts.mint.to_account_info(),
                    account: ctx.accounts.account.to_account_info(),
                    authority: ctx.accounts.authority.to_account_info(),
                },
            ),
        )?;
        emit!(FreezeEvent { account: ctx.accounts.account.key() });
        Ok(())
    }

    /// Thaw de conta congelada
    pub fn thaw_account(ctx: Context<ThawAccount>) -> Result<()> {
        token_2022::thaw_account(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                token_2022::ThawAccount {
                    mint: ctx.accounts.mint.to_account_info(),
                    account: ctx.accounts.account.to_account_info(),
                    authority: ctx.accounts.authority.to_account_info(),
                },
            ),
        )?;
        emit!(ThawEvent { account: ctx.accounts.account.key() });
        Ok(())
    }

    /// Pause todas as operações (emergency)
    pub fn pause(ctx: Context<Pause>) -> Result<()> {
        let stablecoin = &mut ctx.accounts.stablecoin;
        stablecoin.paused = true;
        emit!(PauseEvent { paused: true });
        Ok(())
    }

    /// Unpause e retomar operações
    pub fn unpause(ctx: Context<Unpause>) -> Result<()> {
        let stablecoin = &mut ctx.accounts.stablecoin;
        stablecoin.paused = false;
        emit!(PauseEvent { paused: false });
        Ok(())
    }

    /// Transferir autoridade
    pub fn transfer_authority(ctx: Context<TransferAuthority>, new_authority: Pubkey) -> Result<()> {
        let stablecoin = &mut ctx.accounts.stablecoin;
        stablecoin.authority = new_authority;
        emit!(AuthorityTransferEvent { old_authority: ctx.accounts.authority.key(), new_authority });
        Ok(())
    }

    // === SSS-2 COMPLIANCE FUNCTIONS ===

    /// Adicionar endereço à blacklist (SSS-2 only)
    pub fn add_to_blacklist(ctx: Context<Compliance>, address: Pubkey) -> Result<()> {
        let stablecoin = &ctx.accounts.stablecoin;
        require!(stablecoin.config.enable_transfer_hook, StablecoinError::ComplianceNotEnabled);
        
        let blacklist = &mut ctx.accounts.blacklist;
        blacklist.blacklisted_addresses.push(address);
        emit!(BlacklistAddEvent { address });
        Ok(())
    }

    /// Remover endereço da blacklist (SSS-2 only)
    pub fn remove_from_blacklist(ctx: Context<Compliance>, address: Pubkey) -> Result<()> {
        let stablecoin = &ctx.accounts.stablecoin;
        require!(stablecoin.config.enable_transfer_hook, StablecoinError::ComplianceNotEnabled);
        
        let blacklist = &mut ctx.accounts.blacklist;
        blacklist.blacklisted_addresses.retain(|&addr| addr != address);
        emit!(BlacklistRemoveEvent { address });
        Ok(())
    }

    /// Seize tokens de conta congelada (SSS-2 only, via permanent delegate)
    pub fn seize(ctx: Context<Seize>, amount: u64, to: Pubkey) -> Result<()> {
        let stablecoin = &ctx.accounts.stablecoin;
        require!(stablecoin.config.enable_permanent_delegate, StablecoinError::PermanentDelegateNotEnabled);
        require!(!stablecoin.paused, StablecoinError::VaultPaused);

        token_2022::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                token_2022::Transfer {
                    from: ctx.accounts.from.to_account_info(),
                    to: ctx.accounts.to.to_account_info(),
                    authority: ctx.accounts.authority.to_account_info(),
                },
            ),
            amount,
        )?;
        emit!(SeizeEvent { from: ctx.accounts.from.key(), to, amount });
        Ok(())
    }
}

// === CONFIGURAÇÃO ===

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct StablecoinConfig {
    pub name: String,
    pub symbol: String,
    pub uri: String,
    pub decimals: u8,
    // SSS-2 compliance flags
    pub enable_permanent_delegate: bool,
    pub enable_transfer_hook: bool,
    pub default_account_frozen: bool,
}

// === CONTAS ===

#[account]
pub struct Stablecoin {
    pub authority: Pubkey,
    pub mint: Pubkey,
    pub config: StablecoinConfig,
    pub paused: bool,
    pub total_supply: u64,
    pub bump: u8,
}

#[account]
pub struct Blacklist {
    pub stablecoin: Pubkey,
    pub blacklisted_addresses: Vec<Pubkey>,
    pub bump: u8,
}

// === CONTEXTOS ===

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        init,
        payer = authority,
        space = 8 + Stablecoin::INIT_SPACE,
        seeds = [b"stablecoin", mint.key().as_ref()],
        bump
    )]
    pub stablecoin: Account<'info, Stablecoin>,
    #[account(
        init,
        payer = authority,
        mint::decimals = config.decimals,
        mint::authority = authority,
        mint::freeze_authority = authority,
        extensions::permanent_delegate,
        extensions::transfer_hook
    )]
    pub mint: InterfaceAccount<'info, Mint>,
    pub token_program: Program<'info, Token2022>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Mint<'info> {
    #[account(
        has_one = mint,
        has_one = authority
    )]
    pub stablecoin: Account<'info, Stablecoin>,
    pub minter: Signer<'info>,
    pub authority: AccountInfo<'info>,
    #[account(mut)]
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(mut)]
    pub to: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Program<'info, Token2022>,
}

#[derive(Accounts)]
pub struct Burn<'info> {
    #[account(
        has_one = mint,
        has_one = authority
    )]
    pub stablecoin: Account<'info, Stablecoin>,
    pub authority: Signer<'info>,
    #[account(mut)]
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(mut)]
    pub from: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Program<'info, Token2022>,
}

#[derive(Accounts)]
pub struct FreezeAccount<'info> {
    #[account(
        has_one = mint,
        has_one = authority
    )]
    pub stablecoin: Account<'info, Stablecoin>,
    pub authority: Signer<'info>,
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(mut)]
    pub account: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Program<'info, Token2022>,
}

#[derive(Accounts)]
pub struct ThawAccount<'info> {
    #[account(
        has_one = mint,
        has_one = authority
    )]
    pub stablecoin: Account<'info, Stablecoin>,
    pub authority: Signer<'info>,
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(mut)]
    pub account: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Program<'info, Token2022>,
}

#[derive(Accounts)]
pub struct Pause<'info> {
    #[account(
        has_one = authority
    )]
    pub stablecoin: Account<'info, Stablecoin>,
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct Unpause<'info> {
    #[account(
        has_one = authority
    )]
    pub stablecoin: Account<'info, Stablecoin>,
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct TransferAuthority<'info> {
    #[account(
        has_one = authority
    )]
    pub stablecoin: Account<'info, Stablecoin>,
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct Compliance<'info> {
    #[account(
        has_one = authority
    )]
    pub stablecoin: Account<'info, Stablecoin>,
    pub authority: Signer<'info>,
    #[account(
        init_if_needed,
        payer = authority,
        space = 8 + Blacklist::INIT_SPACE,
        seeds = [b"blacklist", stablecoin.key().as_ref()],
        bump
    )]
    pub blacklist: Account<'info, Blacklist>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Seize<'info> {
    #[account(
        has_one = mint,
        has_one = authority
    )]
    pub stablecoin: Account<'info, Stablecoin>,
    pub authority: Signer<'info>,
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(mut)]
    pub from: InterfaceAccount<'info, TokenAccount>,
    #[account(mut)]
    pub to: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Program<'info, Token2022>,
}

// === EVENTOS ===

#[event]
pub struct MintEvent {
    pub amount: u64,
    pub to: Pubkey,
}

#[event]
pub struct BurnEvent {
    pub amount: u64,
    pub from: Pubkey,
}

#[event]
pub struct FreezeEvent {
    pub account: Pubkey,
}

#[event]
pub struct ThawEvent {
    pub account: Pubkey,
}

#[event]
pub struct PauseEvent {
    pub paused: bool,
}

#[event]
pub struct AuthorityTransferEvent {
    pub old_authority: Pubkey,
    pub new_authority: Pubkey,
}

#[event]
pub struct BlacklistAddEvent {
    pub address: Pubkey,
}

#[event]
pub struct BlacklistRemoveEvent {
    pub address: Pubkey,
}

#[event]
pub struct SeizeEvent {
    pub from: Pubkey,
    pub to: Pubkey,
    pub amount: u64,
}

// === ERROS ===

#[error_code]
pub enum StablecoinError {
    #[msg("Amount must be greater than zero")]
    ZeroAmount,
    #[msg("Vault is paused")]
    VaultPaused,
    #[msg("Compliance module not enabled")]
    ComplianceNotEnabled,
    #[msg("Permanent delegate not enabled")]
    PermanentDelegateNotEnabled,
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("Math overflow")]
    MathOverflow,
}
