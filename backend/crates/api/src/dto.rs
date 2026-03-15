use serde::{Deserialize, Serialize};
use sss_domain::{EventRecord, LifecycleRequest};

#[derive(Debug, Deserialize)]
pub struct CreateLifecycleBody {
    pub mint: String,
    pub recipient: String,
    pub token_account: String,
    pub amount: i128,
    pub minter: Option<String>,
    pub reason: Option<String>,
    pub idempotency_key: Option<String>,
    pub requested_by: String,
}

#[derive(Debug, Deserialize)]
pub struct ApproveLifecycleBody {
    pub approved_by: String,
}

#[derive(Debug, Serialize)]
pub struct LifecycleDetailsResponse {
    pub request: LifecycleRequest,
}

#[derive(Debug, Serialize)]
pub struct LifecycleListResponse {
    pub requests: Vec<LifecycleRequest>,
    pub total: i64,
}

#[derive(Debug, Serialize)]
pub struct EventsResponse {
    pub events: Vec<EventRecord>,
    pub total: i64,
}

#[derive(Debug, Deserialize)]
pub struct CreateWebhookSubscriptionBody {
    pub name: Option<String>,
    pub url: String,
    pub events: Vec<String>,
    pub secret: Option<String>,
}
