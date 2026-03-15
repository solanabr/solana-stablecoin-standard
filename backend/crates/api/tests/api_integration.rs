use std::{
    net::TcpListener,
    process::{Child, Command, Stdio},
    sync::atomic::{AtomicU64, Ordering},
    sync::Arc,
    thread,
    time::Duration,
};

use anyhow::{Context, Result};
use async_trait::async_trait;
use axum::{
    body::Body,
    http::{Request, StatusCode},
};
use chrono::Utc;
use serde_json::json;
use sss_api::{build_router, AppState, OperationExecutorWorker, WebhookRetryWorker};
use sss_db::Store;
use sss_domain::{
    CreateLifecycleRequest, CreateWebhookSubscription, EventRecord, EventSort, InsertEvent,
    LifecycleExecutionResult, LifecycleRequest, LifecycleRequestType, LifecycleStatus,
    SignerBackend, SortOrder, WebhookDelivery, WebhookDeliveryStatus, WebhookDispatcher,
    WebhookSubscription, WorkerError,
};
use tempfile::TempDir;
use tower::util::ServiceExt;
use uuid::Uuid;

struct PostgresHarness {
    _dir: Option<TempDir>,
    process: Option<Child>,
    database_url: String,
    admin_url: Option<String>,
    db_name: Option<String>,
}

impl PostgresHarness {
    fn database_url(&self) -> String {
        self.database_url.clone()
    }
}

impl Drop for PostgresHarness {
    fn drop(&mut self) {
        if let Some(process) = &mut self.process {
            let _ = process.kill();
            let _ = process.wait();
        }
        if let (Some(admin_url), Some(db_name)) = (&self.admin_url, &self.db_name) {
            let _ = Command::new("psql")
                .arg(admin_url)
                .arg("-c")
                .arg(format!("drop database if exists {db_name}"))
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .status();
        }
    }
}

static DB_COUNTER: AtomicU64 = AtomicU64::new(0);

fn find_free_port() -> Result<u16> {
    let listener = TcpListener::bind("127.0.0.1:0")?;
    Ok(listener.local_addr()?.port())
}

fn database_url_for(admin_url: &str, db_name: &str) -> Result<String> {
    let (prefix, _) = admin_url
        .rsplit_once('/')
        .context("TEST_DATABASE_ADMIN_URL must include a database name")?;
    Ok(format!("{prefix}/{db_name}"))
}

fn next_db_name(prefix: &str) -> String {
    let suffix = DB_COUNTER.fetch_add(1, Ordering::Relaxed);
    format!("{prefix}_{}_{}", std::process::id(), suffix)
}

fn start_postgres() -> Result<PostgresHarness> {
    let db_name = next_db_name("sss_test");
    if let Ok(admin_url) = std::env::var("TEST_DATABASE_ADMIN_URL") {
        let createdb = Command::new("psql")
            .arg(&admin_url)
            .arg("-c")
            .arg(format!("create database {db_name}"))
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .context("failed to create test database")?;
        anyhow::ensure!(createdb.success(), "create database failed");

        return Ok(PostgresHarness {
            _dir: None,
            process: None,
            database_url: database_url_for(&admin_url, &db_name)?,
            admin_url: Some(admin_url),
            db_name: Some(db_name),
        });
    }

    let dir = TempDir::new()?;
    let port = find_free_port()?;

    let initdb = Command::new("initdb")
        .arg("-A")
        .arg("trust")
        .arg("-U")
        .arg("postgres")
        .arg("--set")
        .arg("dynamic_shared_memory_type=none")
        .arg("-D")
        .arg(dir.path())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .context("failed to run initdb")?;
    anyhow::ensure!(initdb.success(), "initdb failed");

    let process = Command::new("postgres")
        .arg("-D")
        .arg(dir.path())
        .arg("-p")
        .arg(port.to_string())
        .arg("-c")
        .arg("listen_addresses=127.0.0.1")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .context("failed to start postgres")?;

    for _ in 0..50 {
        let status = Command::new("psql")
            .arg("-h")
            .arg("127.0.0.1")
            .arg("-p")
            .arg(port.to_string())
            .arg("-U")
            .arg("postgres")
            .arg("-d")
            .arg("postgres")
            .arg("-c")
            .arg("select 1")
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
        if let Ok(status) = status {
            if status.success() {
                break;
            }
        }
        thread::sleep(Duration::from_millis(100));
    }

    let createdb = Command::new("psql")
        .arg("-h")
        .arg("127.0.0.1")
        .arg("-p")
        .arg(port.to_string())
        .arg("-U")
        .arg("postgres")
        .arg("-d")
        .arg("postgres")
        .arg("-c")
        .arg(format!("create database {db_name}"))
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .context("failed to create test database")?;
    anyhow::ensure!(createdb.success(), "create database failed");

    Ok(PostgresHarness {
        _dir: Some(dir),
        process: Some(process),
        database_url: format!("postgres://postgres@127.0.0.1:{port}/{db_name}"),
        admin_url: None,
        db_name: None,
    })
}

