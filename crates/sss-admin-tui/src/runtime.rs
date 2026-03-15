use anyhow::{Context, Result};
use solana_sdk::pubkey::Pubkey;
use sss_admin_cli::{
    backend::BackendClient,
    chain::ChainClient,
    config::{default_config_path, load_runtime_config, InitConfigFile, Preset},
};
use sss_domain::{LifecycleRequest, LifecycleRequestType, LifecycleStatus};

use crate::services::{
    audit::AuditViewModel, compliance::ComplianceViewModel, governance::GovernanceViewModel,
    overview::OverviewViewModel, settings::SettingsViewModel,
};

pub enum RuntimeState {
    Ready(AppRuntime),
    Error(String),
}

pub struct AppRuntime {
    config: InitConfigFile,
    config_path: String,
    mint: String,
    mint_pubkey: Pubkey,
    rpc_url: String,
    api_url: Option<String>,
}

impl AppRuntime {
    pub fn load() -> RuntimeState {
        match Self::try_load() {
            Ok(runtime) => RuntimeState::Ready(runtime),
            Err(error) => RuntimeState::Error(format!("{error:#}")),
        }
    }

    fn try_load() -> Result<Self> {
        let config = load_runtime_config()?.context("config.toml not found; set SSS_CONFIG or create config.toml")?;
        let mint = resolve_mint(Some(&config))?;
        let mint_pubkey = mint
            .parse()
            .with_context(|| format!("invalid mint pubkey in config/env: {mint}"))?;
        let rpc_url = resolve_rpc_url(&config)?;
        let api_url = config.api_url.clone().or_else(|| std::env::var("SSS_API_URL").ok());

        Ok(Self {
            config,
            config_path: default_config_path().display().to_string(),
            mint,
            mint_pubkey,
            rpc_url,
            api_url,
        })
    }

    pub fn load_overview(&self) -> Result<OverviewViewModel> {
        let chain = ChainClient::from_runtime(Some(&self.config), None)?;
        let status = chain.get_status(self.mint_pubkey)?;
        let holders = chain.list_holders(self.mint_pubkey, None)?;
        let api_ready = BackendClient::from_runtime(Some(&self.config)).is_ok();
        Ok(OverviewViewModel::from_runtime(self, status, holders, api_ready))
    }

    pub fn load_operations(
        &self,
        status: Option<LifecycleStatus>,
        type_: Option<LifecycleRequestType>,
    ) -> Result<Vec<LifecycleRequest>> {
        let backend = BackendClient::from_runtime(Some(&self.config))?;
        backend.list_operations(Some(self.mint.clone()), status, type_, Some(50))
    }

    pub fn load_compliance(&self) -> Result<ComplianceViewModel> {
        let chain = ChainClient::from_runtime(Some(&self.config), None)?;
        let status = chain.get_status(self.mint_pubkey)?;
        Ok(ComplianceViewModel::from_status(status))
    }

    pub fn load_governance(&self) -> Result<GovernanceViewModel> {
        let chain = ChainClient::from_runtime(Some(&self.config), None)?;
        let roles = chain.get_roles(self.mint_pubkey)?;
        let minters = chain.list_minters(self.mint_pubkey)?;
        Ok(GovernanceViewModel::from_chain(&self.mint, roles, minters))
    }

    pub fn load_audit(&self, event_type: Option<&str>, limit: u32) -> Result<AuditViewModel> {
        let backend = BackendClient::from_runtime(Some(&self.config))?;
        let events = backend.list_mint_events(&self.mint, event_type, None, None, Some(limit))?;
        Ok(AuditViewModel::from_events(&self.mint, event_type, events))
    }

    pub fn load_settings(&self) -> SettingsViewModel {
        SettingsViewModel {
            config_path: self.config_path.clone(),
            mint: self.mint.clone(),
            rpc_url: self.rpc_url.clone(),
            api_url: self
                .api_url
                .clone()
                .unwrap_or_else(|| "missing".to_string()),
            authority_keypair: self
                .config
                .authority_keypair
                .clone()
                .unwrap_or_else(|| "~/.config/solana/id.json".to_string()),
            preset: format!("{:?}", self.config.preset),
        }
    }

    pub fn approve_operation(&self, id: &str) -> Result<LifecycleRequest> {
        let backend = BackendClient::from_runtime(Some(&self.config))?;
        let approved_by = std::env::var("USER").unwrap_or_else(|_| "sss-admin".to_string());
        backend.approve_operation(id, &approved_by)
    }

    pub fn execute_operation(&self, id: &str) -> Result<LifecycleRequest> {
        let backend = BackendClient::from_runtime(Some(&self.config))?;
        backend.execute_operation(id)
    }

    pub fn create_mint_request(
        &self,
        recipient: String,
        amount: i128,
        reason: Option<String>,
    ) -> Result<LifecycleRequest> {
        let backend = BackendClient::from_runtime(Some(&self.config))?;
        backend.create_mint_request(self.mint.clone(), recipient, amount, reason)
    }

