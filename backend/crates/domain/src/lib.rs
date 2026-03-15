use async_trait::async_trait;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use thiserror::Error;
use uuid::Uuid;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum LifecycleRequestType {
    Mint,
    Burn,
}

impl LifecycleRequestType {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Mint => "mint",
            Self::Burn => "burn",
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum LifecycleStatus {
    Requested,
    Approved,
    Signing,
    Submitted,
    Finalized,
    Failed,
    Cancelled,
}

impl LifecycleStatus {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Requested => "requested",
            Self::Approved => "approved",
            Self::Signing => "signing",
            Self::Submitted => "submitted",
            Self::Finalized => "finalized",
            Self::Failed => "failed",
            Self::Cancelled => "cancelled",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct LifecycleRequest {
    pub id: String,
    #[serde(rename = "type", alias = "type_")]
    pub type_: LifecycleRequestType,
    pub status: LifecycleStatus,
    pub mint: String,
    pub recipient: String,
    pub token_account: String,
    pub amount: i128,
    pub minter: Option<String>,
    pub reason: Option<String>,
    pub idempotency_key: Option<String>,
    pub requested_by: String,
    pub approved_by: Option<String>,
    pub tx_signature: Option<String>,
    pub error: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct CreateLifecycleRequest {
    pub type_: LifecycleRequestType,
    pub mint: String,
    pub recipient: String,
    pub token_account: String,
    pub amount: i128,
    pub minter: Option<String>,
    pub reason: Option<String>,
    pub idempotency_key: Option<String>,
    pub requested_by: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct InsertEvent {
    pub event_type: String,
    pub program_id: Option<String>,
    pub mint: Option<String>,
    pub tx_signature: String,
    pub slot: i64,
    pub block_time: Option<DateTime<Utc>>,
    pub instruction_index: i32,
    pub data: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct EventRecord {
    pub id: i64,
    pub event_type: String,
    pub program_id: Option<String>,
    pub mint: Option<String>,
    pub tx_signature: String,
    pub slot: i64,
    pub block_time: Option<DateTime<Utc>>,
    pub instruction_index: i32,
    pub data: Value,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
pub struct EventFilters {
    pub event_type: Option<String>,
    pub program_id: Option<String>,
    pub tx_signature: Option<String>,
    pub slot_min: Option<i64>,
    pub slot_max: Option<i64>,
    pub from: Option<DateTime<Utc>>,
    pub to: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum EventSort {
    Slot,
    BlockTime,
    CreatedAt,
}

impl Default for EventSort {
    fn default() -> Self {
        Self::Slot
    }
}

impl EventSort {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Slot => "slot",
            Self::BlockTime => "block_time",
            Self::CreatedAt => "created_at",
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SortOrder {
    Asc,
    Desc,
}

impl Default for SortOrder {
    fn default() -> Self {
        Self::Desc
    }
}

impl SortOrder {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Asc => "asc",
            Self::Desc => "desc",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct WebhookSubscription {
    pub id: Uuid,
    pub name: Option<String>,
    pub url: String,
    pub events: Vec<String>,
    pub secret: Option<String>,
    pub active: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct CreateWebhookSubscription {
    pub name: Option<String>,
    pub url: String,
    pub events: Vec<String>,
    pub secret: Option<String>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum WebhookDeliveryStatus {
    Pending,
    Delivering,
    Delivered,
    Failed,
    DeadLetter,
}

impl WebhookDeliveryStatus {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Pending => "pending",
            Self::Delivering => "delivering",
            Self::Delivered => "delivered",
            Self::Failed => "failed",
            Self::DeadLetter => "dead_letter",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct WebhookDelivery {
    pub id: i64,
    pub subscription_id: Uuid,
    pub event_id: i64,
    pub status: WebhookDeliveryStatus,
    pub attempts: i32,
    pub max_attempts: i32,
    pub last_attempt_at: Option<DateTime<Utc>>,
    pub next_retry_at: Option<DateTime<Utc>>,
    pub response_code: Option<i32>,
    pub error: Option<String>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct LifecycleExecutionResult {
    pub request_id: String,
    pub tx_signature: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct HealthReport {
    pub component: String,
    pub layer: String,
    pub status: String,
}

#[derive(Debug, Error)]
pub enum WorkerError {
    #[error("lifecycle request {0} cannot transition from {1} to {2}")]
    InvalidTransition(String, &'static str, &'static str),
    #[error("dependency error: {0}")]
    Dependency(String),
}

#[async_trait]
pub trait SignerBackend: Send + Sync {
    fn name(&self) -> &'static str;
    async fn execute(&self, request: &LifecycleRequest) -> Result<LifecycleExecutionResult, WorkerError>;
}

#[async_trait]
pub trait WebhookDispatcher: Send + Sync {
    async fn deliver(
        &self,
        subscription: &WebhookSubscription,
        delivery: &WebhookDelivery,
        event: &EventRecord,
    ) -> Result<Option<i32>, WorkerError>;
}
