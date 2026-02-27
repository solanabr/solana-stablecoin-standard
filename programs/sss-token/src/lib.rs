use anchor_lang::prelude::*;
use anchor_spl::token_2022::{self, Token2022};
use anchor_spl::token_interface::{Mint as InterfaceMint, TokenAccount as InterfaceTokenAccount};

// === ACCOUNT STRUCTURES ===

#[account]
pub struct StablecoinState {
    pub authority: Pubkey,           // Master authority
    pub mint: Pubkey,                // Token mint
    pub name: String,                // Token name
    pub symbol: String,              // Token symbol
    pub decimals: u8,                // Token decimals
    pub total_supply: u64,           // Current supply
    pub is_paused: bool,             // Emergency pause
    pub features: u8,                // Feature flags
    pub supply_cap: u64,             // Maximum supply (0 = unlimited)
    pub epoch_quota: u64,            // Per-epoch mint limit
    pub current_epoch_minted: u64,   // This epoch minted amount
    pub current_epoch_start: i64,    // Epoch start timestamp
    pub pending_authority: Option<Pubkey>, // Two-step transfer target
    pub bump: u8,                    // PDA bump
}

#[account]
pub struct RoleAccount {
    pub owner: Pubkey,               // Role holder
    pub roles: u8,                   // Bitmask of roles
    pub stablecoin: Pubkey,          // Associated stablecoin
    pub bump: u8,                    // PDA bump
}

#[account]
pub struct MinterInfo {
    pub minter: Pubkey,              // Minter address
    pub quota: u64,                  // Max mint amount
    pub minted: u64,                 // Already minted
    pub stablecoin: Pubkey,          // Associated stablecoin
    pub bump: u8,                    // PDA bump
}

#[account]
pub struct MultisigConfig {
    pub stablecoin: Pubkey,          // Associated stablecoin
    pub threshold: u8,               // Required approvals
    pub signers: Vec<Pubkey>,        // Authorized signers
    pub bump: u8,
}

#[account]
pub struct MultisigProposal {
    pub config: Pubkey,              // Associated config
    pub proposer: Pubkey,            // Who proposed
    pub instruction_data: Vec<u8>,   // Serialized instruction
    pub approvals: Vec<Pubkey>,        // Who approved
    pub executed: bool,              // Already executed?
    pub created_at: i64,               // Proposal time
    pub expires_at: i64,             // Expiration time
    pub bump: u8,
}

// === ROLE CONSTANTS ===
pub const ROLE_MASTER: u8 = 1;       // Full control
pub const ROLE_MINTER: u8 = 2;       // Can mint
pub const ROLE_BURNER: u8 = 4;       // Can burn
pub const ROLE_PAUSER: u8 = 8;       // Can pause/unpause
pub const ROLE_BLACKLISTER: u8 = 16; // Can manage blacklist
pub const ROLE_SEIZER: u8 = 32;      // Can seize tokens
pub const ROLE_FREEZER: u8 = 64;     // Can freeze/thaw individual accounts (SSS-2)

// === ERROR CODES ===
#[error_code]
pub enum StablecoinError {
    #[msg("Unauthorized: Insufficient role permissions")]
    Unauthorized = 6000,
    #[msg("Contract is paused")]
    ContractPaused,
    #[msg("Invalid mint amount")]
    InvalidAmount,
    #[msg("Minter quota exceeded")]
    QuotaExceeded,
    #[msg("Role already assigned")]
    RoleAlreadyAssigned,
    #[msg("Math overflow")]
    MathOverflow,
    #[msg("Invalid authority")]
    InvalidAuthority,
    #[msg("Compliance not enabled")]
    ComplianceNotEnabled,
    #[msg("Already initialized")]
    AlreadyInitialized,
    #[msg("Insufficient balance")]
    InsufficientBalance,
    #[msg("Supply cap exceeded")]
    SupplyCapExceeded,
    #[msg("Epoch quota exceeded")]
    EpochQuotaExceeded,
    #[msg("Token name too long (max 32 chars)")]
    NameTooLong,
    #[msg("Token symbol too long (max 10 chars)")]
    SymbolTooLong,
    #[msg("Invalid role bitmask")]
    InvalidRole,
}

// === EVENTS ===
#[event]
pub struct StablecoinInitialized {
    pub mint: Pubkey,
    pub authority: Pubkey,
    pub name: String,
    pub symbol: String,
    pub timestamp: i64,
}

#[event]
pub struct TokensMinted {
    pub minter: Pubkey,
    pub recipient: Pubkey,
    pub amount: u64,
    pub timestamp: i64,
}

#[event]
pub struct TokensBurned {
    pub burner: Pubkey,
    pub owner: Pubkey,
    pub amount: u64,
    pub timestamp: i64,
}