    pub fn create_burn_request(
        &self,
        account: Option<String>,
        amount: i128,
        reason: Option<String>,
    ) -> Result<LifecycleRequest> {
        let backend = BackendClient::from_runtime(Some(&self.config))?;
        backend.create_burn_request(self.mint.clone(), account, amount, reason)
    }

    pub fn pause_mint(&self) -> Result<String> {
        let chain = ChainClient::from_runtime(Some(&self.config), None)?;
        chain.pause(self.mint_pubkey).map(|sig| sig.to_string())
    }

    pub fn unpause_mint(&self) -> Result<String> {
        let chain = ChainClient::from_runtime(Some(&self.config), None)?;
        chain.unpause(self.mint_pubkey).map(|sig| sig.to_string())
    }

    pub fn freeze_account(&self, token_account: &str) -> Result<String> {
        let account: Pubkey = token_account
            .parse()
            .with_context(|| format!("invalid token account pubkey: {token_account}"))?;
        let chain = ChainClient::from_runtime(Some(&self.config), None)?;
        chain
            .freeze_account(self.mint_pubkey, account)
            .map(|sig| sig.to_string())
    }

    pub fn thaw_account(&self, token_account: &str) -> Result<String> {
        let account: Pubkey = token_account
            .parse()
            .with_context(|| format!("invalid token account pubkey: {token_account}"))?;
        let chain = ChainClient::from_runtime(Some(&self.config), None)?;
        chain
            .thaw_account(self.mint_pubkey, account)
            .map(|sig| sig.to_string())
    }

    pub fn add_to_blacklist(&self, wallet: &str, reason: &str) -> Result<String> {
        let wallet: Pubkey = wallet
            .parse()
            .with_context(|| format!("invalid wallet pubkey: {wallet}"))?;
        let chain = ChainClient::from_runtime(Some(&self.config), None)?;
        chain
            .add_to_blacklist(self.mint_pubkey, wallet, reason.to_string())
            .map(|sig| sig.to_string())
    }

    pub fn remove_from_blacklist(&self, wallet: &str) -> Result<String> {
        let wallet: Pubkey = wallet
            .parse()
            .with_context(|| format!("invalid wallet pubkey: {wallet}"))?;
        let chain = ChainClient::from_runtime(Some(&self.config), None)?;
        chain
            .remove_from_blacklist(self.mint_pubkey, wallet)
            .map(|sig| sig.to_string())
    }

    pub fn seize_tokens(&self, from: &str, to: &str, amount: Option<&str>) -> Result<String> {
        let from: Pubkey = from
            .parse()
            .with_context(|| format!("invalid source token account pubkey: {from}"))?;
        let to: Pubkey = to
            .parse()
            .with_context(|| format!("invalid destination token account pubkey: {to}"))?;
        let amount = amount
            .map(|raw| {
                raw.parse::<u64>()
                    .with_context(|| format!("invalid seize amount: {raw}"))
            })
            .transpose()?;
        let chain = ChainClient::from_runtime(Some(&self.config), None)?;
        chain
            .seize(self.mint_pubkey, from, to, amount)
            .map(|sig| sig.to_string())
    }

    pub fn short_mint(&self) -> String {
        shorten(&self.mint)
    }

    pub fn rpc_label(&self) -> String {
        shorten(&self.rpc_url)
    }

    pub fn api_label(&self) -> String {
        self.api_url
            .as_deref()
            .map(shorten)
            .unwrap_or_else(|| "missing".to_string())
    }

    pub fn config(&self) -> &InitConfigFile {
        &self.config
    }

    pub fn is_sss2(&self) -> bool {
        self.config.preset == Preset::Sss2
    }

    pub fn mint(&self) -> &str {
        &self.mint
    }

    pub fn rpc_url(&self) -> &str {
        &self.rpc_url
    }

    pub fn api_url(&self) -> Option<&str> {
        self.api_url.as_deref()
    }

    #[cfg(test)]
    pub fn test_only(
        config: InitConfigFile,
        mint: String,
        mint_pubkey: Pubkey,
        rpc_url: String,
        api_url: Option<String>,
    ) -> Self {
        Self {
            config,
            config_path: default_config_path().display().to_string(),
            mint,
            mint_pubkey,
            rpc_url,
            api_url,
        }
    }
}

fn resolve_mint(config: Option<&InitConfigFile>) -> Result<String> {
    config
        .and_then(|cfg| cfg.mint.clone())
        .or_else(|| std::env::var("SSS_MINT").ok())
        .context("mint must be provided in config.toml or SSS_MINT")
}

fn resolve_rpc_url(config: &InitConfigFile) -> Result<String> {
    config
        .rpc_url
        .clone()
        .or_else(|| std::env::var("SOLANA_RPC_URL").ok())
        .context("rpc_url must be provided in config.toml or SOLANA_RPC_URL")
}

fn shorten(value: &str) -> String {
    const WIDTH: usize = 28;
    if value.len() <= WIDTH {
        value.to_string()
    } else {
        format!("{}...{}", &value[..12], &value[value.len() - 12..])
    }
}
