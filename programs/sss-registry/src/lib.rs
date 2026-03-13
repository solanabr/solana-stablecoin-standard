#![allow(unexpected_cfgs)]

use anchor_lang::prelude::*;
use stablecoin::state::StablecoinConfig;

declare_id!("5vedffCtRhecm5sSXJCbgrwe7GYnGC9XK5vWLiMHLVXB");

const REGISTRY_CONFIG_SEED: &[u8] = b"sss_registry_config";
const RELEASE_SEED: &[u8] = b"sss_release";
const STABLECOIN_REGISTRATION_SEED: &[u8] = b"sss_stablecoin";

#[program]
pub mod sss_registry {
    use super::*;

    pub fn initialize_registry(ctx: Context<InitializeRegistry>) -> Result<()> {
        let registry = &mut ctx.accounts.registry;
        registry.authority = ctx.accounts.authority.key();
        registry.bump = ctx.bumps.registry;

        emit!(RegistryInitialized {
            authority: registry.authority,
        });

        Ok(())
    }

    pub fn register_release(
        ctx: Context<RegisterRelease>,
        params: RegisterReleaseParams,
    ) -> Result<()> {
        require!(
            params.standard_version.len() <= ReleaseRecord::MAX_STANDARD_VERSION_LEN,
            RegistryError::StringTooLong
        );
        require!(
            params.schema_hash.len() <= ReleaseRecord::MAX_SCHEMA_HASH_LEN,
            RegistryError::StringTooLong
        );
        require!(
            params.notes_uri.len() <= ReleaseRecord::MAX_NOTES_URI_LEN,
            RegistryError::StringTooLong
        );
        if let Some(replacement_version) = params.replacement_version.as_ref() {
            require!(
                replacement_version.len() <= ReleaseRecord::MAX_STANDARD_VERSION_LEN,
                RegistryError::StringTooLong
            );
        }
        require!(
            (1..=3).contains(&params.preset),
            RegistryError::InvalidPreset
        );

        let release = &mut ctx.accounts.release;
        release.standard_version = params.standard_version;
        release.preset = params.preset;
        release.schema_hash = params.schema_hash;
        release.notes_uri = params.notes_uri;
        release.deprecated = params.deprecated;
        release.replacement_version = params.replacement_version;
        release.released_at = Clock::get()?.unix_timestamp;
        release.bump = ctx.bumps.release;

        emit!(ReleaseRegistered {
            standard_version: release.standard_version.clone(),
            preset: release.preset,
            deprecated: release.deprecated,
        });

        Ok(())
    }

    pub fn deprecate_release(
        ctx: Context<DeprecateRelease>,
        replacement_version: Option<String>,
    ) -> Result<()> {
        if let Some(version) = replacement_version.as_ref() {
            require!(
                version.len() <= ReleaseRecord::MAX_STANDARD_VERSION_LEN,
                RegistryError::StringTooLong
            );
        }

        let release = &mut ctx.accounts.release;
        release.deprecated = true;
        release.replacement_version = replacement_version.clone();

        emit!(ReleaseDeprecated {
            standard_version: release.standard_version.clone(),
            replacement_version,
        });

        Ok(())
    }