async fn seeded_store() -> Result<(PostgresHarness, Store)> {
    let harness = start_postgres()?;
    let store = Store::connect(&harness.database_url()).await?;
    store.migrate().await?;
    store
        .insert_event(&InsertEvent {
            event_type: "TokensMinted".to_string(),
            program_id: Some("program".to_string()),
            mint: Some("mint-1".to_string()),
            tx_signature: "sig-1".to_string(),
            slot: 10,
            block_time: Some(Utc::now()),
            instruction_index: 0,
            data: json!({"mint":"mint-1","authority":"auth-1","amount":"100"}),
        })
        .await?;
    Ok((harness, store))
}

struct MockSigner;

#[async_trait]
impl SignerBackend for MockSigner {
    fn name(&self) -> &'static str {
        "mock"
    }

    async fn execute(&self, request: &LifecycleRequest) -> Result<LifecycleExecutionResult, WorkerError> {
        Ok(LifecycleExecutionResult {
            request_id: request.id.clone(),
            tx_signature: format!("sig-{}", request.id),
        })
    }
}

struct MockDispatcher {
    fail: bool,
}

#[async_trait]
impl WebhookDispatcher for MockDispatcher {
    async fn deliver(
        &self,
        _subscription: &WebhookSubscription,
        _delivery: &WebhookDelivery,
        _event: &EventRecord,
    ) -> Result<Option<i32>, WorkerError> {
        if self.fail {
            Err(WorkerError::Dependency("dispatch failed".to_string()))
        } else {
            Ok(Some(200))
        }
    }
}

#[tokio::test]
async fn api_routes_cover_core_paths() -> Result<()> {
    let (_harness, store) = seeded_store().await?;

    let app = build_router(AppState { store: store.clone() });

    let response = app
        .clone()
        .oneshot(Request::builder().uri("/readyz").body(Body::empty()).unwrap())
        .await?;
    assert_eq!(response.status(), StatusCode::OK);

    let response = app
        .clone()
        .oneshot(Request::builder().uri("/v1/mints/mint-1/events").body(Body::empty()).unwrap())
        .await?;
    assert_eq!(response.status(), StatusCode::OK);

    for uri in ["/v1/mint-requests", "/v1/burn-requests"] {
        let response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(uri)
                    .header("content-type", "application/json")
                    .body(Body::from(
                        serde_json::to_vec(&json!({
                            "mint": "mint-1",
                            "recipient": "wallet-1",
                            "token_account": "ata-wallet-1-mint-1",
                            "amount": 100,
                            "minter": null,
                            "reason": "ops",
                            "idempotency_key": format!("{}-1", uri),
                            "requested_by": "tester"
                        }))?,
                    ))
                    .unwrap(),
            )
            .await?;
        assert_eq!(response.status(), StatusCode::CREATED, "{uri}");
    }

    let request_id = Uuid::new_v4().to_string();
    store
        .create_lifecycle_request(
            &request_id,
            &CreateLifecycleRequest {
                type_: LifecycleRequestType::Mint,
                mint: "mint-1".to_string(),
                recipient: "wallet-3".to_string(),
                token_account: "ata-3".to_string(),
                amount: 500,
                minter: None,
                reason: Some("seed".to_string()),
                idempotency_key: Some("seed-op".to_string()),
                requested_by: "tester".to_string(),
            },
        )
        .await?;

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(format!("/v1/operations/{}/approve", request_id))
                .header("content-type", "application/json")
                .body(Body::from(serde_json::to_vec(&json!({"approved_by":"ops"}))?))
                .unwrap(),
        )
        .await?;
    assert_eq!(response.status(), StatusCode::OK);

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/v1/operations?status=approved&type=mint&limit=10")
                .body(Body::empty())
                .unwrap(),
        )
        .await?;
    assert_eq!(response.status(), StatusCode::OK);

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(format!("/v1/operations/{}/execute", request_id))
                .body(Body::empty())
                .unwrap(),
        )
        .await?;
    assert_eq!(response.status(), StatusCode::ACCEPTED);

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri(format!("/v1/operations/{}", request_id))
                .body(Body::empty())
                .unwrap(),
        )
        .await?;
    assert_eq!(response.status(), StatusCode::OK);

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/v1/webhooks/subscriptions")
                .header("content-type", "application/json")
                .body(Body::from(serde_json::to_vec(&json!({
                    "name": "ops",
                    "url": "https://example.com/hook",
                    "events": ["TokensMinted"],
                    "secret": "secret"
                }))?))
                .unwrap(),
        )
        .await?;
    assert_eq!(response.status(), StatusCode::CREATED);

    Ok(())
}

