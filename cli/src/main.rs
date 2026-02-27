mod commands;
mod config;
mod display;
mod pda;
mod tui;

use anyhow::Result;
use clap::{Args, Parser, Subcommand};
use config::CliConfig;
use solana_sdk::pubkey::Pubkey;

#[derive(Parser)]
#[command(name = "sss", about = "Solana Stablecoin Standard CLI")]
struct Cli {
    #[arg(long, default_value = "http://localhost:8899", global = true)]
    url: String,

    #[arg(long, default_value = "~/.config/solana/id.json", global = true)]
    keypair: String,

    #[arg(long, default_value = "confirmed", global = true)]
    commitment: String,

    #[command(subcommand)]
    command: Commands,
}

#[derive(Args)]
struct DashboardArgs {
    #[arg(long)]
    mint: Pubkey,
}

#[derive(Subcommand)]
enum Commands {
    /// Initialize a new stablecoin
    Init(commands::init::InitArgs),
    /// Mint tokens
    Mint(commands::mint::MintArgs),
    /// Burn tokens
    Burn(commands::burn::BurnArgs),
    /// Freeze a token account
    Freeze(commands::freeze::FreezeArgs),
    /// Thaw a token account
    Thaw(commands::thaw::ThawArgs),
    /// Pause the program
    Pause(commands::pause::PauseArgs),
    /// Unpause the program
    Unpause(commands::unpause::UnpauseArgs),
    /// Manage blacklist
    Blacklist(commands::blacklist::BlacklistArgs),
    /// Seize tokens from a blacklisted address
    Seize(commands::seize::SeizeArgs),
    /// Update roles
    Roles(commands::roles::RolesArgs),
    /// Update minter configuration
    Minter(commands::minter::MinterArgs),
    /// Record a reserve attestation
    Attest(commands::attest::AttestArgs),
    /// Display stablecoin info
    Info(commands::info::InfoArgs),
    /// Interactive TUI dashboard
    Dashboard(DashboardArgs),
}

fn main() -> Result<()> {
    let cli = Cli::parse();
    let config = CliConfig::new(&cli.url, &cli.keypair, &cli.commitment)?;

    match &cli.command {
        Commands::Init(args) => commands::init::execute(&config, args),
        Commands::Mint(args) => commands::mint::execute(&config, args),
        Commands::Burn(args) => commands::burn::execute(&config, args),
        Commands::Freeze(args) => commands::freeze::execute(&config, args),
        Commands::Thaw(args) => commands::thaw::execute(&config, args),
        Commands::Pause(args) => commands::pause::execute(&config, args),
        Commands::Unpause(args) => commands::unpause::execute(&config, args),
        Commands::Blacklist(args) => commands::blacklist::execute(&config, args),
        Commands::Seize(args) => commands::seize::execute(&config, args),
        Commands::Roles(args) => commands::roles::execute(&config, args),
        Commands::Minter(args) => commands::minter::execute(&config, args),
        Commands::Attest(args) => commands::attest::execute(&config, args),
        Commands::Info(args) => commands::info::execute(&config, args),
        Commands::Dashboard(args) => tui::run_dashboard(&config, &args.mint),
    }
}
