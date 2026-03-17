use solana_sdk::{program_option::COption, signature::Signer};
use spl_token_2022::{
    extension::{
        default_account_state::DefaultAccountState, mint_close_authority::MintCloseAuthority,
        permanent_delegate::PermanentDelegate, transfer_hook::TransferHook,
        BaseStateWithExtensions, StateWithExtensionsOwned,
    },
    state::{AccountState, Mint as Token2022Mint},
};
use stablecoin::{
    self,
    instructions::initialize::InitializeParams,
    state::{RoleConfig, StablecoinConfig},
};

use sss_litesvm_tests::common::{
    config_pda, deserialize_anchor_account, extra_account_meta_list_pda, funded_keypair,
    initialize_hook_config_ix, initialize_ix, new_svm, roles_pda, send_tx,
};

fn read_mint(
    svm: &litesvm::LiteSVM,
    mint: &solana_sdk::pubkey::Pubkey,
) -> StateWithExtensionsOwned<Token2022Mint> {
    let account = svm.get_account(mint).expect("mint should exist");
    StateWithExtensionsOwned::<Token2022Mint>::unpack(account.data).expect("mint should unpack")
}

#[test]
fn initialize_sss1_configures_core_mint_without_compliance_extensions() {
    let mut svm = new_svm();
    let authority = funded_keypair(&mut svm);
    let mint = solana_sdk::signature::Keypair::new();
    let mint_pubkey = mint.pubkey();

    let params = InitializeParams {
        name: "Simple USD".to_string(),
        symbol: "SUSD".to_string(),
        uri: "https://example.com/simple.json".to_string(),
        decimals: 6,
        enable_permanent_delegate: false,
        enable_transfer_hook: false,
        default_account_frozen: false,
    };

    let result = send_tx(
        &mut svm,
        &authority,
        &[initialize_ix(
            authority.pubkey(),
            mint_pubkey,
            params.clone(),
        )],
        &[&authority, &mint],
    );
    assert!(result.is_ok(), "initialize should succeed: {result:?}");

    let config: StablecoinConfig = deserialize_anchor_account(&svm, &config_pda(&mint_pubkey));
    let roles: RoleConfig = deserialize_anchor_account(&svm, &roles_pda(&mint_pubkey));
    let mint_state = read_mint(&svm, &mint_pubkey);

    assert_eq!(config.mint, mint_pubkey);
    assert_eq!(config.authority, authority.pubkey());
    assert_eq!(config.name, params.name);
    assert_eq!(config.symbol, params.symbol);
    assert_eq!(config.uri, params.uri);
    assert_eq!(config.decimals, 6);
    assert!(!config.enable_permanent_delegate);
    assert!(!config.enable_transfer_hook);
    assert!(!config.default_account_frozen);

    assert_eq!(roles.master_authority, authority.pubkey());
    assert_eq!(roles.pauser, authority.pubkey());
    assert_eq!(roles.burner, authority.pubkey());
    assert_eq!(roles.blacklister, solana_sdk::pubkey::Pubkey::default());
    assert_eq!(roles.seizer, solana_sdk::pubkey::Pubkey::default());

    assert!(!config.paused);
    assert_eq!(config.last_changed_by, authority.pubkey());
    assert_eq!(config.last_changed_at, config.created_at);

    assert_eq!(mint_state.base.decimals, 6);
    assert_eq!(
        mint_state.base.mint_authority,
        COption::Some(config_pda(&mint_pubkey))
    );
    assert_eq!(
        mint_state.base.freeze_authority,
        COption::Some(config_pda(&mint_pubkey))
    );

    let close_authority = mint_state
        .get_extension::<MintCloseAuthority>()
        .expect("mint close authority extension");
    assert_eq!(
        Option::<solana_sdk::pubkey::Pubkey>::from(close_authority.close_authority),
        Some(config_pda(&mint_pubkey))
    );
    assert!(mint_state.get_extension::<PermanentDelegate>().is_err());
    assert!(mint_state.get_extension::<TransferHook>().is_err());
    assert!(svm
        .get_account(&extra_account_meta_list_pda(&mint_pubkey))
        .is_none());
}