    pub fn register_stablecoin(
        ctx: Context<RegisterStablecoin>,
        params: RegisterStablecoinParams,
    ) -> Result<()> {
        require_keys_eq!(
            ctx.accounts.mint.key(),
            params.mint,
            RegistryError::InvalidStablecoinConfig
        );
        require_keys_eq!(
            ctx.accounts.stablecoin_config.key(),
            params.stablecoin_config,
            RegistryError::InvalidStablecoinConfig
        );
        require!(
            params.standard_version.len() <= StablecoinRegistration::MAX_STANDARD_VERSION_LEN,
            RegistryError::StringTooLong
        );
        require!(
            params.config_hash.len() <= StablecoinRegistration::MAX_CONFIG_HASH_LEN,
            RegistryError::StringTooLong
        );
        require!(
            params.name.len() <= StablecoinRegistration::MAX_NAME_LEN,
            RegistryError::StringTooLong
        );
        require!(
            params.symbol.len() <= StablecoinRegistration::MAX_SYMBOL_LEN,
            RegistryError::StringTooLong
        );
        require!(
            params.uri.len() <= StablecoinRegistration::MAX_URI_LEN,
            RegistryError::StringTooLong
        );
        require!(
            params.homepage.len() <= StablecoinRegistration::MAX_HOMEPAGE_LEN,
            RegistryError::StringTooLong
        );
        require!(
            params.jurisdiction.len() <= StablecoinRegistration::MAX_JURISDICTION_LEN,
            RegistryError::StringTooLong
        );
        if let Some(root) = params.compressed_compliance_root.as_ref() {
            require!(
                root.len() <= StablecoinRegistration::MAX_COMPLIANCE_ROOT_LEN,
                RegistryError::StringTooLong
            );
        }
        if let Some(circuit) = params.compliance_circuit.as_ref() {
            require!(
                circuit.len() <= StablecoinRegistration::MAX_CIRCUIT_LEN,
                RegistryError::StringTooLong
            );
        }
        require!(
            (1..=3).contains(&params.preset),
            RegistryError::InvalidPreset
        );
        let expected_config = Pubkey::find_program_address(
            &[b"stablecoin_config", params.mint.as_ref()],
            &params.stablecoin_program_id,
        )
        .0;
        require_keys_eq!(
            ctx.accounts.stablecoin_config.key(),
            expected_config,
            RegistryError::InvalidStablecoinConfig
        );
        let stablecoin_config = load_stablecoin_config(
            &ctx.accounts.stablecoin_config,
            &params.stablecoin_program_id,
        )?;
        require_keys_eq!(
            stablecoin_config.mint,
            params.mint,
            RegistryError::InvalidStablecoinConfig
        );
        require_keys_eq!(
            stablecoin_config.authority,
            ctx.accounts.stablecoin_authority.key(),
            RegistryError::InvalidStablecoinConfig
        );
        require!(
            stablecoin_config.standard_version == params.standard_version
                && stablecoin_config.preset_level() == params.preset
                && stablecoin_config.name == params.name
                && stablecoin_config.symbol == params.symbol
                && stablecoin_config.uri == params.uri
                && stablecoin_config.decimals == params.decimals
                && stablecoin_config.enable_permanent_delegate
                    == params.enable_permanent_delegate
                && stablecoin_config.enable_transfer_hook == params.enable_transfer_hook
                && stablecoin_config.default_account_frozen == params.default_account_frozen
                && stablecoin_config.enable_confidential_transfers
                    == params.enable_confidential_transfers
                && stablecoin_config.enable_zk_compliance_proofs
                    == params.enable_zk_compliance_proofs
                && stablecoin_config.enable_compressed_compliance_state
                    == params.enable_compressed_compliance_state
                && stablecoin_config.transfer_hook_program_id
                    == parse_optional_pubkey(params.transfer_hook_program_id.as_ref())?
                && stablecoin_config.proof_verifier_program_id
                    == parse_optional_pubkey(params.proof_verifier_program_id.as_ref())?
                && stablecoin_config.compressed_compliance_root
                    == params.compressed_compliance_root
                && stablecoin_config.compliance_circuit == params.compliance_circuit,
            RegistryError::StablecoinConfigMismatch
        );

        let registration = &mut ctx.accounts.registration;
        registration.mint = params.mint;
        registration.stablecoin_config = params.stablecoin_config;
        registration.authority = ctx.accounts.stablecoin_authority.key();
        registration.stablecoin_program_id = params.stablecoin_program_id;
        registration.standard_version = params.standard_version;
        registration.preset = params.preset;
        registration.config_hash = params.config_hash;
        registration.enable_permanent_delegate = params.enable_permanent_delegate;
        registration.enable_transfer_hook = params.enable_transfer_hook;
        registration.default_account_frozen = params.default_account_frozen;
        registration.enable_confidential_transfers = params.enable_confidential_transfers;
        registration.enable_zk_compliance_proofs = params.enable_zk_compliance_proofs;
        registration.enable_compressed_compliance_state =
            params.enable_compressed_compliance_state;
        registration.decimals = params.decimals;
        registration.transfer_hook_program_id = params.transfer_hook_program_id;
        registration.proof_verifier_program_id = params.proof_verifier_program_id;
        registration.compressed_compliance_root = params.compressed_compliance_root;
        registration.compliance_circuit = params.compliance_circuit;
        registration.name = params.name;
        registration.symbol = params.symbol;
        registration.uri = params.uri;
        registration.homepage = params.homepage;
        registration.jurisdiction = params.jurisdiction;
        registration.registered_at = Clock::get()?.unix_timestamp;
        registration.bump = ctx.bumps.registration;

        emit!(StablecoinRegistered {
            mint: registration.mint,
            preset: registration.preset,
            standard_version: registration.standard_version.clone(),
            config_hash: registration.config_hash.clone(),
        });

        Ok(())
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct RegisterReleaseParams {
    pub standard_version: String,
    pub preset: u8,
    pub schema_hash: String,
    pub notes_uri: String,
    pub deprecated: bool,
    pub replacement_version: Option<String>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct RegisterStablecoinParams {
    pub mint: Pubkey,
    pub stablecoin_config: Pubkey,
    pub stablecoin_program_id: Pubkey,
    pub standard_version: String,
    pub preset: u8,
    pub config_hash: String,
    pub enable_permanent_delegate: bool,
    pub enable_transfer_hook: bool,
    pub default_account_frozen: bool,
    pub enable_confidential_transfers: bool,
    pub enable_zk_compliance_proofs: bool,
    pub enable_compressed_compliance_state: bool,
    pub decimals: u8,
    pub transfer_hook_program_id: Option<String>,
    pub proof_verifier_program_id: Option<String>,
    pub compressed_compliance_root: Option<String>,
    pub compliance_circuit: Option<String>,
    pub name: String,
    pub symbol: String,
    pub uri: String,
    pub homepage: String,
    pub jurisdiction: String,
}

#[derive(Accounts)]
pub struct InitializeRegistry<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        init,
        payer = authority,
        space = RegistryConfig::LEN,
        seeds = [REGISTRY_CONFIG_SEED],
        bump
    )]
    pub registry: Account<'info, RegistryConfig>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(params: RegisterReleaseParams)]
pub struct RegisterRelease<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        seeds = [REGISTRY_CONFIG_SEED],
        bump = registry.bump,
        has_one = authority
    )]
    pub registry: Account<'info, RegistryConfig>,
    #[account(
        init,
        payer = authority,
        space = ReleaseRecord::LEN,
        seeds = [RELEASE_SEED, params.standard_version.as_bytes()],
        bump
    )]
    pub release: Account<'info, ReleaseRecord>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct DeprecateRelease<'info> {
    pub authority: Signer<'info>,
    #[account(
        seeds = [REGISTRY_CONFIG_SEED],
        bump = registry.bump,
        has_one = authority
    )]
    pub registry: Account<'info, RegistryConfig>,
    #[account(
        mut,
        seeds = [RELEASE_SEED, release.standard_version.as_bytes()],
        bump = release.bump
    )]
    pub release: Account<'info, ReleaseRecord>,
}

