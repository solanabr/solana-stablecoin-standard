//! Integration tests for the SSS token CLI.
//!
//! Assume a Surfpool (or solana-test-validator) RPC is running. Default RPC: http://127.0.0.1:8899.
//! Override with env `RPC_URL`. Keypairs are created in a temp dir and airdropped in Rust.

use assert_cmd::Command;
use predicates::str::contains;
use solana_client::rpc_client::RpcClient;
use solana_sdk::{
    commitment_config::CommitmentConfig,
    signature::{Keypair, Signer},
    signer::EncodableKey,
};
use std::path::PathBuf;
use tempfile::TempDir;

/// Default Surfpool/solana-test-validator RPC (see https://docs.surfpool.run/toolchain/cli)
const DEFAULT_RPC: &str = "http://127.0.0.1:8899";

fn rpc_url() -> String {
    std::env::var("RPC_URL").unwrap_or_else(|_| DEFAULT_RPC.into())
}

fn rpc_client() -> RpcClient {
    RpcClient::new_with_commitment(rpc_url(), CommitmentConfig::confirmed())
}

/// Create a temp dir and write a new keypair to `keypair_path`. Returns (temp_dir, keypair, path).
fn write_keypair_to_temp() -> (TempDir, Keypair, PathBuf) {
    let dir = tempfile::tempdir().expect("temp dir");
    let kp = Keypair::new();
    let path = dir.path().join("keypair.json");
    kp.write_to_file(&path).expect("write keypair");
    (dir, kp, path)
}

/// Airdrop SOL to `pubkey` so the key can pay for transactions.
fn airdrop(pubkey: &solana_sdk::pubkey::Pubkey, lamports: u64) {
    let rpc = rpc_client();
    let sig = rpc.request_airdrop(pubkey, lamports).expect("airdrop");
    for _ in 0..30 {
        if rpc
            .get_signature_status(&sig)
            .ok()
            .and_then(|s| s)
            .is_some()
        {
            return;
        }
        std::thread::sleep(std::time::Duration::from_millis(200));
    }
    panic!("airdrop tx not confirmed");
}

/// Run sss-token with the given args; RPC, keypair, and mint are injected from env/paths.
fn sss_token(rpc_url: &str, keypair_path: &std::path::Path, mint: &str, args: &[&str]) -> Command {
    let mut a: Vec<&str> = vec![
        "--rpc-url",
        rpc_url,
        "--keypair",
        keypair_path.to_str().unwrap(),
        "--mint",
        mint,
    ];
    a.extend(args);
    let mut c = Command::cargo_bin("sss-token").expect("binary");
    c.args(a);
    c
}

#[test]
fn cli_init_sss1_status_supply_mint_burn() {
    let rpc = rpc_url();
    let (_admin_dir, admin_kp, admin_path) = write_keypair_to_temp();
    let (_mint_dir, mint_kp, mint_path) = write_keypair_to_temp();
    let mint_pubkey = mint_kp.pubkey().to_string();

    airdrop(&admin_kp.pubkey(), 2_000_000_000);

    // Init SSS-1
    sss_token(
        &rpc,
        &admin_path,
        &mint_pubkey,
        &[
            "init",
            "--preset",
            "sss-1",
            "--mint-keypair",
            mint_path.to_str().unwrap(),
        ],
    )
    .assert()
    .success()
    .stdout(contains("Initialized mint:"))
    .stdout(contains("Standard  : SSS-1"));

    // Status
    sss_token(&rpc, &admin_path, &mint_pubkey, &["status"])
        .assert()
        .success()
        .stdout(contains("Standard:              SSS-1"))
        .stdout(contains("Symbol:                SSS1"));

    // Supply (initial 0)
    sss_token(&rpc, &admin_path, &mint_pubkey, &["supply"])
        .assert()
        .success()
        .stdout(contains("Supply:  0 (base units)"));

    // Mint to self (admin is minter)
    let amount = 100_000_000u64; // 100 with 6 decimals
    sss_token(
        &rpc,
        &admin_path,
        &mint_pubkey,
        &["mint", &admin_kp.pubkey().to_string(), &amount.to_string()],
    )
    .assert()
    .success()
    .stdout(contains("Minted "))
    .stdout(contains(&amount.to_string()));

    // Supply after mint
    sss_token(&rpc, &admin_path, &mint_pubkey, &["supply"])
        .assert()
        .success()
        .stdout(contains(&format!("Supply:  {} (base units)", amount)));

    // Grant burner role to admin (master can assign roles)
    sss_token(
        &rpc,
        &admin_path,
        &mint_pubkey,
        &[
            "update-roles",
            "--role",
            "burner",
            "--new-key",
            &admin_kp.pubkey().to_string(),
        ],
    )
    .assert()
    .success();

    // Burn
    let burn_amount = 50_000_000u64;
    sss_token(
        &rpc,
        &admin_path,
        &mint_pubkey,
        &["burn", &burn_amount.to_string()],
    )
    .assert()
    .success()
    .stdout(contains("Burned "));

    // Supply after burn
    sss_token(&rpc, &admin_path, &mint_pubkey, &["supply"])
        .assert()
        .success()
        .stdout(contains(&format!(
            "Supply:  {} (base units)",
            amount - burn_amount
        )));
}

