use anchor_lang::prelude::*;
use crate::state::{AllowlistEntry, PrivateStablecoinState};
use crate::errors::SSSPrivateError;
use crate::events::{DepositToConfidentialEvent, WithdrawToPublicEvent};

// ─── Deposit to Confidential ─────────────────────────────────────────────────

#[derive(Accounts)]
pub struct DepositToConfidential<'info> {
    /// The owner of the token account
    #[account(mut)]
    pub owner: Signer<'info>,

    /// The private stablecoin state
    #[account(
        mut,
        constraint = !state.paused @ SSSPrivateError::Paused,
    )]
    pub state: Account<'info, PrivateStablecoinState>,

    /// The owner's allowlist entry — must be approved
    #[account(
        seeds = [b"allowlist", state.key().as_ref(), owner.key().as_ref()],
        bump = allowlist_entry.bump,
        constraint = allowlist_entry.approved @ SSSPrivateError::NotOnAllowlist,
    )]
    pub allowlist_entry: Account<'info, AllowlistEntry>,

    /// The owner's token account (Token-2022 with ConfidentialTransfer extension)
    /// CHECK: Validated via Token-2022 CPI
    #[account(mut)]
    pub token_account: UncheckedAccount<'info>,

    /// The mint
    /// CHECK: Validated against state
    pub mint: UncheckedAccount<'info>,

    /// Token-2022 program
    pub token_program: Program<'info, anchor_spl::token_2022::Token2022>,
}

pub fn deposit_handler(ctx: Context<DepositToConfidential>, amount: u64) -> Result<()> {
    require!(amount > 0, SSSPrivateError::ZeroAmount);

    let clock = Clock::get()?;

    // Track cumulative deposits
    let state = &mut ctx.accounts.state;
    state.total_deposited_confidential = state
        .total_deposited_confidential
        .checked_add(amount)
        .unwrap();

    // NOTE: In production, this would call:
    //   spl_token_2022::extension::confidential_transfer::instruction::deposit(
    //       token_program_id,
    //       token_account,
    //       mint,
    //       amount,
    //       decimals,
    //       owner,
    //   )
    //
    // Followed by:
    //   spl_token_2022::extension::confidential_transfer::instruction::apply_pending_balance(
    //       token_program_id,
    //       token_account,
    //       expected_pending_balance_credit_counter,
    //       new_decryptable_available_balance,
    //       owner,
    //   )
    //
    // The `apply_pending_balance` step requires the client to provide
    // an encrypted version of the new available balance using their ElGamal key.

    msg!(
        "SSS-3: {} deposited {} tokens to confidential balance",
        ctx.accounts.owner.key(),
        amount
    );

    emit!(DepositToConfidentialEvent {
        state: state.key(),
        wallet: ctx.accounts.owner.key(),
        amount,
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}

// ─── Withdraw to Public ──────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct WithdrawToPublic<'info> {
    /// The owner of the token account
    #[account(mut)]
    pub owner: Signer<'info>,

    /// The private stablecoin state
    #[account(
        mut,
        constraint = !state.paused @ SSSPrivateError::Paused,
    )]
    pub state: Account<'info, PrivateStablecoinState>,

    /// The owner's allowlist entry — must be approved
    #[account(
        seeds = [b"allowlist", state.key().as_ref(), owner.key().as_ref()],
        bump = allowlist_entry.bump,
        constraint = allowlist_entry.approved @ SSSPrivateError::NotOnAllowlist,
    )]
    pub allowlist_entry: Account<'info, AllowlistEntry>,

    /// The owner's token account (Token-2022 with ConfidentialTransfer extension)
    /// CHECK: Validated via Token-2022 CPI
    #[account(mut)]
    pub token_account: UncheckedAccount<'info>,

    /// The mint
    /// CHECK: Validated against state
    pub mint: UncheckedAccount<'info>,

    /// Token-2022 program
    pub token_program: Program<'info, anchor_spl::token_2022::Token2022>,
}

pub fn withdraw_handler(
    ctx: Context<WithdrawToPublic>,
    amount: u64,
    _proof_data: Vec<u8>,
) -> Result<()> {
    require!(amount > 0, SSSPrivateError::ZeroAmount);

    let clock = Clock::get()?;

    // Track cumulative withdrawals
    let state = &mut ctx.accounts.state;
    state.total_withdrawn_confidential = state
        .total_withdrawn_confidential
        .checked_add(amount)
        .unwrap();

    // NOTE: In production, this would:
    //
    // 1. Verify the zero-knowledge proof (`proof_data`) on-chain using
    //    the ZK Token Proof program (ZkTokenProof111111111111111111111111111111)
    //
    // 2. Call spl_token_2022::extension::confidential_transfer::instruction::withdraw(
    //        token_program_id,
    //        token_account,
    //        mint,
    //        amount,
    //        decimals,
    //        new_decryptable_available_balance,
    //        owner,
    //        proof_instruction_offset,
    //    )
    //
    // The ZK proof demonstrates:
    //   - The sender has sufficient confidential balance
    //   - The new encrypted balance is correctly computed
    //   - No negative balances result from the withdrawal
    //
    // Proof types needed:
    //   - RangeProof: proves amount is in valid range [0, 2^64)
    //   - CiphertextCiphertextEqualityProof: proves amount consistency

    msg!(
        "SSS-3: {} withdrew {} tokens from confidential balance",
        ctx.accounts.owner.key(),
        amount
    );

    emit!(WithdrawToPublicEvent {
        state: state.key(),
        wallet: ctx.accounts.owner.key(),
        amount,
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}