#[event]
pub struct AccountFrozen {
    pub pauser: Pubkey,
    pub account: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct AccountThawed {
    pub pauser: Pubkey,
    pub account: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct StablecoinPaused {
    pub pauser: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct StablecoinUnpaused {
    pub pauser: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct RolesUpdated {
    pub authority: Pubkey,
    pub target: Pubkey,
    pub new_roles: u8,
    pub timestamp: i64,
}

#[event]
pub struct MinterQuotaUpdated {
    pub authority: Pubkey,
    pub minter: Pubkey,
    pub new_quota: u64,
    pub timestamp: i64,
}

#[event]
pub struct AuthorityTransferStarted {
    pub previous_authority: Pubkey,
    pub pending_authority: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct AuthorityTransferred {
    pub previous_authority: Pubkey,
    pub new_authority: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct BatchMinted {
    pub minter: Pubkey,
    pub recipients: u16,
    pub total_amount: u64,
    pub timestamp: i64,
}

#[event]
pub struct MultisigProposalCreated {
    pub proposal: Pubkey,
    pub proposer: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct MultisigProposalApproved {
    pub proposal: Pubkey,
    pub approver: Pubkey,
    pub approvals: u8,
    pub threshold: u8,
    pub timestamp: i64,
}

#[event]
pub struct MultisigProposalExecuted {
    pub proposal: Pubkey,
    pub executor: Pubkey,
    pub timestamp: i64,
}

// === PROGRAM ===
declare_id!("8JpbyYEJXLeWoPJcLsHWg64bDtwFZXhPoubVJPeH11aH");

#[program]
pub mod sss_token {
    use super::*;

    // === INITIALIZE ===
    pub fn initialize(
        ctx: Context<Initialize>,
        name: String,
        symbol: String,
        decimals: u8,
        enable_transfer_hook: bool,
        enable_permanent_delegate: bool,
    ) -> Result<()> {
        require!(name.len() <= 32, StablecoinError::InvalidAmount); // TODO: add NameTooLong variant
        require!(symbol.len() <= 10, StablecoinError::InvalidAmount); // TODO: add SymbolTooLong variant

        // Initialize stablecoin state
        let stablecoin = &mut ctx.accounts.stablecoin_state;
        stablecoin.authority = ctx.accounts.authority.key();
        stablecoin.mint = ctx.accounts.mint.key();
        stablecoin.name = name.clone();
        stablecoin.symbol = symbol.clone();
        stablecoin.decimals = decimals;
        stablecoin.total_supply = 0;
        stablecoin.is_paused = false;
        stablecoin.features = 0;
        stablecoin.supply_cap = 0;          // 0 = unlimited
        stablecoin.epoch_quota = 0;         // 0 = unlimited
        stablecoin.current_epoch_minted = 0;
        stablecoin.current_epoch_start = Clock::get()?.unix_timestamp;
        stablecoin.pending_authority = None;
        if enable_transfer_hook {
            stablecoin.features |= 1;
        }
        if enable_permanent_delegate {
            stablecoin.features |= 2;
        }
        stablecoin.bump = ctx.bumps.stablecoin_state;

        // Initialize master role for creator
        let master_role = &mut ctx.accounts.master_role;
        master_role.owner = ctx.accounts.authority.key();
        master_role.roles = ROLE_MASTER | ROLE_MINTER | ROLE_BURNER | ROLE_PAUSER | ROLE_BLACKLISTER | ROLE_SEIZER;
        master_role.stablecoin = stablecoin.key();
        master_role.bump = ctx.bumps.master_role;

        emit!(StablecoinInitialized {
            mint: ctx.accounts.mint.key(),
            authority: ctx.accounts.authority.key(),
            name,
            symbol,
            timestamp: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }

    // === MINT ===
    pub fn mint(
        ctx: Context<MintTokens>,
        amount: u64,
    ) -> Result<()> {
        // Read values we need before any mutable borrow
        let is_paused = ctx.accounts.stablecoin_state.is_paused;
        let supply_cap = ctx.accounts.stablecoin_state.supply_cap;
        let epoch_quota = ctx.accounts.stablecoin_state.epoch_quota;
        let epoch_start = ctx.accounts.stablecoin_state.current_epoch_start;
        let total_supply = ctx.accounts.stablecoin_state.total_supply;
        let stablecoin_key = ctx.accounts.stablecoin_state.key();
        let role_bits = ctx.accounts.minter_role.roles;
        
        require!(!is_paused, StablecoinError::ContractPaused);
        require!(amount > 0, StablecoinError::InvalidAmount);
        
        // Check minter role
        require!(
            role_bits & ROLE_MINTER != 0 || role_bits & ROLE_MASTER != 0,
            StablecoinError::Unauthorized
        );
        
        // Check quota if not master
        if role_bits & ROLE_MASTER == 0 {
            let minter_info = &ctx.accounts.minter_info;
            let new_minted = minter_info.minted.checked_add(amount)
                .ok_or(StablecoinError::MathOverflow)?;
            require!(
                new_minted <= minter_info.quota,
                StablecoinError::QuotaExceeded
            );
        }
        
        // Check supply cap
        let new_supply = total_supply.checked_add(amount)
            .ok_or(StablecoinError::MathOverflow)?;
        if supply_cap > 0 {
            require!(new_supply <= supply_cap, StablecoinError::SupplyCapExceeded);
        }
        
        // Check epoch quota
        if epoch_quota > 0 {
            let current_time = Clock::get()?.unix_timestamp;
            let epoch_elapsed = current_time - epoch_start;
            
            // If epoch passed (24 hours = 86400 seconds), reset
            if epoch_elapsed >= 86400 {
                let stablecoin_mut = &mut ctx.accounts.stablecoin_state;
                stablecoin_mut.current_epoch_minted = 0;
                stablecoin_mut.current_epoch_start = current_time;
            }
            
            let epoch_new_total = ctx.accounts.stablecoin_state.current_epoch_minted
                .checked_add(amount)
                .ok_or(StablecoinError::MathOverflow)?;
            require!(
                epoch_new_total <= epoch_quota,
                StablecoinError::EpochQuotaExceeded
            );
        }

        let mint_authority_bump = ctx.bumps.mint_authority;
        // CPI to mint tokens
        token_2022::mint_to(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                token_2022::MintTo {
                    mint: ctx.accounts.mint.to_account_info(),
                    to: ctx.accounts.recipient_account.to_account_info(),
                    authority: ctx.accounts.mint_authority.to_account_info(),
                },
                &[&[b"mint_authority", stablecoin_key.as_ref(), &[mint_authority_bump]]],
            ),
            amount,
        )?;

        // Update state
        let stablecoin_mut = &mut ctx.accounts.stablecoin_state;
        stablecoin_mut.total_supply = stablecoin_mut.total_supply.checked_add(amount)
            .ok_or(StablecoinError::MathOverflow)?;

        // Update minter quota if applicable
        if role_bits & ROLE_MASTER == 0 {
            let minter_info = &mut ctx.accounts.minter_info;
            minter_info.minted = minter_info.minted.checked_add(amount)
                .ok_or(StablecoinError::MathOverflow)?;
        }
        
        // Update epoch minted
        stablecoin_mut.current_epoch_minted = stablecoin_mut.current_epoch_minted
            .checked_add(amount)
            .ok_or(StablecoinError::MathOverflow)?;

        emit!(TokensMinted {
            minter: ctx.accounts.minter.key(),
            recipient: ctx.accounts.recipient_account.key(),
            amount,
            timestamp: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }

    // === BURN ===
    pub fn burn(
        ctx: Context<BurnTokens>,
        amount: u64,
    ) -> Result<()> {
        let stablecoin = &ctx.accounts.stablecoin_state;
        
        require!(!stablecoin.is_paused, StablecoinError::ContractPaused);
        require!(amount > 0, StablecoinError::InvalidAmount);
        
        // Check burner role or self-burn
        let is_burner = ctx.accounts.burner_role.roles & ROLE_BURNER != 0 
            || ctx.accounts.burner_role.roles & ROLE_MASTER != 0;
        let is_owner = ctx.accounts.token_account.owner == ctx.accounts.burner.key();
        require!(is_burner || is_owner, StablecoinError::Unauthorized);

        // CPI to burn tokens
        if is_burner {
            // Burner can burn from any account
            token_2022::burn(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    token_2022::Burn {
                        mint: ctx.accounts.mint.to_account_info(),
                        from: ctx.accounts.token_account.to_account_info(),
                        authority: ctx.accounts.burn_authority.to_account_info(),
                    },
                    &[&[b"burn_authority", stablecoin.key().as_ref(), &[ctx.bumps.burn_authority]]],
                ),
                amount,
            )?;
        } else {
            // Owner burns their own tokens
            token_2022::burn(
                CpiContext::new(
                    ctx.accounts.token_program.to_account_info(),
                    token_2022::Burn {
                        mint: ctx.accounts.mint.to_account_info(),
                        from: ctx.accounts.token_account.to_account_info(),
                        authority: ctx.accounts.burner.to_account_info(),
                    },
                ),
                amount,
            )?;
        }

        // Update state
        let stablecoin_mut = &mut ctx.accounts.stablecoin_state;
        stablecoin_mut.total_supply = stablecoin_mut.total_supply.checked_sub(amount)
            .ok_or(StablecoinError::MathOverflow)?;

        emit!(TokensBurned {
            burner: ctx.accounts.burner.key(),
            owner: ctx.accounts.token_account.owner,
            amount,
            timestamp: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }

    // === FREEZE ===
    pub fn freeze_account(ctx: Context<FreezeAccount>) -> Result<()> {
        let stablecoin = &ctx.accounts.stablecoin_state;
        
        require!(!stablecoin.is_paused, StablecoinError::ContractPaused);
        
        // Check pauser role
        require!(
            ctx.accounts.pauser_role.roles & ROLE_PAUSER != 0
            || ctx.accounts.pauser_role.roles & ROLE_MASTER != 0,
            StablecoinError::Unauthorized
        );

        // CPI to freeze account
        token_2022::freeze_account(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                token_2022::FreezeAccount {
                    account: ctx.accounts.token_account.to_account_info(),
                    mint: ctx.accounts.mint.to_account_info(),
                    authority: ctx.accounts.freeze_authority.to_account_info(),
                },
                &[&[b"freeze_authority", stablecoin.key().as_ref(), &[ctx.bumps.freeze_authority]]],
            ),
        )?;

        emit!(AccountFrozen {
            pauser: ctx.accounts.pauser.key(),
            account: ctx.accounts.token_account.key(),
            timestamp: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }

    // === THAW ===
    pub fn thaw_account(ctx: Context<ThawAccount>) -> Result<()> {
        let stablecoin = &ctx.accounts.stablecoin_state;
        
        // Check pauser role
        require!(
            ctx.accounts.pauser_role.roles & ROLE_PAUSER != 0
            || ctx.accounts.pauser_role.roles & ROLE_MASTER != 0,
            StablecoinError::Unauthorized
        );

        // CPI to thaw account
        token_2022::thaw_account(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                token_2022::ThawAccount {
                    account: ctx.accounts.token_account.to_account_info(),
                    mint: ctx.accounts.mint.to_account_info(),
                    authority: ctx.accounts.freeze_authority.to_account_info(),
                },
                &[&[b"freeze_authority", stablecoin.key().as_ref(), &[ctx.bumps.freeze_authority]]],
            ),
        )?;

        emit!(AccountThawed {
            pauser: ctx.accounts.pauser.key(),
            account: ctx.accounts.token_account.key(),
            timestamp: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }

    // === PAUSE/UNPAUSE ===
    pub fn set_paused(ctx: Context<SetPaused>, paused: bool) -> Result<()> {
        let stablecoin = &mut ctx.accounts.stablecoin_state;
        
        // Check pauser role
        require!(
            ctx.accounts.pauser_role.roles & ROLE_PAUSER != 0
            || ctx.accounts.pauser_role.roles & ROLE_MASTER != 0,
            StablecoinError::Unauthorized
        );

        stablecoin.is_paused = paused;

        if paused {
            emit!(StablecoinPaused {
                pauser: ctx.accounts.pauser.key(),
                timestamp: Clock::get()?.unix_timestamp,
            });
        } else {
            emit!(StablecoinUnpaused {
                pauser: ctx.accounts.pauser.key(),
                timestamp: Clock::get()?.unix_timestamp,
            });
        }

        Ok(())
    }

    // === ROLE MANAGEMENT ===
    pub fn update_roles(
        ctx: Context<UpdateRoles>,
        new_roles: u8,
    ) -> Result<()> {
        // Check master role
        require!(
            ctx.accounts.authority_role.roles & ROLE_MASTER != 0,
            StablecoinError::Unauthorized
        );

        let role_account = &mut ctx.accounts.target_role;
        role_account.roles = new_roles;

        emit!(RolesUpdated {
            authority: ctx.accounts.authority.key(),
            target: ctx.accounts.target.key(),
            new_roles,
            timestamp: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }

    // === MINTER QUOTA ===
    pub fn update_minter_quota(
        ctx: Context<UpdateMinterQuota>,
        new_quota: u64,
    ) -> Result<()> {
        // Check master role
        require!(
            ctx.accounts.authority_role.roles & ROLE_MASTER != 0,
            StablecoinError::Unauthorized
        );

        let minter_info = &mut ctx.accounts.minter_info;
        minter_info.quota = new_quota;

        emit!(MinterQuotaUpdated {
            authority: ctx.accounts.authority.key(),
            minter: ctx.accounts.minter.key(),
            new_quota,
            timestamp: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }

    // === TRANSFER AUTHORITY ===
    pub fn transfer_authority(ctx: Context<TransferAuthority>) -> Result<()> {
        let stablecoin = &mut ctx.accounts.stablecoin_state;
        
        // Only current authority can transfer
        require!(
            ctx.accounts.authority.key() == stablecoin.authority,
            StablecoinError::InvalidAuthority
        );

        let pending = ctx.accounts.new_authority.key();
        stablecoin.pending_authority = Some(pending);

        emit!(AuthorityTransferStarted {
            previous_authority: stablecoin.authority,
            pending_authority: pending,
            timestamp: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }

    // === ACCEPT AUTHORITY ===
    pub fn accept_authority(ctx: Context<AcceptAuthority>) -> Result<()> {
        let stablecoin = &mut ctx.accounts.stablecoin_state;
        
        let pending = stablecoin.pending_authority
            .ok_or(StablecoinError::InvalidAuthority)?;
            
        require!(
            ctx.accounts.pending_authority.key() == pending,
            StablecoinError::InvalidAuthority
        );

        let previous_authority = stablecoin.authority;
        stablecoin.authority = ctx.accounts.pending_authority.key();
        stablecoin.pending_authority = None;

        emit!(AuthorityTransferred {
            previous_authority,
            new_authority: ctx.accounts.pending_authority.key(),
            timestamp: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }
    
    // === UPDATE SUPPLY CAP ===
    pub fn update_supply_cap(
        ctx: Context<UpdateFeatures>,
        new_cap: u64,
    ) -> Result<()> {
        require!(
            ctx.accounts.authority_role.roles & ROLE_MASTER != 0,
            StablecoinError::Unauthorized
        );
        
        let stablecoin = &mut ctx.accounts.stablecoin_state;
        stablecoin.supply_cap = new_cap;
        
        Ok(())
    }
    
    // === UPDATE EPOCH QUOTA ===
    pub fn update_epoch_quota(
        ctx: Context<UpdateFeatures>,
        new_quota: u64,
    ) -> Result<()> {
        require!(
            ctx.accounts.authority_role.roles & ROLE_MASTER != 0,
            StablecoinError::Unauthorized
        );
        
        let stablecoin = &mut ctx.accounts.stablecoin_state;
        stablecoin.epoch_quota = new_quota;
        
        Ok(())
    }
    
    // === ENABLE MINT CLOSE AUTHORITY ===
    pub fn enable_mint_close_authority(ctx: Context<UpdateFeatures>) -> Result<()> {
        require!(
            ctx.accounts.authority_role.roles & ROLE_MASTER != 0,
            StablecoinError::Unauthorized
        );
        
        let stablecoin = &mut ctx.accounts.stablecoin_state;
        stablecoin.features |= 4; // Bit 2 = MintCloseAuthority
        
        Ok(())
    }
    
    // === ENABLE DEFAULT ACCOUNT STATE ===
    pub fn enable_default_account_state(ctx: Context<UpdateFeatures>) -> Result<()> {
        require!(
            ctx.accounts.authority_role.roles & ROLE_MASTER != 0,
            StablecoinError::Unauthorized
        );
        
        let stablecoin = &mut ctx.accounts.stablecoin_state;
        stablecoin.features |= 8; // Bit 3 = DefaultAccountState
        
        Ok(())
    }
    
    // === BATCH MINT ===
    // Recipients' token accounts are passed as remaining_accounts (in order matching amounts)
    pub fn batch_mint<'a>(
        ctx: Context<'_, '_, 'a, 'a, BatchMint<'a>>,
        amounts: Vec<u64>,
    ) -> Result<()> {
        let n = amounts.len();
        require!(n > 0 && n <= 10, StablecoinError::InvalidAmount);
        require!(ctx.remaining_accounts.len() == n, StablecoinError::InvalidAmount);
        
        // Read values before any mutable borrow
        let is_paused = ctx.accounts.stablecoin_state.is_paused;
        let supply_cap = ctx.accounts.stablecoin_state.supply_cap;
        let epoch_quota = ctx.accounts.stablecoin_state.epoch_quota;
        let epoch_start = ctx.accounts.stablecoin_state.current_epoch_start;
        let total_supply = ctx.accounts.stablecoin_state.total_supply;
        let stablecoin_key = ctx.accounts.stablecoin_state.key();
        let role_bits = ctx.accounts.minter_role.roles;
        
        require!(!is_paused, StablecoinError::ContractPaused);
        
        // Check minter role
        require!(
            role_bits & ROLE_MINTER != 0 || role_bits & ROLE_MASTER != 0,
            StablecoinError::Unauthorized
        );
        
        let mut total_amount: u64 = 0;
        for amount in amounts.iter() {
            require!(*amount > 0, StablecoinError::InvalidAmount);
            total_amount = total_amount.checked_add(*amount)
                .ok_or(StablecoinError::MathOverflow)?;
        }
        
        // Check quota if not master
        if role_bits & ROLE_MASTER == 0 {
            let minter_info = &ctx.accounts.minter_info;
            let new_minted = minter_info.minted.checked_add(total_amount)
                .ok_or(StablecoinError::MathOverflow)?;
            require!(
                new_minted <= minter_info.quota,
                StablecoinError::QuotaExceeded
            );
        }
        
        // Check supply cap
        let new_supply = total_supply.checked_add(total_amount)
            .ok_or(StablecoinError::MathOverflow)?;
        if supply_cap > 0 {
            require!(new_supply <= supply_cap, StablecoinError::SupplyCapExceeded);
        }
        
        // Check epoch quota
        if epoch_quota > 0 {
            let current_time = Clock::get()?.unix_timestamp;
            let epoch_elapsed = current_time - epoch_start;
            
            if epoch_elapsed >= 86400 {
                let stablecoin_mut = &mut ctx.accounts.stablecoin_state;
                stablecoin_mut.current_epoch_minted = 0;
                stablecoin_mut.current_epoch_start = current_time;
            }
            
            let epoch_new_total = ctx.accounts.stablecoin_state.current_epoch_minted
                .checked_add(total_amount)
                .ok_or(StablecoinError::MathOverflow)?;
            require!(
                epoch_new_total <= epoch_quota,
                StablecoinError::EpochQuotaExceeded
            );
        }
        
        let mint_authority_bump = ctx.bumps.mint_authority;
        let signer_seeds: &[&[&[u8]]] = &[&[
            b"mint_authority",
            stablecoin_key.as_ref(),
            &[mint_authority_bump],
        ]];
        
        // CPI mint_to for each recipient token account (passed as remaining_accounts)
        for (i, amount) in amounts.iter().enumerate() {
            let recipient_account = &ctx.remaining_accounts[i];
            token_2022::mint_to(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    token_2022::MintTo {
                        mint: ctx.accounts.mint.to_account_info(),
                        to: recipient_account.to_account_info(),
                        authority: ctx.accounts.mint_authority.to_account_info(),
                    },
                    signer_seeds,
                ),
                *amount,
            )?;
        }
        
        // Update state
        let stablecoin_mut = &mut ctx.accounts.stablecoin_state;
        stablecoin_mut.total_supply = stablecoin_mut.total_supply.checked_add(total_amount)
            .ok_or(StablecoinError::MathOverflow)?;
        
        stablecoin_mut.current_epoch_minted = stablecoin_mut.current_epoch_minted
            .checked_add(total_amount)
            .ok_or(StablecoinError::MathOverflow)?;
        
        // Update minter quota if applicable
        if role_bits & ROLE_MASTER == 0 {
            let minter_info = &mut ctx.accounts.minter_info;
            minter_info.minted = minter_info.minted.checked_add(total_amount)
                .ok_or(StablecoinError::MathOverflow)?;
        }
        
        emit!(BatchMinted {
            minter: ctx.accounts.minter.key(),
            recipients: n as u16,
            total_amount,
            timestamp: Clock::get()?.unix_timestamp,
        });
        
        Ok(())
    }
    
    // === MULTISIG: INITIALIZE CONFIG ===
    pub fn initialize_multisig(
        ctx: Context<InitializeMultisig>,
        threshold: u8,
        signers: Vec<Pubkey>,
    ) -> Result<()> {
        require!(
            ctx.accounts.authority_role.roles & ROLE_MASTER != 0,
            StablecoinError::Unauthorized
        );
        require!(threshold > 0 && threshold <= signers.len() as u8, StablecoinError::InvalidAmount);
        require!(signers.len() <= 10, StablecoinError::InvalidAmount);
        
        let config = &mut ctx.accounts.multisig_config;
        config.stablecoin = ctx.accounts.stablecoin_state.key();
        config.threshold = threshold;
        config.signers = signers;
        config.bump = ctx.bumps.multisig_config;
        
        Ok(())
    }
    
    // === MULTISIG: CREATE PROPOSAL ===
    pub fn create_proposal(
        ctx: Context<CreateProposal>,
        instruction_data: Vec<u8>,
        expires_in: i64,
    ) -> Result<()> {
        require!(
            ctx.accounts.multisig_config.signers.contains(&ctx.accounts.proposer.key()),
            StablecoinError::Unauthorized
        );
        
        let proposal = &mut ctx.accounts.proposal;
        proposal.config = ctx.accounts.multisig_config.key();
        proposal.proposer = ctx.accounts.proposer.key();
        proposal.instruction_data = instruction_data;
        proposal.approvals = vec![];
        proposal.executed = false;
        proposal.created_at = Clock::get()?.unix_timestamp;
        proposal.expires_at = proposal.created_at + expires_in;
        proposal.bump = ctx.bumps.proposal;
        
        emit!(MultisigProposalCreated {
            proposal: proposal.key(),
            proposer: ctx.accounts.proposer.key(),
            timestamp: proposal.created_at,
        });
        
        Ok(())
    }
    
    // === MULTISIG: APPROVE PROPOSAL ===
    pub fn approve_proposal(ctx: Context<ApproveProposal>) -> Result<()> {
        let config = &ctx.accounts.multisig_config;
        let proposal = &mut ctx.accounts.proposal;
        
        require!(
            Clock::get()?.unix_timestamp < proposal.expires_at,
            StablecoinError::InvalidAmount
        );
        require!(!proposal.executed, StablecoinError::InvalidAmount);
        require!(
            config.signers.contains(&ctx.accounts.signer.key()),
            StablecoinError::Unauthorized
        );
        require!(
            !proposal.approvals.contains(&ctx.accounts.signer.key()),
            StablecoinError::InvalidAmount
        );
        
        proposal.approvals.push(ctx.accounts.signer.key());
        
        emit!(MultisigProposalApproved {
            proposal: proposal.key(),
            approver: ctx.accounts.signer.key(),
            approvals: proposal.approvals.len() as u8,
            threshold: config.threshold,
            timestamp: Clock::get()?.unix_timestamp,
        });
        
        Ok(())
    }
    
    // === MULTISIG: EXECUTE PROPOSAL ===
    pub fn execute_proposal(ctx: Context<ExecuteProposal>) -> Result<()> {
        let config = &ctx.accounts.multisig_config;
        let proposal = &mut ctx.accounts.proposal;
        
        // Check expiration
        require!(
            Clock::get()?.unix_timestamp < proposal.expires_at,
            StablecoinError::InvalidAmount // Proposal expired
        );
        require!(
            proposal.approvals.len() as u8 >= config.threshold,
            StablecoinError::Unauthorized
        );
        require!(!proposal.executed, StablecoinError::InvalidAmount);
        
        proposal.executed = true;
        
        emit!(MultisigProposalExecuted {
            proposal: proposal.key(),
            executor: ctx.accounts.executor.key(),
            timestamp: Clock::get()?.unix_timestamp,
        });
        
        Ok(())
    }
}

// === ACCOUNT STRUCTURES FOR INSTRUCTIONS ===

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    
    #[account(
        init,
        payer = authority,
        space = 8 + 200,
        seeds = [b"stablecoin", mint.key().as_ref()],
        bump
    )]
    pub stablecoin_state: Account<'info, StablecoinState>,
    
    #[account(
        init,
        payer = authority,
        space = 8 + 100,
        seeds = [b"role", authority.key().as_ref(), mint.key().as_ref()],
        bump
    )]
    pub master_role: Account<'info, RoleAccount>,
    
    // Accept pre-initialized mint (initialized by SDK with any desired Token2022 extensions)
    #[account(mut)]
    pub mint: InterfaceAccount<'info, InterfaceMint>,
    
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token2022>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct MintTokens<'info> {
    #[account(mut)]
    pub minter: Signer<'info>,
    
    #[account(mut)]
    pub stablecoin_state: Account<'info, StablecoinState>,
    
    #[account(
        seeds = [b"role", minter.key().as_ref(), stablecoin_state.mint.as_ref()],
        bump = minter_role.bump,
    )]
    pub minter_role: Account<'info, RoleAccount>,
    
    #[account(
        mut,
        seeds = [b"minter", minter.key().as_ref(), stablecoin_state.mint.as_ref()],
        bump = minter_info.bump,
    )]
    pub minter_info: Account<'info, MinterInfo>,
    
    #[account(mut)]
    pub mint: InterfaceAccount<'info, InterfaceMint>,
    
    #[account(mut)]
    pub recipient_account: InterfaceAccount<'info, InterfaceTokenAccount>,
    
    /// CHECK: PDA used as mint authority
    #[account(
        seeds = [b"mint_authority", stablecoin_state.key().as_ref()],
        bump
    )]
    pub mint_authority: AccountInfo<'info>,
    
    pub token_program: Program<'info, Token2022>,
}

#[derive(Accounts)]
pub struct BurnTokens<'info> {
    #[account(mut)]
    pub burner: Signer<'info>,
    
    #[account(mut)]
    pub stablecoin_state: Account<'info, StablecoinState>,
    
    #[account(
        seeds = [b"role", burner.key().as_ref(), stablecoin_state.mint.as_ref()],
        bump = burner_role.bump,
    )]
    pub burner_role: Account<'info, RoleAccount>,
    
    #[account(mut)]
    pub mint: InterfaceAccount<'info, InterfaceMint>,
    
    #[account(mut)]
    pub token_account: InterfaceAccount<'info, InterfaceTokenAccount>,
    
    /// CHECK: PDA used as burn authority (for burner role)
    #[account(
        seeds = [b"burn_authority", stablecoin_state.key().as_ref()],
        bump
    )]
    pub burn_authority: AccountInfo<'info>,
    
    pub token_program: Program<'info, Token2022>,
}

#[derive(Accounts)]
pub struct FreezeAccount<'info> {
    pub pauser: Signer<'info>,
    
    #[account(mut)]
    pub stablecoin_state: Account<'info, StablecoinState>,
    
    #[account(
        seeds = [b"role", pauser.key().as_ref(), stablecoin_state.mint.as_ref()],
        bump = pauser_role.bump,
    )]
    pub pauser_role: Account<'info, RoleAccount>,
    
