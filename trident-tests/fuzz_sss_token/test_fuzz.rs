use fuzz_accounts::*;
use sss_token_program::entry as sss_token_entry;
use spl_token_2022::instruction as token_2022_ix;
use trident_fuzz::fuzzing::solana_sdk::system_instruction;
use trident_fuzz::fuzzing::*;

mod fuzz_accounts;
mod types;

use types::*;

#[derive(Default)]
struct FlowStats {
    attempted: u64,
    succeeded: u64,
    failed: u64,
    skipped: u64,
}

impl FlowStats {
    fn record_result(&mut self, success: bool) {
        self.attempted += 1;
        if success {
            self.succeeded += 1;
        } else {
            self.failed += 1;
        }
    }

    fn record_skipped(&mut self) {
        self.skipped += 1;
    }

    fn success_ratio(&self) -> f64 {
        if self.attempted == 0 {
            return 0.0;
        }
        self.succeeded as f64 / self.attempted as f64
    }
}

#[derive(Default)]
struct FlowMetrics {
    add_minter: FlowStats,
    increase_minter_quota: FlowStats,
    remove_minter: FlowStats,
    update_roles: FlowStats,
    propose_authority: FlowStats,
    accept_authority: FlowStats,
    pause: FlowStats,
    unpause: FlowStats,
    mint: FlowStats,
    burn: FlowStats,
    freeze_account: FlowStats,
    thaw_account: FlowStats,
}

#[derive(FuzzTestMethods)]
struct FuzzTest {
    trident: Trident,
    fuzz_accounts: AccountAddresses,
    flow_metrics: FlowMetrics,
    active_minter: Option<Pubkey>,
    token_frozen: bool,
}

#[flow_executor]
impl FuzzTest {
    fn new() -> Self {
        let mut trident = Trident::default();
        let program = TridentEntrypoint::new(
            sss_token::program_id(),
            None,
            processor!(sss_token_entry),
        );
        trident.deploy_entrypoint(program);

        Self {
            trident,
            fuzz_accounts: AccountAddresses::default(),
            flow_metrics: FlowMetrics::default(),
            active_minter: None,
            token_frozen: false,
        }
    }

    fn token_program_id(&self) -> Pubkey {
        spl_token_2022::id()
    }

    fn authority_pk(&mut self) -> Pubkey {
        if let Some(state_authority) = self.current_authority_from_state() {
            if let Some(previous_authority) = self.fuzz_accounts.current_authority.get(&mut self.trident)
            {
                self.fuzz_accounts.current_authority.remove(&previous_authority);
            }
            self.fuzz_accounts
                .current_authority
                .insert_with_address(state_authority);
            return state_authority;
        }

        self.fuzz_accounts
            .current_authority
            .get(&mut self.trident)
            .expect("current authority must be initialized")
    }

    fn current_authority_from_state(&mut self) -> Option<Pubkey> {
        let state_pk = self.fuzz_accounts.state.get(&mut self.trident)?;
        let state = self
            .trident
            .get_account_with_type::<sss_token::StablecoinState>(&state_pk, None)?;
        Some(state.master_authority)
    }

    fn pending_authority_from_state(&mut self) -> Option<Pubkey> {
        let state_pk = self.fuzz_accounts.state.get(&mut self.trident)?;
        let state = self
            .trident
            .get_account_with_type::<sss_token::StablecoinState>(&state_pk, None)?;
        state.pending_authority
    }

    fn sync_roles_for_authority(&mut self, authority_pk: Pubkey, state_pk: Pubkey) {
        let update_roles_ix = sss_token::UpdateRolesInstruction::data(
            sss_token::UpdateRolesInstructionData {
                role_update: sss_token::RoleUpdate {
                    pauser: Some(authority_pk),
                    freezer: Some(authority_pk),
                    burner: Some(authority_pk),
                    blacklister: None,
                    seizer: None,
                },
            },
        )
        .accounts(sss_token::UpdateRolesInstructionAccounts::new(
            authority_pk,
            state_pk,
        ))
        .instruction();

        let _ = self
            .trident
            .process_transaction(&[update_roles_ix], Some("sync_roles_for_authority"));
    }

