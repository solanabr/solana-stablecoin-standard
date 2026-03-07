use anchor_client::anchor_lang::AnchorDeserialize;
use anyhow::{Context, Result};
use base64::Engine;
use clap::Args;
use solana_client::{rpc_client::{GetConfirmedSignaturesForAddress2Config, RpcClient}, rpc_config::RpcTransactionConfig};
use solana_sdk::commitment_config::CommitmentConfig;
use solana_sdk::signature::Signature;
use std::str::FromStr;
use solana_transaction_status::{UiTransactionEncoding, option_serializer::OptionSerializer};

use crate::{config::CliConfig, program_client::PROGRAM_ID};

/// Anchor event CPI discriminators — sha256("event:<EventName>")[..8]
/// These are the first 8 bytes of the instruction data in the self-CPI emitted by emit_cpi!()
fn event_discriminator(name: &str) -> [u8; 8] {
    let input = format!("event:{}", name);
    let hash = anchor_client::solana_sdk::hash::hash(input.as_bytes());
    let mut disc = [0u8; 8];
    disc.copy_from_slice(&hash.to_bytes()[..8]);
    disc
}

#[derive(Args)]
pub struct AuditLogArgs {
    /// Filter by action type (e.g. mint, burn, freeze, add_to_blacklist, etc.)
    #[arg(long)]
    pub action: Option<String>,
    /// Number of recent transactions to scan (default: 100)
    #[arg(long, default_value_t = 100)]
    pub limit: usize,
}

pub async fn run(cfg: CliConfig, audit_args: AuditLogArgs) -> Result<()> {
    let rpc = RpcClient::new_with_commitment(cfg.rpc_url.clone(), CommitmentConfig::confirmed());

    // Map user-friendly action names to IDL event names (unknown action = no filter)
    let filter_event = audit_args.action.as_deref().and_then(action_to_event_name);

    let sigs = rpc.get_signatures_for_address_with_config(
        &PROGRAM_ID,
        GetConfirmedSignaturesForAddress2Config {
            limit: Some(audit_args.limit),
            commitment: Some(CommitmentConfig::confirmed()),
            ..Default::default()
        },
    )?;

    if sigs.is_empty() {
        println!("No transactions found for program {}", PROGRAM_ID);
        return Ok(());
    }

    let mut printed = 0usize;

    for sig_info in &sigs {
        let sig = Signature::from_str(&sig_info.signature)
            .with_context(|| format!("Bad signature: {}", sig_info.signature))?;

        let tx = match rpc.get_transaction_with_config(
            &sig,
            RpcTransactionConfig {
                encoding: Some(UiTransactionEncoding::Base64),
                commitment: Some(CommitmentConfig::confirmed()),
                max_supported_transaction_version: Some(0),
            },
        ) {
            Ok(t) => t,
            Err(_) => continue,
        };

        let meta = match tx.transaction.meta {
            Some(m) => m,
            None => continue,
        };

        // Inner instructions contain the event self-CPI
        let inner_ixs = match &meta.inner_instructions {
            OptionSerializer::Some(v) => v,
            _ => continue,
        };

        for inner_set in inner_ixs {
            for inner_ix in &inner_set.instructions {
                let ix_data = match inner_ix {
                    solana_transaction_status::UiInstruction::Compiled(c) => {
                        base64::engine::general_purpose::STANDARD
                            .decode(&c.data)
                            .ok()
                    }
                    _ => None,
                };

                let data = match ix_data {
                    Some(d) if d.len() >= 8 => d,
                    _ => continue,
                };

                let disc: [u8; 8] = data[..8].try_into().unwrap();

                let event_name = match_event_discriminator(disc);
                if event_name.is_none() {
                    continue;
                }
                let event_name = event_name.unwrap();

                if let Some(filter) = filter_event {
                    if event_name != filter {
                        continue;
                    }
                }

                let slot = tx.slot;
                let ts = sig_info.block_time.unwrap_or(0);
                println!(
                    "sig={} slot={} time={} event={}",
                    &sig_info.signature[..16],
                    slot,
                    ts,
                    event_name
                );

                decode_and_print_event(event_name, &data[8..]);
                printed += 1;
            }
        }
    }

    if printed == 0 {
        println!("No events found (scanned {} transactions)", sigs.len());
    }

    Ok(())
}