    pub mint: InterfaceAccount<'info, InterfaceMint>,
    
    #[account(mut)]
    pub token_account: InterfaceAccount<'info, InterfaceTokenAccount>,
    
    /// CHECK: PDA used as freeze authority
    #[account(
        seeds = [b"freeze_authority", stablecoin_state.key().as_ref()],
        bump
    )]
    pub freeze_authority: AccountInfo<'info>,
    
    pub token_program: Program<'info, Token2022>,
}

#[derive(Accounts)]
pub struct ThawAccount<'info> {
    pub pauser: Signer<'info>,
    
    #[account(mut)]
    pub stablecoin_state: Account<'info, StablecoinState>,
    
    #[account(
        seeds = [b"role", pauser.key().as_ref(), stablecoin_state.mint.as_ref()],
        bump = pauser_role.bump,
    )]
    pub pauser_role: Account<'info, RoleAccount>,
    
    pub mint: InterfaceAccount<'info, InterfaceMint>,
    
    #[account(mut)]
    pub token_account: InterfaceAccount<'info, InterfaceTokenAccount>,
    
    /// CHECK: PDA used as freeze authority
    #[account(
        seeds = [b"freeze_authority", stablecoin_state.key().as_ref()],
        bump
    )]
    pub freeze_authority: AccountInfo<'info>,
    
    pub token_program: Program<'info, Token2022>,
}

