use anchor_lang::prelude::*;

use crate::error::TransferHookError;

/// Transfer hook validation accounts.
///
/// Token-2022 calls this instruction during every transfer on a mint
/// configured with this transfer hook. Account ordering is fixed by the
/// transfer hook interface specification.
#[derive(Accounts)]
pub struct TransferHook<'info> {
  /// CHECK: Source token account — validated by Token-2022 before hook invocation.
  pub source: UncheckedAccount<'info>,

  /// CHECK: Token mint — validated by Token-2022.
  pub mint: UncheckedAccount<'info>,

  /// CHECK: Destination token account — validated by Token-2022.
  pub destination: UncheckedAccount<'info>,

  /// CHECK: Source authority (owner/delegate) — validated by Token-2022.
  pub authority: UncheckedAccount<'info>,

  /// CHECK: ExtraAccountMetaList PDA — resolved by Token-2022 using seeds
  /// [b"extra-account-metas", mint]. Not validated here since Token-2022
  /// handles resolution.
  pub extra_account_metas: UncheckedAccount<'info>,

  /// CHECK: Sender blacklist PDA — resolved by Token-2022 from
  /// ExtraAccountMetaList. If this account exists (has data, owned by this
  /// program), the sender is blacklisted and the transfer is rejected.
  pub sender_blacklist: UncheckedAccount<'info>,

  /// CHECK: Receiver blacklist PDA — resolved by Token-2022 from
  /// ExtraAccountMetaList. If this account exists (has data, owned by this
  /// program), the receiver is blacklisted and the transfer is rejected.
  pub receiver_blacklist: UncheckedAccount<'info>,
}

pub fn handler_transfer_hook(ctx: Context<TransferHook>, _amount: u64) -> Result<()> {
  let sender_bl = &ctx.accounts.sender_blacklist;
  let receiver_bl = &ctx.accounts.receiver_blacklist;

  // Blacklist check: if the PDA account exists (has data and is owned by
  // this program), the address is blacklisted. We use PDA existence as a
  // boolean flag — creating the account blacklists, closing it un-blacklists.
  if !sender_bl.data_is_empty() && sender_bl.owner == ctx.program_id {
    return Err(TransferHookError::SenderBlacklisted.into());
  }

  if !receiver_bl.data_is_empty() && receiver_bl.owner == ctx.program_id {
    return Err(TransferHookError::ReceiverBlacklisted.into());
  }

  Ok(())
}
