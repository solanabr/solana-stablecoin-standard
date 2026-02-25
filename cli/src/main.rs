use clap::{Parser, Subcommand};
use anyhow::Result;

mod commands;
mod config;
mod utils;

#[derive(Parser)]
#[command(name = "sss-token", version, about = "Solana Stablecoin Standard CLI")]
pub struct Cli {
  #[command(subcommand)]
  pub command: Commands,

  /// RPC URL
  #[arg(long, global = true, env = "SOLANA_RPC_URL", default_value = "http://localhost:8899")]
  pub rpc_url: String,

  /// Path to keypair file
  #[arg(long, global = true, env = "SOLANA_KEYPAIR", default_value_t = default_keypair_path())]
  pub keypair: String,

  /// Commitment level
  #[arg(long, global = true, default_value = "confirmed")]
  pub commitment: String,
}

fn default_keypair_path() -> String {
  let home = std::env::var("HOME").unwrap_or_default();
  format!("{home}/.config/solana/id.json")
}

#[derive(Subcommand)]
pub enum Commands {
  /// Initialize a new stablecoin
  Init {
    /// Preset tier: "sss-1", "sss-2", "sss-3"
    #[arg(long, required_unless_present = "config")]
    preset: Option<String>,
    /// Path to custom TOML config file
    #[arg(long, conflicts_with = "preset")]
    config: Option<String>,
    /// Token name
    #[arg(long, required_unless_present = "config")]
    name: Option<String>,
    /// Token symbol
    #[arg(long, required_unless_present = "config")]
    symbol: Option<String>,
    /// Metadata URI
    #[arg(long, default_value = "")]
    uri: String,
    /// Token decimals
    #[arg(long, default_value_t = 6)]
    decimals: u8,
    /// Optional supply cap (in base units)
    #[arg(long)]
    supply_cap: Option<u64>,
  },
  /// Mint tokens
  Mint {
    /// Base58 mint address
    #[arg(long)]
    mint: String,
    /// Base58 recipient address
    #[arg(long)]
    to: String,
    /// Amount in base units
    #[arg(long)]
    amount: u64,
  },
  /// Burn tokens
  Burn {
    /// Base58 mint address
    #[arg(long)]
    mint: String,
    /// Base58 token account to burn from
    #[arg(long)]
    from: String,
    /// Amount in base units
    #[arg(long)]
    amount: u64,
  },
  /// Freeze a token account
  Freeze {
    /// Base58 mint address
    #[arg(long)]
    mint: String,
    /// Base58 token account to freeze
    #[arg(long)]
    account: String,
  },
  /// Thaw a token account
  Thaw {
    /// Base58 mint address
    #[arg(long)]
    mint: String,
    /// Base58 token account to thaw
    #[arg(long)]
    account: String,
  },
  /// Pause all operations
  Pause {
    /// Base58 mint address
    #[arg(long)]
    mint: String,
  },
  /// Unpause operations
  Unpause {
    /// Base58 mint address
    #[arg(long)]
    mint: String,
  },
  /// Seize tokens (admin only)
  Seize {
    /// Base58 mint address
    #[arg(long)]
    mint: String,
    /// Base58 source token account
    #[arg(long)]
    from: String,
    /// Base58 destination token account
    #[arg(long)]
    to: String,
    /// Amount in base units
    #[arg(long)]
    amount: u64,
  },
  /// Manage blacklist
  Blacklist {
    #[command(subcommand)]
    action: BlacklistAction,
  },
  /// Manage roles
  Roles {
    #[command(subcommand)]
    action: RoleAction,
  },
  /// Display stablecoin info
  Info {
    /// Base58 mint address
    #[arg(long)]
    mint: String,
  },
  /// SSS-3 confidential transfer operations
  Confidential {
    #[command(subcommand)]
    action: ConfidentialAction,
  },
  /// List token holders for a mint
  Holders {
    /// Base58 mint address
    #[arg(long)]
    mint: String,
    /// Minimum balance filter (base units)
    #[arg(long)]
    min_balance: Option<u64>,
  },
  /// View audit log (transaction history)
  AuditLog {
    /// Base58 mint address
    #[arg(long)]
    mint: String,
    /// Filter by action type (partial match)
    #[arg(long)]
    action: Option<String>,
    /// Maximum entries to display
    #[arg(long, default_value_t = 25)]
    limit: usize,
  },
  /// Display stablecoin status (alias for info)
  Status {
    /// Base58 mint address
    #[arg(long)]
    mint: String,
  },
  /// Display supply information for a stablecoin
  Supply {
    /// Base58 mint address
    #[arg(long)]
    mint: String,
  },
  /// Manage minters
  Minters {
    #[command(subcommand)]
    action: MinterAction,
  },
}

#[derive(Subcommand)]
pub enum BlacklistAction {
  /// Add an address to the blacklist
  Add {
    /// Base58 mint address
    #[arg(long)]
    mint: String,
    /// Base58 address to blacklist
    #[arg(long)]
    address: String,
    /// Compliance reason
    #[arg(long)]
    reason: String,
  },
  /// Remove an address from the blacklist
  Remove {
    /// Base58 mint address
    #[arg(long)]
    mint: String,
    /// Base58 address to remove
    #[arg(long)]
    address: String,
  },
  /// Check if an address is blacklisted
  Check {
    /// Base58 mint address
    #[arg(long)]
    mint: String,
    /// Base58 address to check
    #[arg(long)]
    address: String,
  },
}