#[derive(Accounts)]
pub struct SetPaused<'info> {
    pub pauser: Signer<'info>,
    
    #[account(mut)]
    pub stablecoin_state: Account<'info, StablecoinState>,
    
    #[account(
        seeds = [b"role", pauser.key().as_ref(), stablecoin_state.mint.as_ref()],
        bump = pauser_role.bump,
    )]
    pub pauser_role: Account<'info, RoleAccount>,
}

#[derive(Accounts)]
pub struct UpdateRoles<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    
    #[account(mut)]
    pub stablecoin_state: Account<'info, StablecoinState>,
    
    #[account(
        seeds = [b"role", authority.key().as_ref(), stablecoin_state.mint.as_ref()],
        bump = authority_role.bump,
    )]
    pub authority_role: Account<'info, RoleAccount>,
    
    /// CHECK: Target account to update roles for
    pub target: AccountInfo<'info>,
    
    #[account(
        init_if_needed,
        payer = authority,
        space = 8 + 100,
        seeds = [b"role", target.key().as_ref(), stablecoin_state.mint.as_ref()],
        bump
    )]
    pub target_role: Account<'info, RoleAccount>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateMinterQuota<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    
    #[account(mut)]
    pub stablecoin_state: Account<'info, StablecoinState>,
    
    #[account(
        seeds = [b"role", authority.key().as_ref(), stablecoin_state.mint.as_ref()],
        bump = authority_role.bump,
    )]
    pub authority_role: Account<'info, RoleAccount>,
    
    /// CHECK: Minter account
    pub minter: AccountInfo<'info>,
    
    #[account(
        init_if_needed,
        payer = authority,
        space = 8 + 100,
        seeds = [b"minter", minter.key().as_ref(), stablecoin_state.mint.as_ref()],
        bump
    )]
    pub minter_info: Account<'info, MinterInfo>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct TransferAuthority<'info> {
    pub authority: Signer<'info>,
    
    /// CHECK: New authority address
    pub new_authority: AccountInfo<'info>,
    
    #[account(mut)]
    pub stablecoin_state: Account<'info, StablecoinState>,
}