    fn try_unpause_for_token_flows(&mut self) {
        let authority_pk = self.authority_pk();
        let state_pk = self.ensure_state();

        let unpause_ix =
            sss_token::UnpauseInstruction::data(sss_token::UnpauseInstructionData {})
                .accounts(sss_token::UnpauseInstructionAccounts::new(authority_pk, state_pk))
                .instruction();

        let _ = self
            .trident
            .process_transaction(&[unpause_ix], Some("pre_token_flow_unpause"));
    }

    fn mint_pk(&mut self) -> Pubkey {
        self.fuzz_accounts
            .mint
            .get(&mut self.trident)
            .expect("mint must be initialized")
    }

    fn ensure_state(&mut self) -> Pubkey {
        if let Some(state_pk) = self.fuzz_accounts.state.get(&mut self.trident) {
            return state_pk;
        }

        let mint_pk = self.mint_pk();
        let program_id = sss_token::program_id();

        self.fuzz_accounts.state.insert(
            &mut self.trident,
            Some(PdaSeeds::new(&[b"stablecoin", mint_pk.as_ref()], program_id)),
        )
    }

    fn setup_token_2022_accounts(&mut self, payer: Pubkey, mint_pk: Pubkey) {
        let state_pk = self.ensure_state();
        let token_program = self.token_program_id();

        let (mint_authority_pk, _) = self.trident.find_program_address(
            &[b"mint_authority", state_pk.as_ref()],
            &sss_token::program_id(),
        );
        self.fuzz_accounts
            .mint_authority
            .insert_with_address(mint_authority_pk);

        let (freeze_authority_pk, _) = self.trident.find_program_address(
            &[b"freeze_authority", state_pk.as_ref()],
            &sss_token::program_id(),
        );
        self.fuzz_accounts
            .freeze_authority
            .insert_with_address(freeze_authority_pk);

        let (permanent_delegate_pk, _) = self.trident.find_program_address(
            &[b"permanent_delegate", state_pk.as_ref()],
            &sss_token::program_id(),
        );
        self.fuzz_accounts
            .permanent_delegate
            .insert_with_address(permanent_delegate_pk);

        let recipient_token_account = self
            .fuzz_accounts
            .recipient_token_account
            .insert(&mut self.trident, None);

        self.fuzz_accounts
            .from_token_account
            .insert_with_address(recipient_token_account);
        self.fuzz_accounts
            .token_account
            .insert_with_address(recipient_token_account);

        let create_mint_ix = system_instruction::create_account(
            &payer,
            &mint_pk,
            LAMPORTS_PER_SOL,
            82,
            &token_program,
        );

        let initialize_mint_ix = token_2022_ix::initialize_mint2(
            &token_program,
            &mint_pk,
            &mint_authority_pk,
            Some(&freeze_authority_pk),
            6,
        )
        .expect("initialize_mint2 must build");

        let create_recipient_token_ix = system_instruction::create_account(
            &payer,
            &recipient_token_account,
            LAMPORTS_PER_SOL,
            165,
            &token_program,
        );

        let initialize_recipient_token_ix = token_2022_ix::initialize_account3(
            &token_program,
            &recipient_token_account,
            &mint_pk,
            &payer,
        )
        .expect("initialize_account3 must build");

        let _ = self.trident.process_transaction(
            &[
                create_mint_ix,
                initialize_mint_ix,
                create_recipient_token_ix,
                initialize_recipient_token_ix,
            ],
            Some("token_2022_bootstrap"),
        );
    }

    fn ensure_minter_ready(&mut self, minter_pk: Pubkey, state_pk: Pubkey) -> Option<Pubkey> {
        let (minter_info_pk, _) = self.trident.find_program_address(
            &[b"minter", state_pk.as_ref(), minter_pk.as_ref()],
            &sss_token::program_id(),
        );

        self.fuzz_accounts
            .minter_info
            .insert_with_address(minter_info_pk);

        let authority_pk = self.authority_pk();
        let add_minter_ix = sss_token::AddMinterInstruction::data(
            sss_token::AddMinterInstructionData { quota: 1_000_000 },
        )
        .accounts(sss_token::AddMinterInstructionAccounts::new(
            authority_pk,
            state_pk,
            minter_pk,
            minter_info_pk,
        ))
        .instruction();

        let result = self
            .trident
            .process_transaction(&[add_minter_ix], Some("ensure_minter_ready"));

        if result.is_success() {
            self.active_minter = Some(minter_pk);
            Some(minter_info_pk)
        } else {
            None
        }
    }

