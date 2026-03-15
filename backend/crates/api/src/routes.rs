//! API routes grouped by responsibility:
//!
//! - **Events**: Indexed events from chain (query by mint, filters, pagination).
//! - **Lifecycle**: Request → approve → execute (mint/burn via /v1/mint-requests, /v1/burn-requests, /v1/operations/...).
//! - **Webhooks**: Configurable event notifications with retry logic.

use anyhow::Result;
use axum::{
    extract::{Path, Query, State},
    http::{HeaderValue, Method, StatusCode},
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use chrono::{DateTime, Utc};
use serde::Deserialize;
use serde_json::json;
use sss_db::Store;
use sss_domain::{
    CreateLifecycleRequest, CreateWebhookSubscription, EventFilters, EventSort, LifecycleRequestType,
    LifecycleStatus, SortOrder,
};
use tokio::net::TcpListener;
use tower::ServiceBuilder;
use tower_http::cors::{AllowOrigin, CorsLayer};
use tracing::info;
use uuid::Uuid;

use crate::{
    config::{ApiConfig, AppState},
    dto::{
        ApproveLifecycleBody, CreateLifecycleBody, CreateWebhookSubscriptionBody,
        LifecycleDetailsResponse, LifecycleListResponse,
    },
    error::ApiError,
    workers::spawn_default_workers,
};

#[derive(Debug, Deserialize)]
pub struct EventsQuery {
    pub event_type: Option<String>,
    pub program_id: Option<String>,
    pub tx_signature: Option<String>,
    pub slot_min: Option<i64>,
    pub slot_max: Option<i64>,
    pub from: Option<DateTime<Utc>>,
    pub to: Option<DateTime<Utc>>,
    #[serde(default)]
    pub sort: EventSortParam,
    #[serde(default)]
    pub order: OrderParam,
    #[serde(default = "default_limit")]
    pub limit: i64,
    #[serde(default)]
    pub offset: i64,
}

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum EventSortParam {
    #[default]
    Slot,
    BlockTime,
    CreatedAt,
}

impl From<EventSortParam> for EventSort {
    fn from(p: EventSortParam) -> Self {
        match p {
            EventSortParam::Slot => EventSort::Slot,
            EventSortParam::BlockTime => EventSort::BlockTime,
            EventSortParam::CreatedAt => EventSort::CreatedAt,
        }
    }
}

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum OrderParam {
    #[default]
    Desc,
    Asc,
}

impl From<OrderParam> for SortOrder {
    fn from(p: OrderParam) -> Self {
        match p {
            OrderParam::Asc => SortOrder::Asc,
            OrderParam::Desc => SortOrder::Desc,
        }
    }
}

fn default_limit() -> i64 {
    100
}

fn cors_layer(origins: &[String]) -> CorsLayer {
    let allowed = origins
        .iter()
        .filter_map(|origin| HeaderValue::from_str(origin).ok())
        .collect::<Vec<_>>();

    CorsLayer::new()
        .allow_methods([Method::GET, Method::POST, Method::OPTIONS])
        .allow_headers(tower_http::cors::Any)
        .allow_origin(AllowOrigin::list(allowed))
}

pub fn build_router(state: AppState, config: &ApiConfig) -> Router {
    Router::new()
        .route("/healthz", get(healthz))
        .route("/readyz", get(readyz))
        .route("/v1/mints/{mint}/events", get(list_mint_events))
        .route("/v1/mint-requests", post(create_mint_request))
        .route("/v1/burn-requests", post(create_burn_request))
        .route("/v1/operations", get(list_operations))
        .route("/v1/operations/{id}", get(get_operation))
        .route("/v1/operations/{id}/approve", post(approve_operation))
        .route("/v1/operations/{id}/execute", post(execute_operation))
        .route("/v1/webhooks/subscriptions", post(create_webhook_subscription))
        .layer(ServiceBuilder::new().layer(cors_layer(&config.cors_origins)))
        .with_state(state)
}

#[derive(Debug, Deserialize)]
pub struct OperationsQuery {
    pub mint: Option<String>,
    pub status: Option<LifecycleStatus>,
    #[serde(rename = "type")]
    pub type_: Option<LifecycleRequestType>,
    #[serde(default = "default_limit")]
    pub limit: i64,
    #[serde(default)]
    pub offset: i64,
}

pub async fn run(config: ApiConfig) -> Result<()> {
    let store = Store::connect(&config.database_url).await?;
    store.migrate().await?;
    if config.run_workers {
        let store_for_workers = store.clone();
        tokio::spawn(async move {
            spawn_default_workers(store_for_workers).await;
        });
        info!("workers spawned (SSS_RUN_WORKERS=1)");
    }
    let app = build_router(AppState { store }, &config);
    let listener = TcpListener::bind(config.bind_address).await?;
    info!(address = %config.bind_address, "starting sss-api");
    axum::serve(listener, app).await?;
    Ok(())
}

async fn healthz() -> impl IntoResponse {
    Json(json!({ "status": "ok" }))
}

async fn readyz(State(state): State<AppState>) -> Result<impl IntoResponse, ApiError> {
    state.store.readiness_check().await.map_err(ApiError::from)?;
    Ok(Json(json!({ "status": "ready" })))
}

async fn list_mint_events(
    Path(mint): Path<String>,
    Query(query): Query<EventsQuery>,
    State(state): State<AppState>,
) -> Result<impl IntoResponse, ApiError> {
    let filters = EventFilters {
        event_type: query.event_type,
        program_id: query.program_id,
        tx_signature: query.tx_signature,
        slot_min: query.slot_min,
        slot_max: query.slot_max,
        from: query.from,
        to: query.to,
    };
    let limit = query.limit.clamp(1, 500);
    let (events, total) = state
        .store
        .list_events(
            Some(&mint),
            &filters,
            query.sort.into(),
            query.order.into(),
            limit,
            query.offset,
        )
        .await
        .map_err(ApiError::from)?;
    Ok(Json(serde_json::json!({ "events": events, "total": total })))
}

async fn create_mint_request(
    State(state): State<AppState>,
    Json(body): Json<CreateLifecycleBody>,
) -> Result<impl IntoResponse, ApiError> {
    create_lifecycle_request(State(state), body, LifecycleRequestType::Mint).await
}

async fn create_burn_request(
    State(state): State<AppState>,
    Json(body): Json<CreateLifecycleBody>,
) -> Result<impl IntoResponse, ApiError> {
    create_lifecycle_request(State(state), body, LifecycleRequestType::Burn).await
}

async fn create_lifecycle_request(
    State(state): State<AppState>,
    body: CreateLifecycleBody,
    type_: LifecycleRequestType,
) -> Result<impl IntoResponse, ApiError> {
    let id = Uuid::new_v4().to_string();
    let request = CreateLifecycleRequest {
        type_,
        mint: body.mint,
        recipient: body.recipient,
        token_account: body.token_account,
        amount: body.amount,
        minter: body.minter,
        reason: body.reason,
        idempotency_key: body.idempotency_key,
        requested_by: body.requested_by,
    };
    let created = state
        .store
        .create_lifecycle_request(&id, &request)
        .await
        .map_err(ApiError::from)?;
    Ok((StatusCode::CREATED, Json(created)))
}

async fn get_operation(
    Path(id): Path<String>,
    State(state): State<AppState>,
) -> Result<impl IntoResponse, ApiError> {
    let Some(request) = state.store.get_lifecycle_request(&id).await.map_err(ApiError::from)? else {
        return Err(ApiError::not_found("operation not found"));
    };
    Ok(Json(LifecycleDetailsResponse { request }))
}

async fn list_operations(
    Query(query): Query<OperationsQuery>,
    State(state): State<AppState>,
) -> Result<impl IntoResponse, ApiError> {
    let limit = query.limit.clamp(1, 500);
    let (requests, total) = state
        .store
        .list_lifecycle_requests(
            query.mint.as_deref(),
            query.status,
            query.type_,
            limit,
            query.offset,
        )
        .await
        .map_err(ApiError::from)?;
    Ok(Json(LifecycleListResponse { requests, total }))
}

async fn approve_operation(
    Path(id): Path<String>,
    State(state): State<AppState>,
    Json(body): Json<ApproveLifecycleBody>,
) -> Result<impl IntoResponse, ApiError> {
    let Some(request) = state
        .store
        .approve_lifecycle_request(&id, &body.approved_by)
        .await
        .map_err(ApiError::from)?
    else {
        return Err(ApiError::unprocessable(
            "operation must be requested before approval",
        ));
    };
    Ok(Json(request))
}

async fn execute_operation(
    Path(id): Path<String>,
    State(state): State<AppState>,
) -> Result<impl IntoResponse, ApiError> {
    let Some(request) = state.store.get_lifecycle_request(&id).await.map_err(ApiError::from)? else {
        return Err(ApiError::not_found("operation not found"));
    };
    if request.status != LifecycleStatus::Approved && request.status != LifecycleStatus::Submitted {
        return Err(ApiError::unprocessable(
            "operation must be approved before execution",
        ));
    }
    Ok((StatusCode::ACCEPTED, Json(request)))
}

async fn create_webhook_subscription(
    State(state): State<AppState>,
    Json(body): Json<CreateWebhookSubscriptionBody>,
) -> Result<impl IntoResponse, ApiError> {
    let sub = CreateWebhookSubscription {
        name: body.name,
        url: body.url,
        events: body.events,
        secret: body.secret,
    };
    let subscription = state
        .store
        .create_webhook_subscription(&sub)
        .await
        .map_err(ApiError::from)?;
    Ok((StatusCode::CREATED, Json(subscription)))
}

#[cfg(test)]
mod tests {
    use axum::{body::Body, http::Request};
    use tower::util::ServiceExt;

    use super::*;

    #[tokio::test]
    async fn healthz_route_returns_ok() {
        let app = Router::new().route("/healthz", get(healthz));
        let response = app
            .oneshot(Request::builder().uri("/healthz").body(Body::empty()).unwrap())
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
    }
}