#[tokio::test]
async fn operation_worker_submits_approved_requests() -> Result<()> {
    let (_harness, store) = seeded_store().await?;
    let request_id = Uuid::new_v4().to_string();
    store
        .create_lifecycle_request(
            &request_id,
            &CreateLifecycleRequest {
                type_: LifecycleRequestType::Mint,
                mint: "mint-1".to_string(),
                recipient: "wallet-4".to_string(),
                token_account: "ata-4".to_string(),
                amount: 100,
                minter: None,
                reason: Some("worker".to_string()),
                idempotency_key: Some("worker-op".to_string()),
                requested_by: "tester".to_string(),
            },
        )
        .await?;
    store
        .approve_lifecycle_request(&request_id, "ops")
        .await?;

    let worker = OperationExecutorWorker {
        store: store.clone(),
        signer: Arc::new(MockSigner),
        poll_limit: 10,
    };
    let processed = worker.run_once().await?;
    assert_eq!(processed, 1);

    let updated = store.get_lifecycle_request(&request_id).await?.unwrap();
    assert_eq!(updated.status, LifecycleStatus::Finalized);
    assert!(updated.tx_signature.is_some());
    Ok(())
}

#[tokio::test]
async fn webhook_worker_updates_state() -> Result<()> {
    let (_harness, store) = seeded_store().await?;
    let subscription = store
        .create_webhook_subscription(&CreateWebhookSubscription {
            name: Some("ops".to_string()),
            url: "https://example.com".to_string(),
            events: vec!["TokensMinted".to_string()],
            secret: Some("secret".to_string()),
        })
        .await?;

    let (events, _) = store
        .list_events(
            Some("mint-1"),
            &Default::default(),
            EventSort::Slot,
            SortOrder::Asc,
            10,
            0,
        )
        .await?;
    let event_id = events.first().unwrap().id;
    store.enqueue_webhook_delivery(subscription.id, event_id).await?;

    let webhook_worker = WebhookRetryWorker {
        store: store.clone(),
        dispatcher: Arc::new(MockDispatcher { fail: false }),
        poll_limit: 10,
        max_attempts: 3,
    };

    assert_eq!(webhook_worker.run_once().await?, 1);

    let deliveries = store.list_due_webhook_deliveries(Utc::now(), 10).await?;
    assert!(deliveries.is_empty());
    Ok(())
}

/// Full mint flow on DevNet: request → approve → execute → worker submits tx.
/// Requires: SSS_DEVNET_E2E=1, SOLANA_RPC_URL, SSS_STABLECOIN_PROGRAM_ID,
/// SSS_AUTHORITY_SECRET_KEY (or SSS_AUTHORITY_KEYPAIR), SSS_DEVNET_MINT,
/// SSS_DEVNET_TARGET_ATA or SSS_DEVNET_TARGET_WALLET.
#[tokio::test(flavor = "multi_thread")]
#[ignore]
async fn devnet_e2e_mint_execution() -> Result<()> {
    if std::env::var("SSS_DEVNET_E2E").ok().as_deref() != Some("1") {
        return Ok(());
    }
    let (_pg_harness, database_url) = match std::env::var("DATABASE_URL") {
        Ok(url) => (None, url),
        Err(_) => {
            let harness = start_postgres()?;
            let url = harness.database_url();
            (Some(harness), url)
        }
    };
    let _ = std::env::var("SOLANA_RPC_URL").context("SOLANA_RPC_URL required")?;
    let mint_pubkey = std::env::var("SSS_DEVNET_MINT").context("SSS_DEVNET_MINT required")?;
    let target_wallet = std::env::var("SSS_DEVNET_TARGET_WALLET")
        .ok()
        .context("set SSS_DEVNET_TARGET_WALLET")?;
    let target_ata = std::env::var("SSS_DEVNET_TARGET_ATA")
        .ok()
        .context("set SSS_DEVNET_TARGET_ATA")?;
    let signer = sss_api::AuthorityKeypairSigner::from_env()
        .map_err(|e| anyhow::anyhow!("AuthorityKeypairSigner::from_env: {}", e))?;

    let store = Store::connect(&database_url).await?;
    store.migrate().await?;

    let request_id = Uuid::new_v4().to_string();
    store
        .create_lifecycle_request(
            &request_id,
            &CreateLifecycleRequest {
                type_: LifecycleRequestType::Mint,
                mint: mint_pubkey.clone(),
                recipient: target_wallet,
                token_account: target_ata,
                amount: 1_000_000,
                minter: None,
                reason: Some("devnet-e2e".to_string()),
                idempotency_key: Some(format!("e2e-{}", std::process::id())),
                requested_by: "e2e-test".to_string(),
            },
        )
        .await?;
    store
        .approve_lifecycle_request(&request_id, "e2e")
        .await?;

    let worker = OperationExecutorWorker {
        store: store.clone(),
        signer: Arc::new(signer),
        poll_limit: 10,
    };
    for _ in 0..20 {
        let n = worker.run_once().await?;
        if n > 0 {
            break;
        }
        tokio::time::sleep(Duration::from_secs(2)).await;
    }

    let updated = store
        .get_lifecycle_request(&request_id)
        .await?
        .context("request gone")?;
    assert_eq!(
        updated.status,
        LifecycleStatus::Finalized,
        "expected Finalized, got {:?}; tx_sig = {:?}",
        updated.status,
        updated.tx_signature
    );
    assert!(
        updated.tx_signature.is_some(),
        "request should have tx_signature"
    );
    Ok(())
}
