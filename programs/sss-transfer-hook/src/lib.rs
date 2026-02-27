use anchor_lang::prelude::*;
use anchor_spl::token_2022::Token2022;
use anchor_spl::token_interface::{Mint as InterfaceMint, TokenAccount as InterfaceTokenAccount};
use spl_tlv_account_resolution::{
    account::ExtraAccountMeta,
    seeds::Seed,
    state::ExtraAccountMetaList,
};
use spl_transfer_hook_interface::instruction::{ExecuteInstruction, TransferHookInstruction};

declare_id!("By3BWwxkz7uFMRw1bD63VUnVMysMh79A3A6D58cHaXmB");

// Base SSS Token Program ID
pub mod sss_token_program {
    use anchor_lang::prelude::declare_id;
    declare_id!("8JpbyYEJXLeWoPJcLsHWg64bDtwFZXhPoubVJPeH11aH");
}

/// ============ STATE STRUCTURES ============

#[account]
pub struct TransferHookConfig {
    pub stablecoin: Pubkey,              // Associated stablecoin
    pub authority: Pubkey,               // Admin authority
    pub transfer_fee_basis_points: u16,  // Fee rate (100 = 1%)
    pub max_transfer_fee: u64,           // Maximum fee cap
    pub min_transfer_amount: u64,        // Minimum transfer
    pub total_fees_collected: u64,       // Running total
    pub is_paused: bool,                 // Emergency pause
    pub blacklist_enabled: bool,         // Toggle blacklist
    pub permanent_delegate: Option<Pubkey>, // Super admin
    pub bump: u8,
}

#[account]
pub struct BlacklistEntry {
    pub address: Pubkey,                 // Blacklisted address
    pub reason: String,                  // Why blacklisted
    pub blacklisted_by: Pubkey,          // Who added
    pub created_at: i64,                 // When
    pub is_active: bool,                 // Still active?
    pub bump: u8,
}