fn action_to_event_name(action: &str) -> Option<&'static str> {
    let name = match action {
        "mint" => "MintTokensEvent",
        "burn" => "BurnTokensEvent",
        "freeze" => "FreezeAccountEvent",
        "thaw" => "ThawAccountEvent",
        "pause" => "PauseEvent",
        "unpause" => "UnpauseEvent",
        "add_to_blacklist" | "blacklist_add" => "AddToBlacklistEvent",
        "remove_from_blacklist" | "blacklist_remove" => "RemoveFromBlacklistEvent",
        "seize" => "SeizeEvent",
        "initialize" => "InitializeEvent",
        "transfer_authority" => "TransferAuthorityEvent",
        "update_minter" | "minters" => "UpdateMinterEvent",
        "update_roles" | "roles" => "UpdateRolesEvent",
        _ => return None,
    };
    Some(name)
}

static AUDIT_EVENT_NAMES: &[&str] = &[
    "AddToBlacklistEvent",
    "BurnTokensEvent",
    "FreezeAccountEvent",
    "InitializeEvent",
    "MintTokensEvent",
    "PauseEvent",
    "RemoveFromBlacklistEvent",
    "SeizeEvent",
    "ThawAccountEvent",
    "TransferAuthorityEvent",
    "UnpauseEvent",
    "UpdateMinterEvent",
    "UpdateRolesEvent",
];

fn match_event_discriminator(disc: [u8; 8]) -> Option<&'static str> {
    AUDIT_EVENT_NAMES
        .iter()
        .find(|&&name| event_discriminator(name) == disc)
        .copied()
}

fn decode_and_print_event(name: &str, data: &[u8]) {
    match name {
        "MintTokensEvent" => {
            if let Ok((minter, to, mint, amount)) = decode_fields_pubkey_pubkey_pubkey_u64(data) {
                println!(
                    "  minter={} to={} mint={} amount={}",
                    minter, to, mint, amount
                );
            }
        }
        "BurnTokensEvent" => {
            if let Ok((burner, mint, from, amount)) = decode_fields_pubkey_pubkey_pubkey_u64(data) {
                println!(
                    "  burner={} mint={} from={} amount={}",
                    burner, mint, from, amount
                );
            }
        }
        "FreezeAccountEvent" => {
            if let Ok((ata, mint)) = decode_fields_pubkey_pubkey(data) {
                println!("  ata_to_freeze={} mint={}", ata, mint);
            }
        }
        "ThawAccountEvent" => {
            if let Ok((master, ata, mint)) = decode_fields_pubkey_pubkey_pubkey(data) {
                println!("  master={} ata_to_thaw={} mint={}", master, ata, mint);
            }
        }
        "PauseEvent" | "UnpauseEvent" => {
            if let Ok((pauser, mint)) = decode_fields_pubkey_pubkey(data) {
                println!("  pauser={} mint={}", pauser, mint);
            }
        }
        "AddToBlacklistEvent" => {
            if let Ok((blacklisted, mint)) = decode_fields_pubkey_pubkey(data) {
                let reason = decode_string_after(data, 64).unwrap_or_default();
                println!(
                    "  blacklisted={} mint={} reason={}",
                    blacklisted, mint, reason
                );
            }
        }
        "RemoveFromBlacklistEvent" => {
            if let Ok((wallet, mint)) = decode_fields_pubkey_pubkey(data) {
                println!("  wallet={} mint={}", wallet, mint);
            }
        }
        "SeizeEvent" => {
            if let Ok((seizer, from, to, mint)) = decode_fields_pubkey_pubkey_pubkey_pubkey(data) {
                println!("  seizer={} from={} to={} mint={}", seizer, from, to, mint);
            }
        }
        "InitializeEvent" => {
            if let Ok(pubkey) = decode_pubkey(data) {
                println!("  mint={}", pubkey);
            }
        }
        "TransferAuthorityEvent" => {
            if let Ok((master, new_master, mint)) = decode_fields_pubkey_pubkey_pubkey(data) {
                println!(
                    "  master={} new_master={} mint={}",
                    master, new_master, mint
                );
            }
        }
        "UpdateMinterEvent" => {
            // operation(string) + mint(pubkey) + minter(pubkey) + allowance(u64)
            let mut cursor = std::io::Cursor::new(data);
            if let Ok(operation) = <String as AnchorDeserialize>::deserialize_reader(&mut cursor) {
                let pos = cursor.position() as usize;
                if pos + 32 + 32 + 8 <= data.len() {
                    let mint = decode_pubkey(&data[pos..]).unwrap_or_default();
                    let minter = decode_pubkey(&data[pos + 32..]).unwrap_or_default();
                    let allowance =
                        u64::from_le_bytes(data[pos + 64..pos + 72].try_into().unwrap_or([0; 8]));
                    println!(
                        "  operation={} mint={} minter={} allowance={}",
                        operation, mint, minter, allowance
                    );
                }
            }
        }
        "UpdateRolesEvent" => {
            let mut cursor = std::io::Cursor::new(data);
            if let Ok(role) = <String as AnchorDeserialize>::deserialize_reader(&mut cursor) {
                let pos = cursor.position() as usize;
                if pos + 64 <= data.len() {
                    let mint = decode_pubkey(&data[pos..]).unwrap_or_default();
                    let master = decode_pubkey(&data[pos + 32..]).unwrap_or_default();
                    println!("  role={} mint={} master={}", role, mint, master);
                }
            }
        }
        _ => {}
    }
}