#[derive(Accounts)]
pub struct AcceptAuthority<'info> {
    pub pending_authority: Signer<'info>,
    
    #[account(mut)]
    pub stablecoin_state: Account<'info, StablecoinState>,
}

#[derive(Accounts)]
pub struct UpdateFeatures<'info> {
    pub authority: Signer<'info>,
    
    #[account(mut)]
    pub stablecoin_state: Account<'info, StablecoinState>,
    
    #[account(
        seeds = [b"role", authority.key().as_ref(), stablecoin_state.mint.as_ref()],
        bump = authority_role.bump,
    )]
    pub authority_role: Account<'info, RoleAccount>,
}

#[derive(Accounts)]
pub struct BatchMint<'info> {
    #[account(mut)]
    pub minter: Signer<'info>,
    
    #[account(mut)]
    pub stablecoin_state: Account<'info, StablecoinState>,
    
    #[account(
        seeds = [b"role", minter.key().as_ref(), stablecoin_state.mint.as_ref()],
        bump = minter_role.bump,
    )]
    pub minter_role: Account<'info, RoleAccount>,
    
    #[account(
        mut,
        seeds = [b"minter", minter.key().as_ref(), stablecoin_state.mint.as_ref()],
        bump = minter_info.bump,
    )]
    pub minter_info: Account<'info, MinterInfo>,
    
    #[account(mut)]
    pub mint: InterfaceAccount<'info, InterfaceMint>,
    
    /// CHECK: PDA used as mint authority
    #[account(
        seeds = [b"mint_authority", stablecoin_state.key().as_ref()],
        bump
    )]
    pub mint_authority: AccountInfo<'info>,
    
    pub token_program: Program<'info, Token2022>,
}