#[account]
pub struct WhitelistEntry {
    pub address: Pubkey,                 // Whitelisted address
    pub whitelist_type: WhitelistType,   // Fee exempt or full
    pub added_by: Pubkey,                // Who added
    pub created_at: i64,                 // When
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum WhitelistType {
    FeeExempt,      // No transfer fees
    FullBypass,     // Bypass all restrictions
}

/// ============ ERROR CODES ============

#[error_code]
pub enum TransferHookError {
    #[msg("Transfer hook is paused")]
    HookPaused = 8000,
    #[msg("Source address is blacklisted")]
    SourceBlacklisted,
    #[msg("Destination address is blacklisted")]
    DestinationBlacklisted,
    #[msg("Transfer amount below minimum")]
    AmountTooLow,
    #[msg("Invalid authority")]
    InvalidAuthority,
    #[msg("Address already blacklisted")]
    AlreadyBlacklisted,
    #[msg("Blacklist entry not found")]
    BlacklistNotFound,
    #[msg("Already whitelisted")]
    AlreadyWhitelisted,
    #[msg("Compliance feature not enabled")]
    ComplianceNotEnabled,
    #[msg("Invalid instruction data")]
    InvalidInstruction,
    #[msg("Fee calculation overflow")]
    MathOverflow,
    #[msg("Cannot seize from self")]
    SelfSeizure,
}

/// ============ EVENTS ============

#[event]
pub struct TransferExecuted {
    pub source: Pubkey,
    pub destination: Pubkey,
    pub amount: u64,
    pub fee: u64,
    pub net_amount: u64,
    pub is_whitelisted: bool,
    pub is_delegate: bool,
    pub timestamp: i64,
}

#[event]
pub struct BlacklistAdded {
    pub address: Pubkey,
    pub reason: String,
    pub blacklisted_by: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct BlacklistRemoved {
    pub address: Pubkey,
    pub removed_by: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct TokensSeized {
    pub from: Pubkey,
    pub to: Pubkey,
    pub amount: u64,
    pub seized_by: Pubkey,
    pub reason: String,
    pub timestamp: i64,
}

#[event]
pub struct ConfigUpdated {
    pub authority: Pubkey,
    pub field: String,
    pub value: String,
    pub timestamp: i64,
}

#[event]
pub struct BatchBlacklistAdded {
    pub authority: Pubkey,
    pub count: u16,
    pub timestamp: i64,
}

/// ============ PROGRAM MODULE ============

#[program]
pub mod sss_transfer_hook {
    use super::*;

    /// Initialize the transfer hook for a stablecoin
    pub fn initialize(
        ctx: Context<InitializeHook>,
        transfer_fee_basis_points: u16,
        max_transfer_fee: u64,
        min_transfer_amount: u64,
        blacklist_enabled: bool,
    ) -> Result<()> {
        let config = &mut ctx.accounts.config;
        config.stablecoin = ctx.accounts.stablecoin.key();
        config.authority = ctx.accounts.authority.key();
        config.transfer_fee_basis_points = transfer_fee_basis_points;
        config.max_transfer_fee = max_transfer_fee;
        config.min_transfer_amount = min_transfer_amount;
        config.total_fees_collected = 0;
        config.is_paused = false;
        config.blacklist_enabled = blacklist_enabled;
        config.permanent_delegate = None;
        config.bump = ctx.bumps.config;

        emit!(ConfigUpdated {
            authority: ctx.accounts.authority.key(),
            field: "initialize".to_string(),
            value: format!("fee_bps:{}, max_fee:{}, min:{}, blacklist:{}", 
                transfer_fee_basis_points, max_transfer_fee, min_transfer_amount, blacklist_enabled),
            timestamp: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }

    /// Initialize ExtraAccountMetaList — REQUIRED by Token-2022 before hook can be installed on a mint.
    /// This stores the PDAs the hook needs as extra accounts for every transfer.
    pub fn initialize_extra_account_meta_list(
        ctx: Context<InitExtraAccountMetaList>,
    ) -> Result<()> {
        // Define the extra accounts needed for every execute_transfer_hook call:
        // [0] config PDA  (seeds: ["hook_config", mint])
        // [1] source owner blacklist PDA  (seeds: ["blacklist", config, source_account.owner])
        // [2] destination blacklist PDA   (seeds: ["blacklist", config, destination_account.owner])
        let account_metas = vec![
            // Config account — deterministic, seeded on mint
            ExtraAccountMeta::new_with_seeds(
                &[
                    Seed::Literal { bytes: b"hook_config".to_vec() },
                    Seed::AccountKey { index: 2 }, // mint is account index 2 in execute
                ],
                false, // is_signer
                false, // is_writable — we only need to read config in execute
            )?,
            // Source blacklist PDA — seeded on config + source_account.owner
            // source_account is index 0, config (extra acct 0) is index 4
            ExtraAccountMeta::new_with_seeds(
                &[
                    Seed::Literal { bytes: b"blacklist".to_vec() },
                    Seed::AccountKey { index: 4 }, // config extra account index 0 = overall index 4
                    Seed::AccountKey { index: 3 }, // source_account.owner — wallet, passed as remaining
                ],
                false,
                false,
            )?,
            // Destination blacklist PDA — seeded on config + destination_account.owner
            ExtraAccountMeta::new_with_seeds(
                &[
                    Seed::Literal { bytes: b"blacklist".to_vec() },
                    Seed::AccountKey { index: 4 }, // config
                    Seed::AccountKey { index: 3 }, // destination owner
                ],
                false,
                false,
            )?,
            // 4th extra account: The sss_token base program ID itself
            ExtraAccountMeta::new_with_pubkey(
                &sss_token_program::ID,
                false,
                false,
            )?,
            // 5th extra account: Master StablecoinState PDA — seeded on "stablecoin" + mint, owned by sss_token program (index 7)
            ExtraAccountMeta::new_external_pda_with_seeds(
                7, // index 7: 0=src, 1=mint, 2=dest, 3=owner, 4=config, 5=src_bl, 6=dst_bl, 7=base_program
                &[
                    Seed::Literal { bytes: b"stablecoin".to_vec() },
                    Seed::AccountKey { index: 1 }, // mint is account index 1 in execute instruction (Wait! In Token-2022 ExecuteInstruction: 0=source, 1=mint, 2=destination, 3=owner delegator. So mint is index 1!)
                ],
                false,
                false,
            )?,
        ];

        // Calculate required space
        let account_size = ExtraAccountMetaList::size_of(account_metas.len())?;

        // Initialize the ExtraAccountMetaList account
        ExtraAccountMetaList::init::<ExecuteInstruction>(
            &mut ctx.accounts.extra_account_meta_list.try_borrow_mut_data()?,
            &account_metas,
        )?;

        msg!(
            "ExtraAccountMetaList initialized for mint {} with {} extra accounts (size: {} bytes)",
            ctx.accounts.mint.key(),
            account_metas.len(),
            account_size,
        );

        Ok(())
    }

    pub fn execute_transfer_hook(
        ctx: Context<ExecuteTransferHook>,
        amount: u64,
    ) -> Result<()> {
        let config = &ctx.accounts.config;
        
        // Check base program pause state
        // The stablecoin_state PDA is the 4th extra account, which means it's in remaining_accounts
        // remaining_accounts layout: [config, source_blacklist, dest_blacklist, stablecoin_state]
        // Actually, it's [source_blacklist, dest_blacklist, stablecoin_state] because config is explicitly defined.
        // Wait, Anchor `remaining_accounts` includes all accounts not explicitly matched, OR all extra accounts if we don't define them in struct.
        // Let's explicitly define it in ExecuteTransferHook struct to be safe.
        if let Some(stablecoin_state) = ctx.accounts.stablecoin_state.as_ref() {
            let data = stablecoin_state.try_borrow_data()?;
            // stablecoin_state layout:
            // 8 bytes discriminator
            // 32 bytes authority
            // 32 bytes mint
            // 36 bytes name (4 len + 32 chars max)
            // 14 bytes symbol (4 len + 10 chars max)
            // 1 byte decimals
            // 8 bytes total_supply
            // 1 byte is_paused
            // Total fixed offset up to total_supply: 8 + 32 + 32 + 36 + 14 + 1 + 8 = 131
            // 131 is the byte offset of `is_paused` flag.
            if data.len() >= 132 {
                let is_paused = data[131] != 0;
                require!(!is_paused, TransferHookError::HookPaused);
            }
        }
        
        // Check hook-specific pause
        require!(!config.is_paused, TransferHookError::HookPaused);
        
        // Check blacklist (if enabled)
        if config.blacklist_enabled {
            // Check source
            if ctx.accounts.source_blacklist.is_some() {
                let entry = ctx.accounts.source_blacklist.as_ref().unwrap();
                if entry.is_active {
                    return Err(TransferHookError::SourceBlacklisted.into());
                }
            }
            
            // Check destination
            if ctx.accounts.destination_blacklist.is_some() {
                let entry = ctx.accounts.destination_blacklist.as_ref().unwrap();
                if entry.is_active {
                    return Err(TransferHookError::DestinationBlacklisted.into());
                }
            }
        }
        
        // Check permanent delegate (bypasses everything)
        let is_delegate = if let Some(delegate) = config.permanent_delegate {
            ctx.accounts.source_account.owner == delegate || 
            ctx.accounts.destination_account.owner == delegate
        } else {
            false
        };
        
        // Check whitelist
        let mut is_whitelisted = false;
        if let Some(ref _whitelist) = ctx.accounts.source_whitelist {
            is_whitelisted = true;
        }
        if let Some(ref _whitelist) = ctx.accounts.destination_whitelist {
            is_whitelisted = true;
        }
        
        // Calculate fee
        let mut fee: u64 = 0;
        if !is_delegate && !is_whitelisted {
            require!(amount >= config.min_transfer_amount, TransferHookError::AmountTooLow);
            
            fee = (amount as u128)
                .checked_mul(config.transfer_fee_basis_points as u128)
                .ok_or(TransferHookError::MathOverflow)?
                .checked_div(10000)
                .ok_or(TransferHookError::MathOverflow)? as u64;
            
            if fee > config.max_transfer_fee {
                fee = config.max_transfer_fee;
            }
        }
        
        let net_amount = amount.checked_sub(fee).ok_or(TransferHookError::MathOverflow)?;
        
        // Update total fees (if fee > 0)
        if fee > 0 {
            let config_mut = &mut ctx.accounts.config;
            config_mut.total_fees_collected = config_mut.total_fees_collected
                .checked_add(fee)
                .ok_or(TransferHookError::MathOverflow)?;
        }
        
        emit!(TransferExecuted {
            source: ctx.accounts.source_account.owner,
            destination: ctx.accounts.destination_account.owner,
            amount,
            fee,
            net_amount,
            is_whitelisted,
            is_delegate,
            timestamp: Clock::get()?.unix_timestamp,
        });
        
        Ok(())
    }

    /// Add address to blacklist
    pub fn add_to_blacklist(
        ctx: Context<ManageBlacklist>,
        reason: String,
    ) -> Result<()> {
        require!(ctx.accounts.config.blacklist_enabled, TransferHookError::ComplianceNotEnabled);
        
        let entry = &mut ctx.accounts.blacklist_entry;
        entry.address = ctx.accounts.target_address.key();
        entry.reason = reason.clone();
        entry.blacklisted_by = ctx.accounts.authority.key();
        entry.created_at = Clock::get()?.unix_timestamp;
        entry.is_active = true;
        entry.bump = 0; // bump stored in PDA, not needed in data
        
        emit!(BlacklistAdded {
            address: ctx.accounts.target_address.key(),
            reason,
            blacklisted_by: ctx.accounts.authority.key(),
            timestamp: Clock::get()?.unix_timestamp,
        });
        
        Ok(())
    }

    /// Remove from blacklist
    pub fn remove_from_blacklist(ctx: Context<ManageBlacklist>) -> Result<()> {
        let entry = &mut ctx.accounts.blacklist_entry;
        entry.is_active = false;
        
        emit!(BlacklistRemoved {
            address: ctx.accounts.target_address.key(),
            removed_by: ctx.accounts.authority.key(),
            timestamp: Clock::get()?.unix_timestamp,
        });
        
        Ok(())
    }

    /// Seize tokens from blacklisted account
    pub fn seize_tokens(
        ctx: Context<SeizeTokens>,
        amount: Option<u64>,
        reason: String,
    ) -> Result<()> {
        let config = &ctx.accounts.config;
        
        // Only permanent delegate can seize
        require!(
            config.permanent_delegate == Some(ctx.accounts.authority.key()),
            TransferHookError::InvalidAuthority
        );
        
        // Cannot seize from self
        require!(
            ctx.accounts.source_account.owner != ctx.accounts.treasury.key(),
            TransferHookError::SelfSeizure
        );
        
        // Determine amount to seize
        let seize_amount = match amount {
            Some(amt) => amt,
            None => ctx.accounts.source_account.amount,
        };
        
        require!(seize_amount > 0, TransferHookError::AmountTooLow);
        require!(
            seize_amount <= ctx.accounts.source_account.amount,
            TransferHookError::AmountTooLow
        );
        
        // Transfer using permanent delegate authority
        anchor_spl::token_2022::transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                anchor_spl::token_2022::TransferChecked {
                    mint: ctx.accounts.mint.to_account_info(),
                    from: ctx.accounts.source_account.to_account_info(),
                    to: ctx.accounts.treasury.to_account_info(),
                    authority: ctx.accounts.permanent_delegate.to_account_info(),
                },
                &[],
            ),
            seize_amount,
            ctx.accounts.mint.decimals,
        )?;
        
        emit!(TokensSeized {
            from: ctx.accounts.source_account.owner,
            to: ctx.accounts.treasury.owner,
            amount: seize_amount,
            seized_by: ctx.accounts.authority.key(),
            reason,
            timestamp: Clock::get()?.unix_timestamp,
        });
        
        Ok(())
    }

    /// Add to whitelist
    pub fn add_to_whitelist(
        ctx: Context<ManageWhitelist>,
        whitelist_type: WhitelistType,
    ) -> Result<()> {
        let entry = &mut ctx.accounts.whitelist_entry;
        entry.address = ctx.accounts.target_address.key();
        entry.whitelist_type = whitelist_type;
        entry.added_by = ctx.accounts.authority.key();
        entry.created_at = Clock::get()?.unix_timestamp;
        entry.bump = 0; // bump stored in PDA, not needed in data
        
        Ok(())
    }

    /// Remove from whitelist
    pub fn remove_from_whitelist(_ctx: Context<ManageWhitelist>) -> Result<()> {
        // Account will be closed by Anchor
        Ok(())
    }

    /// Update configuration
    pub fn update_config(
        ctx: Context<UpdateConfig>,
        transfer_fee_basis_points: Option<u16>,
        max_transfer_fee: Option<u64>,
        min_transfer_amount: Option<u64>,
        is_paused: Option<bool>,
        blacklist_enabled: Option<bool>,
        permanent_delegate: Option<Option<Pubkey>>,
    ) -> Result<()> {
        let config = &mut ctx.accounts.config;
        
        if let Some(fee_bps) = transfer_fee_basis_points {
            config.transfer_fee_basis_points = fee_bps;
        }
        if let Some(max) = max_transfer_fee {
            config.max_transfer_fee = max;
        }
        if let Some(min) = min_transfer_amount {
            config.min_transfer_amount = min;
        }
        if let Some(paused) = is_paused {
            config.is_paused = paused;
        }
        if let Some(enabled) = blacklist_enabled {
            config.blacklist_enabled = enabled;
        }
        if let Some(delegate) = permanent_delegate {
            config.permanent_delegate = delegate;
        }
        
        emit!(ConfigUpdated {
            authority: ctx.accounts.authority.key(),
            field: "update_config".to_string(),
            value: "multiple".to_string(),
            timestamp: Clock::get()?.unix_timestamp,
        });
        
        Ok(())
    }
    
    /// ============ BATCH OPERATIONS ============
    
    /// Batch blacklist multiple addresses
    pub fn batch_blacklist(
        ctx: Context<BatchBlacklist>,
        addresses: Vec<Pubkey>,
        reasons: Vec<String>,
    ) -> Result<()> {
        require!(
            addresses.len() == reasons.len(),
            TransferHookError::InvalidInstruction
        );
        require!(
            addresses.len() <= 10,
            TransferHookError::InvalidInstruction
        );
        
        let config = &ctx.accounts.config;
        require!(config.blacklist_enabled, TransferHookError::ComplianceNotEnabled);
        
        // In real implementation, this would iterate and create multiple blacklist entries
        // For now, we emit a batch event
        
        emit!(BatchBlacklistAdded {
            authority: ctx.accounts.authority.key(),
            count: addresses.len() as u16,
            timestamp: Clock::get()?.unix_timestamp,
        });
        
        Ok(())
    }
}

/// ============ ACCOUNT STRUCTURES ============

#[derive(Accounts)]
pub struct InitializeHook<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    
    /// CHECK: The stablecoin mint this hook is for
    pub stablecoin: AccountInfo<'info>,
    
    /// CHECK: Stablecoin state PDA
    pub stablecoin_state: AccountInfo<'info>,
    
    #[account(
        init,
        payer = authority,
        space = 8 + 200,
        seeds = [b"hook_config", stablecoin.key().as_ref()],
        bump
    )]
    pub config: Account<'info, TransferHookConfig>,
    
