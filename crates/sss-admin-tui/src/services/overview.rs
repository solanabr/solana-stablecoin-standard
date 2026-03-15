use sss_admin_cli::chain::{HolderRecord, RoleRecord, StatusRecord};

use crate::runtime::AppRuntime;

pub struct OverviewViewModel {
    pub mint: String,
    pub preset: String,
    pub paused_label: String,
    pub supply: String,
    pub total_minted: String,
    pub total_burned: String,
    pub holder_count: String,
    pub name: String,
    pub symbol: String,
    pub decimals: String,
    pub uri: String,
    pub permanent_delegate: String,
    pub transfer_hook: String,
    pub default_frozen: String,
    pub roles: RoleViewModel,
    pub authority_ready: String,
    pub chain_status: String,
    pub backend_status: String,
    pub holders: Vec<HolderRow>,
}

pub struct RoleViewModel {
    pub master_authority: String,
    pub pauser: String,
    pub burner: String,
    pub blacklister: String,
    pub seizer: String,
}

pub struct HolderRow {
    pub owner: String,
    pub token_account: String,
    pub balance: String,
    pub percent_of_supply: String,
}

impl OverviewViewModel {
    pub fn from_runtime(
        runtime: &AppRuntime,
        status: StatusRecord,
        holders: Vec<HolderRecord>,
        api_ready: bool,
    ) -> Self {
        let holder_count = holders.len();
        let supply = status.supply;
        let top_holders = to_holder_rows(&holders, supply);

        Self {
            mint: status.mint.to_string(),
            preset: infer_preset(&status).to_string(),
            paused_label: if status.paused { "Paused" } else { "Active" }.to_string(),
            supply: status.supply.to_string(),
            total_minted: status.total_minted.to_string(),
            total_burned: status.total_burned.to_string(),
            holder_count: holder_count.to_string(),
            name: status.name,
            symbol: status.symbol,
            decimals: status.decimals.to_string(),
            uri: status.uri,
            permanent_delegate: bool_label(status.enable_permanent_delegate),
            transfer_hook: bool_label(status.enable_transfer_hook),
            default_frozen: bool_label(status.default_account_frozen),
            roles: RoleViewModel::from_roles(status.roles),
            authority_ready: "Loaded".to_string(),
            chain_status: format!("Connected via {}", runtime.rpc_url()),
            backend_status: if api_ready {
                "Configured".to_string()
            } else {
                "Missing API URL".to_string()
            },
            holders: top_holders,
        }
    }
}

impl RoleViewModel {
    fn from_roles(roles: RoleRecord) -> Self {
        Self {
            master_authority: roles.master_authority.to_string(),
            pauser: roles.pauser.to_string(),
            burner: roles.burner.to_string(),
            blacklister: roles.blacklister.to_string(),
            seizer: roles.seizer.to_string(),
        }
    }
}

fn to_holder_rows(holders: &[HolderRecord], supply: u64) -> Vec<HolderRow> {
    holders
        .iter()
        .take(12)
        .map(|holder| HolderRow {
            owner: holder.owner.to_string(),
            token_account: holder.token_account.to_string(),
            balance: holder.amount.to_string(),
            percent_of_supply: format_percent(holder.amount, supply),
        })
        .collect()
}

fn format_percent(amount: u64, supply: u64) -> String {
    if supply == 0 {
        return "0.00%".to_string();
    }
    format!("{:.2}%", (amount as f64 / supply as f64) * 100.0)
}

fn infer_preset(status: &StatusRecord) -> &'static str {
    if status.enable_permanent_delegate && status.enable_transfer_hook {
        "sss-2"
    } else {
        "sss-1"
    }
}

fn bool_label(value: bool) -> String {
    if value {
        "Enabled".to_string()
    } else {
        "Disabled".to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use solana_sdk::pubkey::Pubkey;
    use sss_admin_cli::chain::{HolderRecord, RoleRecord, StatusRecord};

    #[test]
    fn formats_percent_with_supply() {
        assert_eq!(format_percent(250, 1000), "25.00%");
    }

    #[test]
    fn handles_zero_supply() {
        assert_eq!(format_percent(250, 0), "0.00%");
    }

    #[test]
    fn keeps_only_top_rows() {
        let holders = (0..20)
            .map(|index| HolderRecord {
                owner: Pubkey::new_unique(),
                token_account: Pubkey::new_unique(),
                amount: 100 - index,
            })
            .collect::<Vec<_>>();

        let rows = to_holder_rows(&holders, 1000);
        assert_eq!(rows.len(), 12);
        assert_eq!(rows[0].balance, "100");
    }

    #[test]
    fn infers_sss2_when_transfer_controls_enabled() {
        let status = sample_status(true, true);
        assert_eq!(infer_preset(&status), "sss-2");
    }

    fn sample_status(enable_permanent_delegate: bool, enable_transfer_hook: bool) -> StatusRecord {
        StatusRecord {
            mint: Pubkey::new_unique(),
            authority: Pubkey::new_unique(),
            name: "Acme USD".to_string(),
            symbol: "AUSD".to_string(),
            uri: "https://example.com".to_string(),
            decimals: 6,
            paused: false,
            enable_permanent_delegate,
            enable_transfer_hook,
            default_account_frozen: false,
            total_minted: 1_000,
            total_burned: 100,
            supply: 900,
            roles: RoleRecord {
                master_authority: Pubkey::new_unique(),
                pauser: Pubkey::new_unique(),
                burner: Pubkey::new_unique(),
                blacklister: Pubkey::new_unique(),
                seizer: Pubkey::new_unique(),
            },
        }
    }
}