#[test]
fn cli_init_sss2_pause_unpause_status() {
    let rpc = rpc_url();
    let (_admin_dir, admin_kp, admin_path) = write_keypair_to_temp();
    let (_mint_dir, mint_kp, mint_path) = write_keypair_to_temp();
    let mint_pubkey = mint_kp.pubkey().to_string();

    airdrop(&admin_kp.pubkey(), 2_000_000_000);

    // Init SSS-2 (pausable)
    sss_token(
        &rpc,
        &admin_path,
        &mint_pubkey,
        &[
            "init",
            "--preset",
            "sss-2",
            "--mint-keypair",
            mint_path.to_str().unwrap(),
        ],
    )
    .assert()
    .success()
    .stdout(contains("Standard  : SSS-2"));

    // Status shows SSS-2
    sss_token(&rpc, &admin_path, &mint_pubkey, &["status"])
        .assert()
        .success()
        .stdout(contains("Standard:              SSS-2"));

    // Grant pauser role to admin (master can assign roles; pause requires pauser_role PDA)
    sss_token(
        &rpc,
        &admin_path,
        &mint_pubkey,
        &[
            "update-roles",
            "--role",
            "pauser",
            "--new-key",
            &admin_kp.pubkey().to_string(),
        ],
    )
    .assert()
    .success();

    // Pause (SSS-2 only)
    sss_token(&rpc, &admin_path, &mint_pubkey, &["pause"])
        .assert()
        .success();

    // Unpause
    sss_token(&rpc, &admin_path, &mint_pubkey, &["unpause"])
        .assert()
        .success();
}

#[test]
fn cli_init_sss2_minters_list_and_blacklist() {
    let rpc = rpc_url();
    let (_admin_dir, admin_kp, admin_path) = write_keypair_to_temp();
    let (_mint_dir, mint_kp, mint_path) = write_keypair_to_temp();
    let (_, other_kp, _) = write_keypair_to_temp();
    let mint_pubkey = mint_kp.pubkey().to_string();

    airdrop(&admin_kp.pubkey(), 2_000_000_000);
    airdrop(&other_kp.pubkey(), 1_000_000_000);

    // Init SSS-2
    sss_token(
        &rpc,
        &admin_path,
        &mint_pubkey,
        &[
            "init",
            "--preset",
            "sss-2",
            "--mint-keypair",
            mint_path.to_str().unwrap(),
        ],
    )
    .assert()
    .success();

    // Add minter first so list has at least one entry (initial minter may not be found by list filter)
    sss_token(
        &rpc,
        &admin_path,
        &mint_pubkey,
        &[
            "minters",
            "add",
            &other_kp.pubkey().to_string(),
            "1000000000",
        ],
    )
    .assert()
    .success();

    // Minters list
    sss_token(&rpc, &admin_path, &mint_pubkey, &["minters", "list"])
        .assert()
        .success()
        .stdout(contains("Minters for mint"));

    // Minters remove
    sss_token(
        &rpc,
        &admin_path,
        &mint_pubkey,
        &["minters", "remove", &other_kp.pubkey().to_string()],
    )
    .assert()
    .success();

    // Blacklist add (SSS-2)
    let victim = Keypair::new();
    airdrop(&victim.pubkey(), 500_000_000);
    sss_token(
        &rpc,
        &admin_path,
        &mint_pubkey,
        &[
            "blacklist",
            "add",
            &victim.pubkey().to_string(),
            "--reason",
            "test reason",
        ],
    )
    .assert()
    .success();

    // Blacklist remove
    sss_token(
        &rpc,
        &admin_path,
        &mint_pubkey,
        &["blacklist", "remove", &victim.pubkey().to_string()],
    )
    .assert()
    .success();
}