#[test]
fn initialize_sss2_enables_permanent_delegate_hook_and_default_frozen_state() {
    let mut svm = new_svm();
    let authority = funded_keypair(&mut svm);
    let mint = solana_sdk::signature::Keypair::new();
    let mint_pubkey = mint.pubkey();

    let params = InitializeParams {
        name: "Regulated USD".to_string(),
        symbol: "RUSD".to_string(),
        uri: "https://example.com/regulated.json".to_string(),
        decimals: 6,
        enable_permanent_delegate: true,
        enable_transfer_hook: true,
        default_account_frozen: true,
    };

    assert!(
        send_tx(
            &mut svm,
            &authority,
            &[initialize_hook_config_ix(authority.pubkey(), stablecoin::ID)],
            &[&authority],
        )
        .is_ok(),
        "initialize_hook_config should succeed"
    );
    let result = send_tx(
        &mut svm,
        &authority,
        &[initialize_ix(
            authority.pubkey(),
            mint_pubkey,
            params.clone(),
        )],
        &[&authority, &mint],
    );
    assert!(result.is_ok(), "initialize should succeed: {result:?}");

    let config: StablecoinConfig = deserialize_anchor_account(&svm, &config_pda(&mint_pubkey));
    let roles: RoleConfig = deserialize_anchor_account(&svm, &roles_pda(&mint_pubkey));
    let mint_state = read_mint(&svm, &mint_pubkey);
    let extra_meta = svm
        .get_account(&extra_account_meta_list_pda(&mint_pubkey))
        .expect("extra account metas PDA should exist");

    assert!(config.is_sss2());
    assert!(config.default_account_frozen);
    assert_eq!(roles.blacklister, authority.pubkey());
    assert_eq!(roles.seizer, authority.pubkey());

    let permanent_delegate = mint_state
        .get_extension::<PermanentDelegate>()
        .expect("permanent delegate extension");
    assert_eq!(
        Option::<solana_sdk::pubkey::Pubkey>::from(permanent_delegate.delegate),
        Some(config_pda(&mint_pubkey))
    );

    let transfer_hook = mint_state
        .get_extension::<TransferHook>()
        .expect("transfer hook extension");
    assert_eq!(
        Option::<solana_sdk::pubkey::Pubkey>::from(transfer_hook.authority),
        Some(config_pda(&mint_pubkey))
    );
    assert_eq!(
        Option::<solana_sdk::pubkey::Pubkey>::from(transfer_hook.program_id),
        Some(transfer_hook::ID)
    );

    let default_state = mint_state
        .get_extension::<DefaultAccountState>()
        .expect("default account state extension");
    assert_eq!(default_state.state, AccountState::Frozen as u8);

    assert_eq!(extra_meta.owner, transfer_hook::ID);
    assert!(!extra_meta.data.is_empty());
}

#[test]
fn initialize_rejects_transfer_hook_without_permanent_delegate() {
    let mut svm = new_svm();
    let authority = funded_keypair(&mut svm);
    let mint = solana_sdk::signature::Keypair::new();

    let result = send_tx(
        &mut svm,
        &authority,
        &[initialize_ix(
            authority.pubkey(),
            mint.pubkey(),
            InitializeParams {
                name: "Invalid USD".to_string(),
                symbol: "IUSD".to_string(),
                uri: "https://example.com/invalid.json".to_string(),
                decimals: 6,
                enable_permanent_delegate: false,
                enable_transfer_hook: true,
                default_account_frozen: false,
            },
        )],
        &[&authority, &mint],
    );

    assert!(result.is_err(), "initialize should reject invalid preset");
    assert!(svm.get_account(&mint.pubkey()).is_none());
    assert!(svm.get_account(&config_pda(&mint.pubkey())).is_none());
}