    #[init]
    fn start(&mut self) {
        let master_authority = self.fuzz_accounts.master_authority.insert(&mut self.trident, None);
        let mint_pk = self.fuzz_accounts.mint.insert(&mut self.trident, None);

        self.fuzz_accounts.authority.insert_with_address(master_authority);
        self.fuzz_accounts
            .current_authority
            .insert_with_address(master_authority);

        let state_pk = self.ensure_state();

        self.trident.airdrop(&master_authority, 10 * LAMPORTS_PER_SOL);

        let (_, bump) = self.trident.find_program_address(
            &[b"stablecoin", mint_pk.as_ref()],
            &sss_token::program_id(),
        );

        let state = sss_token::StablecoinState::new(
            master_authority,
            Some(master_authority),
            mint_pk,
            "FuzzToken".to_string(),
            "FZZ".to_string(),
            "https://fuzz.test".to_string(),
            6,
            false,
            true,
            false,
            false,
            false,
            0,
            0,
            Some(master_authority),
            Some(master_authority),
            Some(master_authority),
            None,
            None,
            None,
            bump,
        );

        self.trident
            .set_account_with_type(&state_pk, &sss_token::program_id(), &state, None);

        self.setup_token_2022_accounts(master_authority, mint_pk);
    }

    #[flow]
    fn flow_add_minter(&mut self) {
        let authority_pk = self.authority_pk();
        let state_pk = self.ensure_state();

        let minter_pk = self
            .active_minter
            .unwrap_or_else(|| self.fuzz_accounts.minter.insert(&mut self.trident, None));
        let (minter_info_pk, _) = self.trident.find_program_address(
            &[b"minter", state_pk.as_ref(), minter_pk.as_ref()],
            &sss_token::program_id(),
        );
        self.fuzz_accounts
            .minter_info
            .insert_with_address(minter_info_pk);

        let quota = self.trident.random_from_range(1..=1_000_000u64);
        let add_minter_ix = sss_token::AddMinterInstruction::data(
            sss_token::AddMinterInstructionData { quota },
        )
        .accounts(sss_token::AddMinterInstructionAccounts::new(
            authority_pk,
            state_pk,
            minter_pk,
            minter_info_pk,
        ))
        .instruction();

        let result = self
            .trident
            .process_transaction(&[add_minter_ix], Some("add_minter"));
        self.flow_metrics
            .add_minter
            .record_result(result.is_success());

        if result.is_success() {
            self.active_minter = Some(minter_pk);
        }
    }

    #[flow]
    fn flow_increase_minter_quota(&mut self) {
        let Some(minter_pk) = self.active_minter else {
            self.flow_metrics.increase_minter_quota.record_skipped();
            return;
        };

        let authority_pk = self.authority_pk();
        let state_pk = self.ensure_state();
        let (minter_info_pk, _) = self.trident.find_program_address(
            &[b"minter", state_pk.as_ref(), minter_pk.as_ref()],
            &sss_token::program_id(),
        );

        let additional_quota = self.trident.random_from_range(1..=100_000u64);
        let increase_ix = sss_token::IncreaseMinterQuotaInstruction::data(
            sss_token::IncreaseMinterQuotaInstructionData { additional_quota },
        )
        .accounts(sss_token::IncreaseMinterQuotaInstructionAccounts::new(
            authority_pk,
            state_pk,
            minter_pk,
            minter_info_pk,
        ))
        .instruction();

        let result = self
            .trident
            .process_transaction(&[increase_ix], Some("increase_minter_quota"));
        self.flow_metrics
            .increase_minter_quota
            .record_result(result.is_success());
    }

