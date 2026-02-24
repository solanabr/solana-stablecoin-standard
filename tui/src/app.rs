use anyhow::{Context, Result};
use solana_client::rpc_client::RpcClient;
use solana_sdk::commitment_config::CommitmentConfig;
use solana_sdk::pubkey::Pubkey;
use solana_sdk::signature::Keypair;
use solana_sdk::signer::Signer;

/// Active tab in the TUI.
#[derive(Clone, Copy, PartialEq, Eq)]
pub enum Tab {
  Dashboard,
  Roles,
  Blacklist,
  Events,
}

impl Tab {
  pub const ALL: [Tab; 4] = [Tab::Dashboard, Tab::Roles, Tab::Blacklist, Tab::Events];

  pub fn title(&self) -> &'static str {
    match self {
      Tab::Dashboard => "Dashboard",
      Tab::Roles => "Roles",
      Tab::Blacklist => "Blacklist",
      Tab::Events => "Events",
    }
  }

  pub fn index(&self) -> usize {
    match self {
      Tab::Dashboard => 0,
      Tab::Roles => 1,
      Tab::Blacklist => 2,
      Tab::Events => 3,
    }
  }

  pub fn from_index(i: usize) -> Tab {
    match i % 4 {
      0 => Tab::Dashboard,
      1 => Tab::Roles,
      2 => Tab::Blacklist,
      3 => Tab::Events,
      _ => unreachable!(),
    }
  }
}

/// Cached stablecoin config data from on-chain.
#[derive(Clone)]
pub struct ConfigData {
  pub authority: Pubkey,
  pub mint: Pubkey,
  pub preset: u8,
  pub paused: bool,
  pub supply_cap: Option<u64>,
  pub total_minted: u64,
  pub total_burned: u64,
  pub decimals: u8,
}

impl ConfigData {
  pub fn current_supply(&self) -> u64 {
    self.total_minted.saturating_sub(self.total_burned)
  }
}

/// A single role's existence status for the connected wallet.
#[derive(Clone)]
pub struct RoleStatus {
  pub name: &'static str,
  pub role_u8: u8,
  pub active: bool,
}

/// A timestamped event log entry.
#[derive(Clone)]
pub struct EventEntry {
  pub timestamp: String,
  pub message: String,
}

/// Top-level application state.
pub struct App {
  pub client: RpcClient,
  pub payer: Keypair,
  pub mint: Pubkey,
  pub config_pda: Pubkey,

  pub active_tab: Tab,
  pub config_data: Option<ConfigData>,
  pub roles: Vec<RoleStatus>,
  pub events: Vec<EventEntry>,
  pub selected_index: usize,
  pub loading: bool,
  pub error_message: Option<String>,
  pub should_quit: bool,
}

impl App {
  pub fn new(rpc_url: &str, keypair_path: &str, mint: Pubkey) -> Result<Self> {
    let client = RpcClient::new_with_commitment(
      rpc_url,
      CommitmentConfig::confirmed(),
    );

    let keypair_data = std::fs::read_to_string(keypair_path)
      .with_context(|| format!("Failed to read keypair: {}", keypair_path))?;
    let keypair_bytes: Vec<u8> = serde_json::from_str(&keypair_data)
      .with_context(|| "Failed to parse keypair JSON")?;
    let payer = Keypair::try_from(keypair_bytes.as_slice())
      .map_err(|e| anyhow::anyhow!("Invalid keypair: {}", e))?;

    let (config_pda, _) = Pubkey::find_program_address(
      &[b"sss-config", mint.as_ref()],
      &sss_core::ID,
    );

    Ok(Self {
      client,
      payer,
      mint,
      config_pda,
      active_tab: Tab::Dashboard,
      config_data: None,
      roles: Vec::new(),
      events: vec![EventEntry {
        timestamp: chrono_now(),
        message: "TUI started".to_string(),
      }],
      selected_index: 0,
      loading: false,
      error_message: None,
      should_quit: false,
    })
  }

  /// Switch to the next tab.
  pub fn next_tab(&mut self) {
    let next = (self.active_tab.index() + 1) % Tab::ALL.len();
    self.active_tab = Tab::from_index(next);
    self.selected_index = 0;
  }

  /// Switch to the previous tab.
  pub fn prev_tab(&mut self) {
    let prev = (self.active_tab.index() + Tab::ALL.len() - 1) % Tab::ALL.len();
    self.active_tab = Tab::from_index(prev);
    self.selected_index = 0;
  }

  /// Move selection down in list views.
  pub fn select_next(&mut self) {
    let max = self.list_len();
    if max > 0 {
      self.selected_index = (self.selected_index + 1) % max;
    }
  }

  /// Move selection up in list views.
  pub fn select_prev(&mut self) {
    let max = self.list_len();
    if max > 0 {
      self.selected_index = (self.selected_index + max - 1) % max;
    }
  }

  /// Number of items in the currently active list.
  fn list_len(&self) -> usize {
    match self.active_tab {
      Tab::Roles => self.roles.len(),
      Tab::Events => self.events.len(),
      _ => 0,
    }
  }