#[test]
fn cli_holders_and_audit_log() {
    let rpc = rpc_url();
    let (_admin_dir, admin_kp, admin_path) = write_keypair_to_temp();
    let (_mint_dir, mint_kp, mint_path) = write_keypair_to_temp();
    let mint_pubkey = mint_kp.pubkey().to_string();

    airdrop(&admin_kp.pubkey(), 2_000_000_000);

    sss_token(
        &rpc,
        &admin_path,
        &mint_pubkey,
        &[
            "init",
            "--preset",
            "sss-1",
            "--mint-keypair",
            mint_path.to_str().unwrap(),
        ],
    )
    .assert()
    .success();

    sss_token(
        &rpc,
        &admin_path,
        &mint_pubkey,
        &["mint", &admin_kp.pubkey().to_string(), "1000000"],
    )
    .assert()
    .success();

    // Holders (default)
    sss_token(&rpc, &admin_path, &mint_pubkey, &["holders"])
        .assert()
        .success();

    // Holders with --min-balance
    sss_token(
        &rpc,
        &admin_path,
        &mint_pubkey,
        &["holders", "--min-balance", "100"],
    )
    .assert()
    .success();

    // Audit log with --limit
    sss_token(
        &rpc,
        &admin_path,
        &mint_pubkey,
        &["audit-log", "--limit", "5"],
    )
    .assert()
    .success();

    // Audit log with --action
    sss_token(
        &rpc,
        &admin_path,
        &mint_pubkey,
        &["audit-log", "--action", "mint", "--limit", "10"],
    )
    .assert()
    .success();
}

#[test]
fn cli_init_custom_config_toml() {
    let rpc = rpc_url();
    let (_admin_dir, admin_kp, admin_path) = write_keypair_to_temp();
    let (_mint_dir, mint_kp, mint_path) = write_keypair_to_temp();
    let mint_pubkey = mint_kp.pubkey().to_string();

    airdrop(&admin_kp.pubkey(), 2_000_000_000);

    let config_dir = tempfile::tempdir().expect("temp config dir");
    let config_path = config_dir.path().join("config.toml");
    let config_toml = r#"
name = "Custom Stablecoin"
symbol = "CUST"
uri = "https://example.com/custom.json"
decimals = 6
initial_allowance = 500000000
enable_permanent_delegate = false
enable_transfer_hook = false
default_account_frozen = false
"#;
    std::fs::write(&config_path, config_toml).expect("write config");

    sss_token(
        &rpc,
        &admin_path,
        &mint_pubkey,
        &[
            "init",
            "--custom",
            config_path.to_str().unwrap(),
            "--mint-keypair",
            mint_path.to_str().unwrap(),
        ],
    )
    .assert()
    .success()
    .stdout(contains("Initialized mint:"));

    sss_token(&rpc, &admin_path, &mint_pubkey, &["status"])
        .assert()
        .success()
        .stdout(contains("Custom Stablecoin"))
        .stdout(contains("CUST"));
}