    #[flow]
    fn flow_remove_minter(&mut self) {
        let Some(minter_pk) = self.active_minter else {
            self.flow_metrics.remove_minter.record_skipped();
            return;
        };

        let authority_pk = self.authority_pk();
        let state_pk = self.ensure_state();
        let (minter_info_pk, _) = self.trident.find_program_address(
            &[b"minter", state_pk.as_ref(), minter_pk.as_ref()],
            &sss_token::program_id(),
        );

        let remove_ix = sss_token::RemoveMinterInstruction::data(
            sss_token::RemoveMinterInstructionData {},
        )
        .accounts(sss_token::RemoveMinterInstructionAccounts::new(
            authority_pk,
            state_pk,
            minter_pk,
            minter_info_pk,
        ))
        .instruction();

        let result = self
            .trident
            .process_transaction(&[remove_ix], Some("remove_minter"));
        self.flow_metrics
            .remove_minter
            .record_result(result.is_success());

        if result.is_success() {
            self.active_minter = None;
        }
    }

    #[flow]
    fn flow_update_roles(&mut self) {
        let authority_pk = self.authority_pk();
        let state_pk = self.ensure_state();

        let update_roles_ix = sss_token::UpdateRolesInstruction::data(
            sss_token::UpdateRolesInstructionData {
                role_update: sss_token::RoleUpdate {
                    pauser: Some(authority_pk),
                    freezer: Some(authority_pk),
                    burner: Some(authority_pk),
                    blacklister: None,
                    seizer: None,
                },
            },
        )
        .accounts(sss_token::UpdateRolesInstructionAccounts::new(
            authority_pk,
            state_pk,
        ))
        .instruction();

        let result = self
            .trident
            .process_transaction(&[update_roles_ix], Some("update_roles"));
        self.flow_metrics
            .update_roles
            .record_result(result.is_success());
    }

    #[flow]
    fn flow_propose_authority(&mut self) {
        let current_authority = self.authority_pk();
        let state_pk = self.ensure_state();
        let proposed_authority = self
            .fuzz_accounts
            .proposed_authority
            .insert(&mut self.trident, None);
        self.trident
            .airdrop(&proposed_authority, 2 * LAMPORTS_PER_SOL);

        let propose_ix = sss_token::ProposeAuthorityInstruction::data(
            sss_token::ProposeAuthorityInstructionData {},
        )
        .accounts(sss_token::ProposeAuthorityInstructionAccounts::new(
            current_authority,
            proposed_authority,
            state_pk,
        ))
        .instruction();

        let result = self
            .trident
            .process_transaction(&[propose_ix], Some("propose_authority"));
        self.flow_metrics
            .propose_authority
            .record_result(result.is_success());
    }

    #[flow]
    fn flow_accept_authority(&mut self) {
        let Some(proposed_authority) = self.pending_authority_from_state()
        else {
            self.flow_metrics.accept_authority.record_skipped();
            return;
        };

        let state_pk = self.ensure_state();
        let accept_ix = sss_token::AcceptAuthorityInstruction::data(
            sss_token::AcceptAuthorityInstructionData {},
        )
        .accounts(sss_token::AcceptAuthorityInstructionAccounts::new(
            proposed_authority,
            state_pk,
        ))
        .instruction();

        let result = self
            .trident
            .process_transaction(&[accept_ix], Some("accept_authority"));
        self.flow_metrics
            .accept_authority
            .record_result(result.is_success());

        if result.is_success() {
            if let Some(previous_authority) = self.fuzz_accounts.current_authority.get(&mut self.trident)
            {
                self.fuzz_accounts
                    .current_authority
                    .remove(&previous_authority);
            }
            self.fuzz_accounts
                .current_authority
                .insert_with_address(proposed_authority);

            self.sync_roles_for_authority(proposed_authority, state_pk);
        }
    }

    #[flow]
    fn flow_pause(&mut self) {
        let authority_pk = self.authority_pk();
        let state_pk = self.ensure_state();

        let pause_ix = sss_token::PauseInstruction::data(sss_token::PauseInstructionData {})
            .accounts(sss_token::PauseInstructionAccounts::new(authority_pk, state_pk))
            .instruction();

        let result = self
            .trident
            .process_transaction(&[pause_ix], Some("pause"));
        self.flow_metrics.pause.record_result(result.is_success());
    }

