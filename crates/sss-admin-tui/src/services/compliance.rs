use sss_admin_cli::chain::StatusRecord;

pub struct ComplianceViewModel {
    pub mint: String,
    pub paused: bool,
    pub paused_label: String,
    pub transfer_hook: String,
    pub default_frozen: String,
    pub blacklister: String,
    pub seizer: String,
    pub pauser: String,
}

impl ComplianceViewModel {
    pub fn from_status(status: StatusRecord) -> Self {
        Self {
            mint: status.mint.to_string(),
            paused: status.paused,
            paused_label: if status.paused {
                "Paused".to_string()
            } else {
                "Active".to_string()
            },
            transfer_hook: bool_label(status.enable_transfer_hook),
            default_frozen: bool_label(status.default_account_frozen),
            blacklister: status.roles.blacklister.to_string(),
            seizer: status.roles.seizer.to_string(),
            pauser: status.roles.pauser.to_string(),
        }
    }
}

fn bool_label(value: bool) -> String {
    if value {
        "Enabled".to_string()
    } else {
        "Disabled".to_string()
    }
}