fn decode_pubkey(data: &[u8]) -> Result<solana_sdk::pubkey::Pubkey> {
    use solana_sdk::pubkey::Pubkey;
    if data.len() < 32 {
        anyhow::bail!("not enough data");
    }
    Ok(Pubkey::from(<[u8; 32]>::try_from(&data[..32]).unwrap()))
}

fn decode_fields_pubkey_pubkey(
    data: &[u8],
) -> Result<(solana_sdk::pubkey::Pubkey, solana_sdk::pubkey::Pubkey)> {
    if data.len() < 64 {
        anyhow::bail!("not enough data");
    }
    Ok((decode_pubkey(&data[..32])?, decode_pubkey(&data[32..])?))
}

fn decode_fields_pubkey_pubkey_pubkey(
    data: &[u8],
) -> Result<(
    solana_sdk::pubkey::Pubkey,
    solana_sdk::pubkey::Pubkey,
    solana_sdk::pubkey::Pubkey,
)> {
    if data.len() < 96 {
        anyhow::bail!("not enough data");
    }
    Ok((
        decode_pubkey(&data[..32])?,
        decode_pubkey(&data[32..64])?,
        decode_pubkey(&data[64..])?,
    ))
}

fn decode_fields_pubkey_pubkey_pubkey_pubkey(
    data: &[u8],
) -> Result<(
    solana_sdk::pubkey::Pubkey,
    solana_sdk::pubkey::Pubkey,
    solana_sdk::pubkey::Pubkey,
    solana_sdk::pubkey::Pubkey,
)> {
    if data.len() < 128 {
        anyhow::bail!("not enough data");
    }
    Ok((
        decode_pubkey(&data[..32])?,
        decode_pubkey(&data[32..64])?,
        decode_pubkey(&data[64..96])?,
        decode_pubkey(&data[96..])?,
    ))
}

fn decode_fields_pubkey_pubkey_pubkey_u64(
    data: &[u8],
) -> Result<(
    solana_sdk::pubkey::Pubkey,
    solana_sdk::pubkey::Pubkey,
    solana_sdk::pubkey::Pubkey,
    u64,
)> {
    if data.len() < 104 {
        anyhow::bail!("not enough data");
    }
    let pk1 = decode_pubkey(&data[..32])?;
    let pk2 = decode_pubkey(&data[32..64])?;
    let pk3 = decode_pubkey(&data[64..96])?;
    let amount = u64::from_le_bytes(data[96..104].try_into().unwrap());
    Ok((pk1, pk2, pk3, amount))
}

fn decode_string_after(data: &[u8], offset: usize) -> Option<String> {
    let mut cursor = std::io::Cursor::new(&data[offset..]);
    <String as AnchorDeserialize>::deserialize_reader(&mut cursor).ok()
}