#[derive(Accounts)]
#[instruction(params: RegisterStablecoinParams)]
pub struct RegisterStablecoin<'info> {
    #[account(mut)]
    pub stablecoin_authority: Signer<'info>,
    #[account(
        seeds = [REGISTRY_CONFIG_SEED],
        bump = registry.bump
    )]
    pub registry: Account<'info, RegistryConfig>,
    #[account(
        init,
        payer = stablecoin_authority,
        space = StablecoinRegistration::LEN,
        seeds = [STABLECOIN_REGISTRATION_SEED, params.mint.as_ref()],
        bump
    )]
    pub registration: Account<'info, StablecoinRegistration>,
    /// CHECK: Stored for discovery, not dereferenced in this registry program.
    pub mint: UncheckedAccount<'info>,
    /// CHECK: Stored for discovery, not dereferenced in this registry program.
    pub stablecoin_config: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[account]
pub struct RegistryConfig {
    pub authority: Pubkey,
    pub bump: u8,
}

fn load_stablecoin_config(
    account: &UncheckedAccount<'_>,
    expected_program_id: &Pubkey,
) -> Result<StablecoinConfig> {
    require_keys_eq!(
        *account.owner,
        *expected_program_id,
        RegistryError::InvalidStablecoinConfig
    );

    let data = account.try_borrow_data()?;
    let mut slice: &[u8] = &data;
    StablecoinConfig::try_deserialize(&mut slice)
        .map_err(|_| error!(RegistryError::InvalidStablecoinConfig))
}

fn parse_optional_pubkey(value: Option<&String>) -> Result<Option<Pubkey>> {
    match value {
        Some(raw) => Pubkey::try_from(raw.as_str())
            .map(Some)
            .map_err(|_| error!(RegistryError::InvalidStablecoinConfig)),
        None => Ok(None),
    }
}

impl RegistryConfig {
    pub const LEN: usize = 8 + 32 + 1;
}

