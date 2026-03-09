use colored::*;
use solana_sdk::pubkey::Pubkey;
use sss_token::state::{StablecoinConfig, RoleRegistry, MinterInfo, BlacklistEntry, ReserveAttestation};

pub fn display_config(config: &StablecoinConfig, roles: &RoleRegistry) {
    let preset_name = match config.preset {
        sss_token::state::StablecoinPreset::SSS1 => "SSS-1 (Minimal)",
        sss_token::state::StablecoinPreset::SSS2 => "SSS-2 (Compliant)",
        sss_token::state::StablecoinPreset::SSS3 => "SSS-3 (Private)",
        sss_token::state::StablecoinPreset::Custom => "Custom",
    };

    let supply = config.total_minted.saturating_sub(config.total_burned);
    let divisor = 10u64.pow(config.decimals as u32);
    let supply_display = format!("{}.{:0>width$}",
        supply / divisor,
        supply % divisor,
        width = config.decimals as usize
    );

    println!();
    println!("{}", "Stablecoin Info".bold().underline());
    println!("  {} {} ({})", "Name:".bold(), config.name, config.symbol);
    println!("  {} {}", "Mint:".bold(), config.mint);
    println!("  {} {}", "Preset:".bold(), preset_name.cyan());
    println!("  {} {}", "Paused:".bold(),
        if config.is_paused { "Yes".red() } else { "No".green() });
    println!("  {} {} (minted: {} / burned: {})",
        "Supply:".bold(), supply_display,
        config.total_minted, config.total_burned);
    println!("  {} {}", "Decimals:".bold(), config.decimals);

    let mut features = Vec::new();
    if config.enable_permanent_delegate { features.push("permanent_delegate"); }
    if config.enable_transfer_hook { features.push("transfer_hook"); }
    if config.default_account_frozen { features.push("default_frozen"); }
    if config.enable_confidential_transfers { features.push("confidential_transfers"); }
    let features_str = if features.is_empty() { "none".to_string() } else { features.join(", ") };
    println!("  {} {}", "Features:".bold(), features_str);

    println!();
    println!("{}", "Roles".bold().underline());
    println!("  {} {}", "Master Authority:".bold(), roles.master_authority);
    println!("  {} {}", "Pauser:".bold(), format_optional_role(&roles.pauser));
    println!("  {} {}", "Blacklister:".bold(), format_optional_role(&roles.blacklister));
    println!("  {} {}", "Seizer:".bold(), format_optional_role(&roles.seizer));
    println!();
}

#[allow(dead_code)]
pub fn display_minter(minter: &MinterInfo) {
    println!();
    println!("{}", "Minter Info".bold().underline());
    println!("  {} {}", "Minter:".bold(), minter.minter);
    println!("  {} {}", "Active:".bold(),
        if minter.is_active { "Yes".green() } else { "No".red() });
    println!("  {} {}", "Quota:".bold(),
        if minter.mint_quota == 0 { "Unlimited".to_string() } else { minter.mint_quota.to_string() });
    println!("  {} {}", "Total Minted:".bold(), minter.total_minted);
    println!();
}

#[allow(dead_code)]
pub fn display_blacklist_entry(entry: &BlacklistEntry) {
    println!();
    println!("{}", "Blacklist Entry".bold().underline());
    println!("  {} {}", "Address:".bold(), entry.blocked_address);
    println!("  {} {}", "Reason:".bold(), entry.reason);
    println!("  {} {}", "Blacklisted By:".bold(), entry.blacklisted_by);
    println!("  {} {}", "Blacklisted At:".bold(), entry.blacklisted_at);
    println!();
}

#[allow(dead_code)]
pub fn display_attestation(attestation: &ReserveAttestation) {
    let hash_hex: String = attestation.reserve_hash.iter().map(|b| format!("{:02x}", b)).collect();
    println!();
    println!("{}", "Reserve Attestation".bold().underline());
    println!("  {} {}", "Index:".bold(), attestation.index);
    println!("  {} {}", "Hash:".bold(), hash_hex);
    println!("  {} {} cents", "Total Reserves (USD):".bold(), attestation.total_reserves_usd);
    println!("  {} {}", "Total Outstanding:".bold(), attestation.total_outstanding);
    println!("  {} {}", "Attested By:".bold(), attestation.attested_by);
    println!("  {} {}", "URI:".bold(), attestation.attestation_uri);
    println!();
}

fn format_optional_role(pubkey: &Pubkey) -> String {
    if *pubkey == Pubkey::default() {
        "(not set)".dimmed().to_string()
    } else {
        pubkey.to_string()
    }
}