#[test]
fn cli_freeze_thaw() {
    let rpc = rpc_url();
    let (_admin_dir, admin_kp, admin_path) = write_keypair_to_temp();
    let (_mint_dir, mint_kp, mint_path) = write_keypair_to_temp();
    let (_, recipient_kp, _) = write_keypair_to_temp();
    let mint_pubkey = mint_kp.pubkey().to_string();

    airdrop(&admin_kp.pubkey(), 2_000_000_000);
    airdrop(&recipient_kp.pubkey(), 1_000_000_000);

    sss_token(
        &rpc,
        &admin_path,
        &mint_pubkey,
        &[
            "init",
            "--preset",
            "sss-1",
            "--mint-keypair",
            mint_path.to_str().unwrap(),
        ],
    )
    .assert()
    .success();

    // Mint to recipient so they have an ATA
    let amount = 50_000_000u64;
    sss_token(
        &rpc,
        &admin_path,
        &mint_pubkey,
        &[
            "mint",
            &recipient_kp.pubkey().to_string(),
            &amount.to_string(),
        ],
    )
    .assert()
    .success();

    let recipient_ata = spl_associated_token_account::get_associated_token_address_with_program_id(
        &recipient_kp.pubkey(),
        &mint_kp.pubkey(),
        &spl_token_2022::ID,
    );

    // Freeze (master can freeze)
    sss_token(
        &rpc,
        &admin_path,
        &mint_pubkey,
        &["freeze", &recipient_ata.to_string()],
    )
    .assert()
    .success();

    // Thaw
    sss_token(
        &rpc,
        &admin_path,
        &mint_pubkey,
        &["thaw", &recipient_ata.to_string()],
    )
    .assert()
    .success();
}

#[test]
fn cli_seize() {
    let rpc = rpc_url();
    let (_admin_dir, admin_kp, admin_path) = write_keypair_to_temp();
    let (_mint_dir, mint_kp, mint_path) = write_keypair_to_temp();
    let (_, victim_kp, _) = write_keypair_to_temp();
    let mint_pubkey = mint_kp.pubkey().to_string();

    airdrop(&admin_kp.pubkey(), 2_000_000_000);
    airdrop(&victim_kp.pubkey(), 1_000_000_000);

    // Custom config: permanent delegate (for seize), no transfer hook (no hook program deployed),
    // default_account_frozen = false so we can mint into the victim's ATA (preset sss-2 would freeze new accounts).
    let config_dir = tempfile::tempdir().expect("temp config dir");
    let config_path = config_dir.path().join("seize_config.toml");
    std::fs::write(
        &config_path,
        r#"
name = "SSS2 Seize Test"
symbol = "SS2SZ"
uri = "https://example.com/seize.json"
decimals = 6
initial_allowance = 1000000000
enable_permanent_delegate = true
enable_transfer_hook = false
default_account_frozen = false
"#,
    )
    .expect("write config");

    sss_token(
        &rpc,
        &admin_path,
        &mint_pubkey,
        &[
            "init",
            "--custom",
            config_path.to_str().unwrap(),
            "--mint-keypair",
            mint_path.to_str().unwrap(),
        ],
    )
    .assert()
    .success();

    // Grant seizer role to admin
    sss_token(
        &rpc,
        &admin_path,
        &mint_pubkey,
        &[
            "update-roles",
            "--role",
            "seizer",
            "--new-key",
            &admin_kp.pubkey().to_string(),
        ],
    )
    .assert()
    .success();

    // Mint to victim
    let amount = 30_000_000u64;
    sss_token(
        &rpc,
        &admin_path,
        &mint_pubkey,
        &["mint", &victim_kp.pubkey().to_string(), &amount.to_string()],
    )
    .assert()
    .success();

    let victim_ata = spl_associated_token_account::get_associated_token_address_with_program_id(
        &victim_kp.pubkey(),
        &mint_kp.pubkey(),
        &spl_token_2022::ID,
    );

    // Seize from victim to admin (treasury)
    sss_token(
        &rpc,
        &admin_path,
        &mint_pubkey,
        &[
            "seize",
            &victim_ata.to_string(),
            "--to",
            &admin_kp.pubkey().to_string(),
        ],
    )
    .assert()
    .success()
    .stdout(contains("Seized"));
}
