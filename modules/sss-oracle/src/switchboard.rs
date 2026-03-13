//! Minimal Switchboard V2 aggregator parser.
//!
//! Reads price and timestamp from Switchboard aggregator accounts without
//! the full switchboard-solana dependency (which has Anchor version conflicts).
//! Layout matches switchboard-solana 0.30 AggregatorAccountData.

use anchor_lang::prelude::*;

/// Switchboard Oracle Program ID (mainnet)
pub const SWITCHBOARD_PROGRAM_ID: Pubkey =
    anchor_lang::solana_program::pubkey!("SW1TCH7qEPTdLsDHRgPuMQjbQxKdH2aBStViMFnt64f");

/// SwitchboardDecimal: mantissa (i128) + scale (u32) = 20 bytes
/// Value = mantissa / 10^scale
#[repr(C)]
#[derive(Clone, Copy)]
struct SwitchboardDecimal {
    mantissa: i128,
    scale: u32,
}

/// AggregatorRound - result and timestamp. We only need the first few fields.
/// Layout: num_success(4) + num_error(4) + is_closed(1) + round_open_slot(8) + round_open_timestamp(8) + result(20)
const ROUND_OFFSET: usize = 4 + 4 + 1 + 8; // 17
const ROUND_TIMESTAMP_SIZE: usize = 8;
const ROUND_RESULT_OFFSET: usize = ROUND_OFFSET + ROUND_TIMESTAMP_SIZE; // 25

/// Offset to latest_confirmed_round in AggregatorAccountData (after 8-byte discriminator).
/// name(32) + metadata(128) + _reserved1(32) + queue_pubkey(32) + oracle_request_batch_size(4) +
/// min_oracle_results(4) + min_job_results(4) + min_update_delay_seconds(4) + start_after(8) +
/// variance_threshold(20) + force_report_period(8) + expiration(8) + consecutive_failure_count(8) +
/// next_allowed_update_time(8) + is_locked(1) + crank_pubkey(32)
const LAYOUT_BEFORE_ROUND: usize = 32 + 128 + 32 + 32 + 4 + 4 + 4 + 4 + 8 + 20 + 8 + 8 + 8 + 8 + 1 + 32;
const LATEST_ROUND_OFFSET: usize = 8 + LAYOUT_BEFORE_ROUND; // discriminator + header

/// Parse price and timestamp from Switchboard aggregator account.
/// Validates owner is Switchboard program. Caller must check staleness.
pub fn parse_switchboard_aggregator(
    data: &[u8],
    owner: &Pubkey,
) -> Result<(f64, i64)> {
    if owner != &SWITCHBOARD_PROGRAM_ID {
        return Err(ProgramError::InvalidAccountOwner.into());
    }

    let min_len = LATEST_ROUND_OFFSET + ROUND_RESULT_OFFSET + 20; // + SwitchboardDecimal size
    if data.len() < min_len {
        return Err(ProgramError::InvalidAccountData.into());
    }

    let round_start = LATEST_ROUND_OFFSET;
    let num_success = u32::from_le_bytes(data[round_start..round_start + 4].try_into().unwrap());
    let min_oracle_offset = 8 + 32 + 128 + 32 + 32 + 4; // after name, metadata, reserved, queue, oracle_request_batch_size
    let min_oracle_results =
        u32::from_le_bytes(data[min_oracle_offset..min_oracle_offset + 4].try_into().unwrap());

    // Require sufficient oracle responses (match switchboard logic for ModeRoundResolution)
    if num_success < min_oracle_results {
        return Err(ProgramError::InvalidAccountData.into());
    }

    let timestamp_offset = round_start + ROUND_OFFSET;
    let round_open_timestamp =
        i64::from_le_bytes(data[timestamp_offset..timestamp_offset + 8].try_into().unwrap());

    let result_offset = round_start + ROUND_RESULT_OFFSET;
    let mantissa = i128::from_le_bytes(data[result_offset..result_offset + 16].try_into().unwrap());
    let scale = u32::from_le_bytes(data[result_offset + 16..result_offset + 20].try_into().unwrap());

    let price = if scale == 0 {
        mantissa as f64
    } else {
        let divisor = 10_f64.powi(scale as i32);
        mantissa as f64 / divisor
    };

    Ok((price, round_open_timestamp))
}
