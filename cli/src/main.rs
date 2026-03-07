use anyhow::Result;
use clap::{Parser, Subcommand};

mod commands;
mod config;
mod pda;
mod program_client;

use commands::{
    audit_log, blacklist, burn, freeze, holders, init, minters, mint, pause, seize, status,
    supply, thaw, transfer_authority, unpause, update_roles,
};
use config::CliConfig;

#[derive(Parser)]
#[command(name = "sss-token", about = "CLI for the SSS Solana Stablecoin Standard")]
struct Cli {
    /// RPC URL (overrides config file and RPC_URL env var)
    #[arg(long, global = true, env = "RPC_URL")]
    rpc_url: Option<String>,

    /// Mint public key (overrides config file)
    #[arg(long, global = true)]
    mint: Option<String>,

    /// Path to keypair file (default: ~/.config/solana/id.json)
    #[arg(long, global = true)]
    keypair: Option<String>,

    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Initialize a new stablecoin mint
    Init(init::InitArgs),

    /// Mint tokens to a recipient
    Mint(mint::MintArgs),

    /// Burn tokens from caller's ATA
    Burn(burn::BurnArgs),

    /// Freeze a token account
    Freeze(freeze::FreezeArgs),

    /// Thaw a frozen token account
    Thaw(thaw::ThawArgs),

    /// Pause the mint (SSS-2 only)
    Pause,

    /// Unpause the mint (SSS-2 only)
    Unpause,

    /// Show mint status and config
    Status,

    /// Show token supply
    Supply,

    /// Blacklist management (SSS-2 only)
    #[command(subcommand)]
    Blacklist(blacklist::BlacklistCommands),

    /// Seize tokens from an address (SSS-2 only)
    Seize(seize::SeizeArgs),

    /// Minter management
    #[command(subcommand)]
    Minters(minters::MintersCommands),

    /// Update roles for an address (burner, pauser, seizer, blacklister)
    UpdateRoles(update_roles::UpdateRolesArgs),

    /// Transfer master authority to a new address
    TransferAuthority(transfer_authority::TransferAuthorityArgs),

    /// List token holders
    Holders(holders::HoldersArgs),

    /// Show on-chain audit log (decoded CPI events)
    AuditLog(audit_log::AuditLogArgs),
}

#[tokio::main]
async fn main() -> Result<()> {
    let cli = Cli::parse();
    let cfg = CliConfig::load(cli.rpc_url, cli.mint, cli.keypair)?;

    match cli.command {
        Commands::Init(args) => init::run(cfg, args).await,
        Commands::Mint(args) => mint::run(cfg, args).await,
        Commands::Burn(args) => burn::run(cfg, args).await,
        Commands::Freeze(args) => freeze::run(cfg, args).await,
        Commands::Thaw(args) => thaw::run(cfg, args).await,
        Commands::Pause => pause::run(cfg).await,
        Commands::Unpause => unpause::run(cfg).await,
        Commands::Status => status::run(cfg).await,
        Commands::Supply => supply::run(cfg).await,
        Commands::Blacklist(cmd) => blacklist::run(cfg, cmd).await,
        Commands::Seize(args) => seize::run(cfg, args).await,
        Commands::Minters(cmd) => minters::run(cfg, cmd).await,
        Commands::UpdateRoles(args) => update_roles::run(cfg, args).await,
        Commands::TransferAuthority(args) => transfer_authority::run(cfg, args).await,
        Commands::Holders(args) => holders::run(cfg, args).await,
        Commands::AuditLog(args) => audit_log::run(cfg, args).await,
    }
}