#[derive(Subcommand)]
pub enum RoleAction {
  /// Grant a role to an address
  Grant {
    /// Base58 mint address
    #[arg(long)]
    mint: String,
    /// Base58 address to grant role to
    #[arg(long)]
    address: String,
    /// Role: "admin", "minter", "freezer", "pauser", "burner", "blacklister", "seizer"
    #[arg(long)]
    role: String,
  },
  /// Revoke a role from an address
  Revoke {
    /// Base58 mint address
    #[arg(long)]
    mint: String,
    /// Base58 address to revoke role from
    #[arg(long)]
    address: String,
    /// Role: "admin", "minter", "freezer", "pauser", "burner", "blacklister", "seizer"
    #[arg(long)]
    role: String,
  },
  /// List roles for the current keypair
  List {
    /// Base58 mint address
    #[arg(long)]
    mint: String,
  },
}

#[derive(Subcommand)]
pub enum ConfidentialAction {
  /// Configure a token account for confidential transfers
  ConfigureAccount {
    /// Base58 mint address
    #[arg(long)]
    mint: String,
    /// Base58 token account address
    #[arg(long)]
    account: String,
  },
  /// Deposit tokens from public balance to confidential pending balance
  Deposit {
    /// Base58 mint address
    #[arg(long)]
    mint: String,
    /// Base58 token account address
    #[arg(long)]
    account: String,
    /// Amount in base units
    #[arg(long)]
    amount: u64,
    /// Token decimals
    #[arg(long, default_value_t = 6)]
    decimals: u8,
  },
  /// Apply pending balance to available confidential balance
  ApplyPending {
    /// Base58 mint address
    #[arg(long)]
    mint: String,
    /// Base58 token account address
    #[arg(long)]
    account: String,
  },
  /// Confidential transfer (requires ZK proof generation)
  Transfer,
  /// Withdraw from confidential balance (requires ZK proof generation)
  Withdraw,
}

#[derive(Subcommand)]
pub enum MinterAction {
  /// List all minters for a mint
  List {
    /// Base58 mint address
    #[arg(long)]
    mint: String,
  },
  /// Add a minter (alias for roles grant --role minter)
  Add {
    /// Base58 mint address
    #[arg(long)]
    mint: String,
    /// Address to grant minter role
    #[arg(long)]
    address: String,
  },
  /// Remove a minter (alias for roles revoke --role minter)
  Remove {
    /// Base58 mint address
    #[arg(long)]
    mint: String,
    /// Address to revoke minter role from
    #[arg(long)]
    address: String,
  },
}

#[tokio::main]
async fn main() -> Result<()> {
  let cli = Cli::parse();
  let ctx = config::CliContext::new(&cli)?;

  match cli.command {
    Commands::Init { preset, config, name, symbol, uri, decimals, supply_cap } => {
      commands::init::execute(&ctx, preset.as_deref(), config.as_deref(), name.as_deref(), symbol.as_deref(), &uri, decimals, supply_cap).await
    }
    Commands::Mint { mint, to, amount } => {
      commands::mint::execute(&ctx, &mint, &to, amount).await
    }
    Commands::Burn { mint, from, amount } => {
      commands::burn::execute(&ctx, &mint, &from, amount).await
    }
    Commands::Freeze { mint, account } => {
      commands::freeze::execute(&ctx, &mint, &account).await
    }
    Commands::Thaw { mint, account } => {
      commands::thaw::execute(&ctx, &mint, &account).await
    }
    Commands::Pause { mint } => {
      commands::pause::execute(&ctx, &mint, true).await
    }
    Commands::Unpause { mint } => {
      commands::pause::execute(&ctx, &mint, false).await
    }
    Commands::Seize { mint, from, to, amount } => {
      commands::seize::execute(&ctx, &mint, &from, &to, amount).await
    }
    Commands::Blacklist { action } => {
      commands::blacklist::execute(&ctx, action).await
    }
    Commands::Roles { action } => {
      commands::roles::execute(&ctx, action).await
    }
    Commands::Info { mint } => {
      commands::info::execute(&ctx, &mint).await
    }
    Commands::Confidential { action } => {
      commands::confidential::execute(&ctx, action).await
    }
    Commands::Holders { mint, min_balance } => {
      commands::holders::execute(&ctx, &mint, min_balance).await
    }
    Commands::AuditLog { mint, action, limit } => {
      commands::audit_log::execute(&ctx, &mint, action, limit).await
    }
    Commands::Status { mint } => {
      commands::info::execute(&ctx, &mint).await
    }
    Commands::Supply { mint } => {
      commands::supply::execute(&ctx, &mint).await
    }
    Commands::Minters { action } => {
      match action {
        MinterAction::List { mint } => {
          commands::minters::list(&ctx, &mint).await
        }
        MinterAction::Add { mint, address } => {
          commands::minters::add(&ctx, &mint, &address).await
        }
        MinterAction::Remove { mint, address } => {
          commands::minters::remove(&ctx, &mint, &address).await
        }
      }
    }
  }
}
