mod commands;
mod config;
mod display;
mod pda;
use anyhow::Result;
use clap::{Parser, Subcommand};
use config::CliConfig;

#[derive(Parser)]
#[command(name = "sss-token", about = "Solana Stablecoin Standard CLI")]
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
    /// Manage allowlist
    Allowlist(commands::allowlist::AllowlistArgs),
    /// Seize tokens from a blacklisted address
    Seize(commands::seize::SeizeArgs),
    /// Update roles
    Roles(commands::roles::RolesArgs),
    /// Update minter configuration
    Minter(commands::minter::MinterArgs),
    /// Nominate a pending authority
    Nominate(commands::nominate::NominateArgs),
    /// Accept a pending authority nomination
    AcceptAuthority(commands::accept_authority::AcceptAuthorityArgs),
    /// Update the configured supply cap
    SetSupplyCap(commands::set_supply_cap::SetSupplyCapArgs),
    /// Update token metadata fields
    UpdateMetadata(commands::update_metadata::UpdateMetadataArgs),
    /// Record a reserve attestation
    Attest(commands::attest::AttestArgs),
    /// Display stablecoin info
    Info(commands::info::InfoArgs),
    /// Show stablecoin status summary
    Status(commands::status::StatusArgs),
    /// Show supply details
    Supply(commands::supply::SupplyArgs),
    /// Manage and list minters
    Minters(commands::minters::MintersArgs),
    /// Show token holders
    Holders(commands::holders::HoldersArgs),
    /// Show audit log and attestation history
    AuditLog(commands::audit_log::AuditLogArgs),
    /// Transfer master authority to a new keypair (immediate, both parties sign)
    TransferAuthority(commands::transfer_authority::TransferAuthorityArgs),
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
        Commands::Allowlist(args) => commands::allowlist::execute(&config, args),
        Commands::Seize(args) => commands::seize::execute(&config, args),
        Commands::Roles(args) => commands::roles::execute(&config, args),
        Commands::Minter(args) => commands::minter::execute(&config, args),
        Commands::Nominate(args) => commands::nominate::execute(&config, args),
        Commands::AcceptAuthority(args) => commands::accept_authority::execute(&config, args),
        Commands::SetSupplyCap(args) => commands::set_supply_cap::execute(&config, args),
        Commands::UpdateMetadata(args) => commands::update_metadata::execute(&config, args),
        Commands::Attest(args) => commands::attest::execute(&config, args),
        Commands::Info(args) => commands::info::execute(&config, args),
        Commands::Status(args) => commands::status::execute(&config, args),
        Commands::Supply(args) => commands::supply::execute(&config, args),
        Commands::Minters(args) => commands::minters::execute(&config, args),
        Commands::Holders(args) => commands::holders::execute(&config, args),
        Commands::AuditLog(args) => commands::audit_log::execute(&config, args),
        Commands::TransferAuthority(args) => commands::transfer_authority::execute(&config, args),
    }
}