    #[flow]
    fn flow_unpause(&mut self) {
        let authority_pk = self.authority_pk();
        let state_pk = self.ensure_state();

        let unpause_ix =
            sss_token::UnpauseInstruction::data(sss_token::UnpauseInstructionData {})
                .accounts(sss_token::UnpauseInstructionAccounts::new(authority_pk, state_pk))
                .instruction();

        let result = self
            .trident
            .process_transaction(&[unpause_ix], Some("unpause"));
        self.flow_metrics.unpause.record_result(result.is_success());
    }

    #[flow]
    fn flow_mint(&mut self) {
        self.try_unpause_for_token_flows();

        let state_pk = self.ensure_state();
        let mint_pk = self.mint_pk();

        let minter_pk = self
            .active_minter
            .unwrap_or_else(|| self.fuzz_accounts.minter.insert(&mut self.trident, None));
        let Some(minter_info_pk) = self.ensure_minter_ready(minter_pk, state_pk) else {
            self.flow_metrics.mint.record_skipped();
            return;
        };

        let recipient_token_account = self
            .fuzz_accounts
            .recipient_token_account
            .get(&mut self.trident)
            .expect("recipient token account must be initialized in start");
        let mint_authority = self
            .fuzz_accounts
            .mint_authority
            .get(&mut self.trident)
            .expect("mint authority PDA must be initialized in start");

        let amount = self.trident.random_from_range(1..=1000u64);
        let mint_ix = sss_token::MintInstruction::data(sss_token::MintInstructionData { amount })
            .accounts(sss_token::MintInstructionAccounts::new(
                minter_pk,
                state_pk,
                mint_pk,
                minter_info_pk,
                recipient_token_account,
                mint_authority,
            ))
            .instruction();

        let result = self
            .trident
            .process_transaction(&[mint_ix], Some("mint"));
        self.flow_metrics.mint.record_result(result.is_success());
    }

    #[flow]
    fn flow_burn(&mut self) {
        self.try_unpause_for_token_flows();

        let authority_pk = self
            .fuzz_accounts
            .authority
            .get(&mut self.trident)
            .expect("token account owner authority must be initialized");
        let state_pk = self.ensure_state();
        let mint_pk = self.mint_pk();

        let from_token_account = self
            .fuzz_accounts
            .from_token_account
            .get(&mut self.trident)
            .expect("from token account must be initialized in start");
        let permanent_delegate = self
            .fuzz_accounts
            .permanent_delegate
            .get(&mut self.trident)
            .expect("permanent delegate PDA must be initialized in start");

        let amount = self.trident.random_from_range(1..=100u64);
        let burn_ix = sss_token::BurnInstruction::data(sss_token::BurnInstructionData { amount })
            .accounts(sss_token::BurnInstructionAccounts::new(
                authority_pk,
                state_pk,
                mint_pk,
                from_token_account,
                permanent_delegate,
            ))
            .instruction();

        let result = self
            .trident
            .process_transaction(&[burn_ix], Some("burn"));
        self.flow_metrics.burn.record_result(result.is_success());
    }

    #[flow]
    fn flow_freeze_account(&mut self) {
        if self.token_frozen {
            self.flow_metrics.freeze_account.record_skipped();
            return;
        }

        let authority_pk = self.authority_pk();
        let state_pk = self.ensure_state();
        let mint_pk = self.mint_pk();

        let token_account = self
            .fuzz_accounts
            .token_account
            .get(&mut self.trident)
            .expect("token account must be initialized in start");
        let freeze_authority = self
            .fuzz_accounts
            .freeze_authority
            .get(&mut self.trident)
            .expect("freeze authority PDA must be initialized in start");

        let freeze_ix = sss_token::FreezeAccountInstruction::data(
            sss_token::FreezeAccountInstructionData {},
        )
        .accounts(sss_token::FreezeAccountInstructionAccounts::new(
            authority_pk,
            state_pk,
            mint_pk,
            token_account,
            freeze_authority,
        ))
        .instruction();

        let result = self
            .trident
            .process_transaction(&[freeze_ix], Some("freeze_account"));
        self.flow_metrics
            .freeze_account
            .record_result(result.is_success());

        if result.is_success() {
            self.token_frozen = true;
        }
    }