#[account]
pub struct ReleaseRecord {
    pub standard_version: String,
    pub preset: u8,
    pub schema_hash: String,
    pub notes_uri: String,
    pub deprecated: bool,
    pub replacement_version: Option<String>,
    pub released_at: i64,
    pub bump: u8,
}

impl ReleaseRecord {
    pub const MAX_STANDARD_VERSION_LEN: usize = 24;
    pub const MAX_SCHEMA_HASH_LEN: usize = 64;
    pub const MAX_NOTES_URI_LEN: usize = 200;
    pub const LEN: usize = 8
        + (4 + Self::MAX_STANDARD_VERSION_LEN)
        + 1
        + (4 + Self::MAX_SCHEMA_HASH_LEN)
        + (4 + Self::MAX_NOTES_URI_LEN)
        + 1
        + (1 + 4 + Self::MAX_STANDARD_VERSION_LEN)
        + 8
        + 1;
}

#[account]
pub struct StablecoinRegistration {
    pub mint: Pubkey,
    pub stablecoin_config: Pubkey,
    pub authority: Pubkey,
    pub stablecoin_program_id: Pubkey,
    pub standard_version: String,
    pub preset: u8,
    pub config_hash: String,
    pub enable_permanent_delegate: bool,
    pub enable_transfer_hook: bool,
    pub default_account_frozen: bool,
    pub enable_confidential_transfers: bool,
    pub enable_zk_compliance_proofs: bool,
    pub enable_compressed_compliance_state: bool,
    pub decimals: u8,
    pub transfer_hook_program_id: Option<String>,
    pub proof_verifier_program_id: Option<String>,
    pub compressed_compliance_root: Option<String>,
    pub compliance_circuit: Option<String>,
    pub name: String,
    pub symbol: String,
    pub uri: String,
    pub homepage: String,
    pub jurisdiction: String,
    pub registered_at: i64,
    pub bump: u8,
}

impl StablecoinRegistration {
    pub const MAX_STANDARD_VERSION_LEN: usize = 24;
    pub const MAX_CONFIG_HASH_LEN: usize = 64;
    pub const MAX_PROGRAM_ID_LEN: usize = 44;
    pub const MAX_COMPLIANCE_ROOT_LEN: usize = 64;
    pub const MAX_CIRCUIT_LEN: usize = 64;
    pub const MAX_NAME_LEN: usize = 32;
    pub const MAX_SYMBOL_LEN: usize = 8;
    pub const MAX_URI_LEN: usize = 200;
    pub const MAX_HOMEPAGE_LEN: usize = 100;
    pub const MAX_JURISDICTION_LEN: usize = 32;
    pub const LEN: usize = 8
        + 32
        + 32
        + 32
        + 32
        + (4 + Self::MAX_STANDARD_VERSION_LEN)
        + 1
        + (4 + Self::MAX_CONFIG_HASH_LEN)
        + 1
        + 1
        + 1
        + 1
        + 1
        + 1
        + 1
        + (1 + 4 + Self::MAX_PROGRAM_ID_LEN)
        + (1 + 4 + Self::MAX_PROGRAM_ID_LEN)
        + (1 + 4 + Self::MAX_COMPLIANCE_ROOT_LEN)
        + (1 + 4 + Self::MAX_CIRCUIT_LEN)
        + (4 + Self::MAX_NAME_LEN)
        + (4 + Self::MAX_SYMBOL_LEN)
        + (4 + Self::MAX_URI_LEN)
        + (4 + Self::MAX_HOMEPAGE_LEN)
        + (4 + Self::MAX_JURISDICTION_LEN)
        + 8
        + 1;
}

#[event]
pub struct RegistryInitialized {
    pub authority: Pubkey,
}

#[event]
pub struct ReleaseRegistered {
    pub standard_version: String,
    pub preset: u8,
    pub deprecated: bool,
}

#[event]
pub struct ReleaseDeprecated {
    pub standard_version: String,
    pub replacement_version: Option<String>,
}

#[event]
pub struct StablecoinRegistered {
    pub mint: Pubkey,
    pub preset: u8,
    pub standard_version: String,
    pub config_hash: String,
}

#[error_code]
pub enum RegistryError {
    #[msg("Only registry presets 1 through 3 are valid")]
    InvalidPreset,
    #[msg("One of the provided string fields exceeded its maximum length")]
    StringTooLong,
    #[msg("The provided stablecoin config account is invalid for this registration")]
    InvalidStablecoinConfig,
    #[msg("The provided registry metadata did not match the referenced stablecoin config")]
    StablecoinConfigMismatch,
}