// === MULTISIG ACCOUNT STRUCTS ===

#[derive(Accounts)]
pub struct InitializeMultisig<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    
    #[account(mut)]
    pub stablecoin_state: Account<'info, StablecoinState>,
    
    #[account(
        seeds = [b"role", authority.key().as_ref(), stablecoin_state.mint.as_ref()],
        bump = authority_role.bump,
    )]
    pub authority_role: Account<'info, RoleAccount>,
    
    #[account(
        init,
        payer = authority,
        space = 8 + 200,
        seeds = [b"multisig", stablecoin_state.key().as_ref()],
        bump
    )]
    pub multisig_config: Account<'info, MultisigConfig>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CreateProposal<'info> {
    #[account(mut)]
    pub proposer: Signer<'info>,
    
    #[account(
        seeds = [b"multisig", stablecoin_state.key().as_ref()],
        bump = multisig_config.bump,
    )]
    pub multisig_config: Account<'info, MultisigConfig>,
    
    pub stablecoin_state: Account<'info, StablecoinState>,
    
    #[account(
        init,
        payer = proposer,
        space = 8 + 500,
        seeds = [b"proposal", multisig_config.key().as_ref(), proposer.key().as_ref()],
        bump
    )]
    pub proposal: Account<'info, MultisigProposal>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ApproveProposal<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,
    
    #[account(
        seeds = [b"multisig", stablecoin_state.key().as_ref()],
        bump = multisig_config.bump,
    )]
    pub multisig_config: Account<'info, MultisigConfig>,
    
    pub stablecoin_state: Account<'info, StablecoinState>,
    
    #[account(mut)]
    pub proposal: Account<'info, MultisigProposal>,
}

#[derive(Accounts)]
pub struct ExecuteProposal<'info> {
    #[account(mut)]
    pub executor: Signer<'info>,
    
    #[account(
        seeds = [b"multisig", stablecoin_state.key().as_ref()],
        bump = multisig_config.bump,
    )]
    pub multisig_config: Account<'info, MultisigConfig>,
    
    pub stablecoin_state: Account<'info, StablecoinState>,
    
    #[account(mut)]
    pub proposal: Account<'info, MultisigProposal>,
}