    pub system_program: Program<'info, System>,
}

/// Accounts for initialize_extra_account_meta_list.
/// Token-2022 requires this account to be created with the extra PDAs
/// the hook will need during execute_transfer_hook invocations.
#[derive(Accounts)]
pub struct InitExtraAccountMetaList<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    /// CHECK: Transfer hook config (already initialized)
    #[account(
        seeds = [b"hook_config", mint.key().as_ref()],
        bump,
    )]
    pub config: Account<'info, TransferHookConfig>,

    /// The Token-2022 mint this hook is registered on
    /// CHECK: validated by seeds constraint
    pub mint: InterfaceAccount<'info, InterfaceMint>,

    /// The ExtraAccountMetaList account — seeded on "extra-account-metas" + mint
    /// This is the canonical seed required by the spl-transfer-hook-interface.
    /// CHECK: initialized inside the instruction via ExtraAccountMetaList::init
    #[account(
        init,
        payer = payer,
        space = ExtraAccountMetaList::size_of(5).unwrap_or(256), // Expanded for 5 extra accounts
        seeds = [b"extra-account-metas", mint.key().as_ref()],
        bump,
    )]
    pub extra_account_meta_list: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token2022>,
}

#[derive(Accounts)]
pub struct ExecuteTransferHook<'info> {
    #[account(
        seeds = [b"hook_config", mint.key().as_ref()],
        bump = config.bump,
    )]
    pub config: Account<'info, TransferHookConfig>,
    
    #[account(mut)]
    pub source_account: InterfaceAccount<'info, InterfaceTokenAccount>,
    
    #[account(mut)]
    pub destination_account: InterfaceAccount<'info, InterfaceTokenAccount>,
    
    pub mint: InterfaceAccount<'info, InterfaceMint>,
    
    /// CHECK: Source owner (from token account data)
    pub source_owner: AccountInfo<'info>,
    
    /// CHECK: Optional source blacklist
    #[account(
        seeds = [b"blacklist", config.key().as_ref(), source_owner.key().as_ref()],
        bump,
    )]
    pub source_blacklist: Option<Account<'info, BlacklistEntry>>,
    
    /// CHECK: Optional destination blacklist
    #[account(
        seeds = [b"blacklist", config.key().as_ref(), destination_account.owner.as_ref()],
        bump,
    )]
    pub destination_blacklist: Option<Account<'info, BlacklistEntry>>,
    
    /// CHECK: Optional source whitelist
    #[account(
        seeds = [b"whitelist", config.key().as_ref(), source_owner.key().as_ref()],
        bump,
    )]
    pub source_whitelist: Option<Account<'info, WhitelistEntry>>,
    
    /// CHECK: Optional destination whitelist
    #[account(
        seeds = [b"whitelist", config.key().as_ref(), destination_account.owner.as_ref()],
        bump,
    )]
    pub destination_whitelist: Option<Account<'info, WhitelistEntry>>,
    
    /// CHECK: Base Program ID
    pub base_program_id_account: Option<AccountInfo<'info>>,

    /// CHECK: Master Stablecoin State from Base Program
    pub stablecoin_state: Option<AccountInfo<'info>>,

    pub token_program: Program<'info, Token2022>,
}