  /// Fetch on-chain data and populate caches.
  pub fn refresh(&mut self) {
    self.loading = true;
    self.error_message = None;

    match self.fetch_config() {
      Ok(data) => {
        self.config_data = Some(data);
        self.push_event("Config refreshed");
      }
      Err(e) => {
        self.error_message = Some(format!("Config fetch failed: {}", e));
        self.push_event(&format!("Error: {}", e));
      }
    }

    match self.fetch_roles() {
      Ok(roles) => {
        self.roles = roles;
        self.push_event("Roles refreshed");
      }
      Err(e) => {
        self.push_event(&format!("Role fetch error: {}", e));
      }
    }

    self.loading = false;
  }

  /// Parse config account data from on-chain bytes.
  fn fetch_config(&self) -> Result<ConfigData> {
    let account = self.client.get_account(&self.config_pda)
      .map_err(|_| anyhow::anyhow!("Config account not found for mint {}", self.mint))?;

    let data = account.data.as_slice();
    if data.len() < 75 {
      anyhow::bail!("Invalid config account data (too short)");
    }

    // Skip 8-byte Anchor discriminator
    let authority = Pubkey::try_from(&data[8..40])
      .map_err(|_| anyhow::anyhow!("Failed to parse authority"))?;
    let mint_key = Pubkey::try_from(&data[40..72])
      .map_err(|_| anyhow::anyhow!("Failed to parse mint"))?;
    let preset = data[72];
    let paused = data[73] != 0;

    // Option<u64>: 1 byte tag + 8 bytes value
    let (supply_cap, offset) = if data[74] == 1 {
      if data.len() < 83 {
        anyhow::bail!("Invalid config: truncated supply_cap");
      }
      let cap = u64::from_le_bytes(data[75..83].try_into()?);
      (Some(cap), 83)
    } else {
      (None, 75)
    };

    if data.len() < offset + 16 {
      anyhow::bail!("Invalid config: truncated supply counters");
    }
    let total_minted = u64::from_le_bytes(data[offset..offset + 8].try_into()?);
    let total_burned = u64::from_le_bytes(data[offset + 8..offset + 16].try_into()?);

    // Fetch mint decimals (Token-2022 mint: decimals at offset 44)
    let decimals = match self.client.get_account(&mint_key) {
      Ok(mint_acct) => {
        if mint_acct.data.len() > 44 {
          mint_acct.data[44]
        } else {
          6 // fallback
        }
      }
      Err(_) => 6,
    };

    Ok(ConfigData {
      authority,
      mint: mint_key,
      preset,
      paused,
      supply_cap,
      total_minted,
      total_burned,
      decimals,
    })
  }

  /// Check which roles the connected wallet holds.
  fn fetch_roles(&self) -> Result<Vec<RoleStatus>> {
    let wallet = self.payer.pubkey();
    let roles_to_check: [(u8, &str); 4] = [
      (0, "Admin"),
      (1, "Minter"),
      (2, "Freezer"),
      (3, "Pauser"),
    ];

    let mut results = Vec::with_capacity(4);
    for (role_u8, name) in roles_to_check {
      let (role_pda, _) = Pubkey::find_program_address(
        &[b"sss-role", self.config_pda.as_ref(), wallet.as_ref(), &[role_u8]],
        &sss_core::ID,
      );
      let active = self.client.get_account(&role_pda).is_ok();
      results.push(RoleStatus { name, role_u8, active });
    }

    Ok(results)
  }

  /// Append a timestamped entry to the event log.
  fn push_event(&mut self, message: &str) {
    self.events.push(EventEntry {
      timestamp: chrono_now(),
      message: message.to_string(),
    });
    // Keep the log bounded
    if self.events.len() > 200 {
      self.events.drain(0..50);
    }
  }

  /// Abbreviated mint address for header display.
  pub fn mint_short(&self) -> String {
    let s = self.mint.to_string();
    if s.len() > 12 {
      format!("{}...{}", &s[..6], &s[s.len() - 4..])
    } else {
      s
    }
  }

  /// Abbreviated pubkey.
  pub fn short_key(pk: &Pubkey) -> String {
    let s = pk.to_string();
    if s.len() > 12 {
      format!("{}...{}", &s[..6], &s[s.len() - 4..])
    } else {
      s
    }
  }

  /// Format a token amount respecting decimals.
  pub fn format_amount(amount: u64, decimals: u8) -> String {
    let divisor = 10u64.pow(decimals as u32);
    let whole = amount / divisor;
    let frac = amount % divisor;
    format!("{}.{:0>width$}", whole, frac, width = decimals as usize)
  }

  /// Preset name from u8.
  pub fn preset_name(preset: u8) -> &'static str {
    match preset {
      1 => "SSS-1 (Basic)",
      2 => "SSS-2 (Compliant)",
      3 => "SSS-3 (Confidential)",
      _ => "Unknown",
    }
  }
}

/// Simple timestamp without pulling in chrono.
fn chrono_now() -> String {
  use std::time::SystemTime;
  let secs = SystemTime::now()
    .duration_since(SystemTime::UNIX_EPOCH)
    .unwrap_or_default()
    .as_secs();
  // HH:MM:SS UTC approximation
  let h = (secs % 86400) / 3600;
  let m = (secs % 3600) / 60;
  let s = secs % 60;
  format!("{:02}:{:02}:{:02}", h, m, s)
}
