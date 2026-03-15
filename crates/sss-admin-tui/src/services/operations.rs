use sss_domain::{LifecycleRequest, LifecycleRequestType, LifecycleStatus};

use crate::runtime::AppRuntime;

pub struct OperationsViewModel {
    pub rows: Vec<OperationRow>,
    pub selected: Option<usize>,
    pub detail: Option<OperationDetail>,
    pub status_filter: String,
    pub type_filter: String,
    pub backend_status: String,
}

pub struct OperationRow {
    pub id: String,
    pub type_label: String,
    pub status_label: String,
    pub amount: String,
    pub requested_by: String,
    pub updated_at: String,
}

pub struct OperationDetail {
    pub id: String,
    pub type_label: String,
    pub status_label: String,
    pub mint: String,
    pub amount: String,
    pub recipient: String,
    pub token_account: String,
    pub reason: String,
    pub requested_by: String,
    pub approved_by: String,
    pub tx_signature: String,
    pub error: String,
    pub created_at: String,
    pub updated_at: String,
}

impl OperationsViewModel {
    pub fn from_requests(
        runtime: &AppRuntime,
        requests: Vec<LifecycleRequest>,
        status: Option<LifecycleStatus>,
        type_: Option<LifecycleRequestType>,
    ) -> Self {
        let rows = requests.iter().map(OperationRow::from_request).collect::<Vec<_>>();
        let detail = requests.first().map(OperationDetail::from_request);
        Self {
            rows,
            selected: if requests.is_empty() { None } else { Some(0) },
            detail,
            status_filter: format_status_filter(status),
            type_filter: format_type_filter(type_),
            backend_status: format!("Connected via {}", runtime.api_label()),
        }
    }

    pub fn update_selection(&mut self, index: Option<usize>, requests: &[LifecycleRequest]) {
        self.selected = index;
        self.detail = index.and_then(|selected| requests.get(selected).map(OperationDetail::from_request));
    }
}

impl OperationRow {
    fn from_request(request: &LifecycleRequest) -> Self {
        Self {
            id: request.id.clone(),
            type_label: request.type_.as_str().to_string(),
            status_label: request.status.as_str().to_string(),
            amount: request.amount.to_string(),
            requested_by: request.requested_by.clone(),
            updated_at: request.updated_at.to_rfc3339(),
        }
    }
}

impl OperationDetail {
    fn from_request(request: &LifecycleRequest) -> Self {
        Self {
            id: request.id.clone(),
            type_label: request.type_.as_str().to_string(),
            status_label: request.status.as_str().to_string(),
            mint: request.mint.clone(),
            amount: request.amount.to_string(),
            recipient: display_or_dash(&request.recipient).to_string(),
            token_account: display_or_dash(&request.token_account).to_string(),
            reason: request.reason.clone().unwrap_or_else(|| "-".to_string()),
            requested_by: request.requested_by.clone(),
            approved_by: request.approved_by.clone().unwrap_or_else(|| "-".to_string()),
            tx_signature: request.tx_signature.clone().unwrap_or_else(|| "-".to_string()),
            error: request.error.clone().unwrap_or_else(|| "-".to_string()),
            created_at: request.created_at.to_rfc3339(),
            updated_at: request.updated_at.to_rfc3339(),
        }
    }
}

fn format_status_filter(status: Option<LifecycleStatus>) -> String {
    match status {
        Some(status) => status.as_str().to_string(),
        None => "all".to_string(),
    }
}

fn format_type_filter(type_: Option<LifecycleRequestType>) -> String {
    match type_ {
        Some(type_) => type_.as_str().to_string(),
        None => "all".to_string(),
    }
}

fn display_or_dash(value: &str) -> &str {
    if value.trim().is_empty() {
        "-"
    } else {
        value
    }
}

#[cfg(test)]
mod tests {
    use chrono::Utc;
    use sss_domain::{LifecycleRequest, LifecycleRequestType, LifecycleStatus};

    use super::*;

    #[test]
    fn uses_all_when_filters_are_empty() {
        assert_eq!(format_status_filter(None), "all");
        assert_eq!(format_type_filter(None), "all");
    }

    #[test]
    fn maps_first_request_into_detail() {
        let request = sample_request("op-1", LifecycleRequestType::Mint, LifecycleStatus::Requested);
        let runtime = sample_runtime();
        let view = OperationsViewModel::from_requests(&runtime, vec![request], None, None);
        assert_eq!(view.selected, Some(0));
        assert_eq!(view.detail.as_ref().map(|detail| detail.id.as_str()), Some("op-1"));
    }

    fn sample_runtime() -> AppRuntime {
        use solana_sdk::pubkey::Pubkey;
        use sss_admin_cli::config::{FeatureFlags, InitConfigFile, Preset};

        AppRuntime::test_only(
            InitConfigFile {
                name: "Acme USD".to_string(),
                symbol: "AUSD".to_string(),
                decimals: 6,
                uri: "https://example.com".to_string(),
                preset: Preset::Sss1,
                authority_keypair: None,
                rpc_url: Some("https://rpc.test".to_string()),
                api_url: Some("http://127.0.0.1:8080".to_string()),
                mint: Some(Pubkey::new_unique().to_string()),
                features: FeatureFlags {
                    enable_permanent_delegate: false,
                    enable_transfer_hook: false,
                    default_account_frozen: false,
                },
            },
            "Mint111111111111111111111111111111111111111".to_string(),
            Pubkey::new_unique(),
            "https://rpc.test".to_string(),
            Some("http://127.0.0.1:8080".to_string()),
        )
    }

    fn sample_request(
        id: &str,
        type_: LifecycleRequestType,
        status: LifecycleStatus,
    ) -> LifecycleRequest {
        LifecycleRequest {
            id: id.to_string(),
            type_,
            status,
            mint: "Mint111111111111111111111111111111111111111".to_string(),
            recipient: "Recipient111".to_string(),
            token_account: String::new(),
            amount: 42,
            minter: None,
            reason: Some("ops".to_string()),
            idempotency_key: None,
            requested_by: "tester".to_string(),
            approved_by: None,
            tx_signature: None,
            error: None,
            created_at: Utc::now(),
            updated_at: Utc::now(),
        }
    }
}