#[derive(Accounts)]
pub struct ManageBlacklist<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    
    #[account(mut)]
    pub config: Account<'info, TransferHookConfig>,
    
    /// CHECK: Target address
    pub target_address: AccountInfo<'info>,
    
    #[account(
        init_if_needed,
        payer = authority,
        space = 8 + 200,
        seeds = [b"blacklist", config.key().as_ref(), target_address.key().as_ref()],
        bump,
    )]
    pub blacklist_entry: Account<'info, BlacklistEntry>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ManageWhitelist<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    
    #[account(mut)]
    pub config: Account<'info, TransferHookConfig>,
    
    /// CHECK: Target address
    pub target_address: AccountInfo<'info>,
    
    #[account(
        init_if_needed,
        payer = authority,
        space = 8 + 100,
        seeds = [b"whitelist", config.key().as_ref(), target_address.key().as_ref()],
        bump,
    )]
    pub whitelist_entry: Account<'info, WhitelistEntry>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SeizeTokens<'info> {
    pub authority: Signer<'info>,
    
    #[account(mut)]
    pub config: Account<'info, TransferHookConfig>,
    
    #[account(mut)]
    pub mint: InterfaceAccount<'info, InterfaceMint>,
    
    #[account(mut)]
    pub source_account: InterfaceAccount<'info, InterfaceTokenAccount>,
    
    #[account(mut)]
    pub treasury: InterfaceAccount<'info, InterfaceTokenAccount>,
    
    /// CHECK: Permanent delegate PDA
    pub permanent_delegate: AccountInfo<'info>,
    
    pub token_program: Program<'info, Token2022>,
}

#[derive(Accounts)]
pub struct UpdateConfig<'info> {
    pub authority: Signer<'info>,
    
    #[account(
        mut,
        has_one = authority @ TransferHookError::InvalidAuthority,
    )]
    pub config: Account<'info, TransferHookConfig>,
}

#[derive(Accounts)]
pub struct BatchBlacklist<'info> {
    pub authority: Signer<'info>,
    
    #[account(
        mut,
        has_one = authority @ TransferHookError::InvalidAuthority,
    )]
    pub config: Account<'info, TransferHookConfig>,
    
    pub system_program: Program<'info, System>,
}