    #[flow]
    fn flow_thaw_account(&mut self) {
        if !self.token_frozen {
            self.flow_metrics.thaw_account.record_skipped();
            return;
        }

        let authority_pk = self.authority_pk();
        let state_pk = self.ensure_state();
        let mint_pk = self.mint_pk();

        let token_account = self
            .fuzz_accounts
            .token_account
            .get(&mut self.trident)
            .expect("token account must be initialized in start");
        let freeze_authority = self
            .fuzz_accounts
            .freeze_authority
            .get(&mut self.trident)
            .expect("freeze authority PDA must be initialized in start");

        let thaw_ix = sss_token::ThawAccountInstruction::data(
            sss_token::ThawAccountInstructionData {},
        )
        .accounts(sss_token::ThawAccountInstructionAccounts::new(
            authority_pk,
            state_pk,
            mint_pk,
            token_account,
            freeze_authority,
        ))
        .instruction();

        let result = self
            .trident
            .process_transaction(&[thaw_ix], Some("thaw_account"));
        self.flow_metrics
            .thaw_account
            .record_result(result.is_success());

        if result.is_success() {
            self.token_frozen = false;
        }
    }

    #[end]
    fn end(&mut self) {
        let authority_pk = self.authority_pk();
        let mint_pk = self.mint_pk();
        let Some(state_pk) = self.fuzz_accounts.state.get(&mut self.trident) else {
            return;
        };

        let state = self
            .trident
            .get_account_with_type::<sss_token::StablecoinState>(&state_pk, None)
            .expect("state account must exist and deserialize");

        assert_eq!(state.master_authority, authority_pk);
        assert_eq!(state.mint, mint_pk);
        assert!(state.pauser.is_none() || state.pauser == Some(authority_pk));
        assert!(state.freezer.is_none() || state.freezer == Some(authority_pk));
        assert!(state.burner.is_none() || state.burner == Some(authority_pk));
        assert!(state.total_minted >= state.total_burned);

        let metrics = &self.flow_metrics;
        println!("=== FLOW METRICS ===");
        Self::print_metric("add_minter", &metrics.add_minter);
        Self::print_metric("increase_minter_quota", &metrics.increase_minter_quota);
        Self::print_metric("remove_minter", &metrics.remove_minter);
        Self::print_metric("update_roles", &metrics.update_roles);
        Self::print_metric("propose_authority", &metrics.propose_authority);
        Self::print_metric("accept_authority", &metrics.accept_authority);
        Self::print_metric("pause", &metrics.pause);
        Self::print_metric("unpause", &metrics.unpause);
        Self::print_metric("mint", &metrics.mint);
        Self::print_metric("burn", &metrics.burn);
        Self::print_metric("freeze_account", &metrics.freeze_account);
        Self::print_metric("thaw_account", &metrics.thaw_account);
        Self::print_overall(metrics);
    }

    fn print_metric(name: &str, stats: &FlowStats) {
        println!(
            "{name}: attempted={} succeeded={} failed={} skipped={} success_ratio={:.2}%",
            stats.attempted,
            stats.succeeded,
            stats.failed,
            stats.skipped,
            stats.success_ratio() * 100.0
        );
    }

    fn print_overall(metrics: &FlowMetrics) {
        let all = [
            &metrics.add_minter,
            &metrics.increase_minter_quota,
            &metrics.remove_minter,
            &metrics.update_roles,
            &metrics.propose_authority,
            &metrics.accept_authority,
            &metrics.pause,
            &metrics.unpause,
            &metrics.mint,
            &metrics.burn,
            &metrics.freeze_account,
            &metrics.thaw_account,
        ];

        let attempted: u64 = all.iter().map(|s| s.attempted).sum();
        let succeeded: u64 = all.iter().map(|s| s.succeeded).sum();
        let failed: u64 = all.iter().map(|s| s.failed).sum();
        let skipped: u64 = all.iter().map(|s| s.skipped).sum();

        let success_ratio = if attempted == 0 {
            0.0
        } else {
            (succeeded as f64 / attempted as f64) * 100.0
        };

        println!(
            "overall: attempted={} succeeded={} failed={} skipped={} success_ratio={:.2}%",
            attempted, succeeded, failed, skipped, success_ratio
        );
    }
}

fn main() {
    FuzzTest::fuzz(20, 500);
}
