use fuzz_accounts::*;
use trident_fuzz::fuzzing::*;
mod fuzz_accounts;
mod types;
use types::*;

#[derive(FuzzTestMethods)]
struct FuzzTest {
    /// Trident client for interacting with the Solana program
    trident: Trident,
    /// Storage for all account addresses used in fuzz testing
    fuzz_accounts: AccountAddresses,
}

#[flow_executor]
impl FuzzTest {
    const ROLE_SEED: &[u8] = b"role";
    const CONFIG_SEED: &[u8] = b"config";
    const MASTER_ROLE_SEED: &[u8] = b"master";
    const MINTER_SEED: &[u8] = b"minter";
    const FREEZE_SEED: &[u8] = b"freeze";
    const PAUSE_SEED: &[u8] = b"pause";
    const SEIZER_SEED: &[u8] = b"seizer";
    const PAUSER_SEED: &[u8] = b"pauser";
    const EVENT_AUTHORITY_SEED: &[u8] = b"__event_authority";
    const TOKEN_2022_PROGRAM_ID: Pubkey = pubkey!("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");

    fn new() -> Self {
        Self {
            trident: Trident::default(),
            fuzz_accounts: AccountAddresses::default(),
        }
    }

    #[init]
    fn start(&mut self) {
        // Perform any initialization here, this method will be executed
        // at the start of each iteration
        let admin = self.fuzz_accounts.admin.insert(&mut self.trident, None);
        self.trident.airdrop(&admin, 10 * LAMPORTS_PER_SOL);

        let name = self.trident.random_string(32);
        let symbol = self.trident.random_string(32);
        let uri = self.trident.random_string(200);
        let initial_allowance = self.trident.random_from_range(0..100_000_000);
        let mint_kp = self.trident.random_keypair();
        self.fuzz_accounts
            .mint
            .insert_with_address(mint_kp.pubkey());

        let admin = self.fuzz_accounts.admin.get(&mut self.trident).unwrap();
        let config = self.fuzz_accounts.config.insert(
            &mut self.trident,
            Some(PdaSeeds::new(
                &[FuzzTest::CONFIG_SEED, mint_kp.pubkey().as_ref()],
                sss::program_id(),
            )),
        );
        let master_role = self.fuzz_accounts.master_role.insert(
            &mut self.trident,
            Some(PdaSeeds::new(
                &[
                    FuzzTest::ROLE_SEED,
                    mint_kp.pubkey().as_ref(),
                    FuzzTest::MASTER_ROLE_SEED,
                    admin.as_ref(),
                ],
                sss::program_id(),
            )),
        );
        let mint_authority = self.fuzz_accounts.mint_authority.insert(
            &mut self.trident,
            Some(PdaSeeds::new(
                &[FuzzTest::MINTER_SEED, mint_kp.pubkey().as_ref()],
                sss::program_id(),
            )),
        );
        let freeze_authority = self.fuzz_accounts.freeze_authority.insert(
            &mut self.trident,
            Some(PdaSeeds::new(
                &[FuzzTest::FREEZE_SEED, mint_kp.pubkey().as_ref()],
                sss::program_id(),
            )),
        );
        let pause_authority = self.fuzz_accounts.pause_authority.insert(
            &mut self.trident,
            Some(PdaSeeds::new(
                &[FuzzTest::PAUSE_SEED, mint_kp.pubkey().as_ref()],
                sss::program_id(),
            )),
        );
        let seizer_authority = self.fuzz_accounts.seizer_authority.insert(
            &mut self.trident,
            Some(PdaSeeds::new(
                &[FuzzTest::SEIZER_SEED, mint_kp.pubkey().as_ref()],
                sss::program_id(),
            )),
        );
        let minter_account = self.fuzz_accounts.minter_account.insert(
            &mut self.trident,
            Some(PdaSeeds::new(
                &[
                    FuzzTest::ROLE_SEED,
                    mint_kp.pubkey().as_ref(),
                    FuzzTest::MINTER_SEED,
                    admin.as_ref(),
                ],
                sss::program_id(),
            )),
        );
        let event_authority = self.fuzz_accounts.event_authority.insert(
            &mut self.trident,
            Some(PdaSeeds::new(
                &[FuzzTest::EVENT_AUTHORITY_SEED],
                sss::program_id(),
            )),
        );

        let (pauser_role, _) = pubkey::Pubkey::find_program_address(
            &[
                FuzzTest::ROLE_SEED,
                mint_kp.pubkey().as_ref(),
                FuzzTest::PAUSER_SEED,
                admin.as_ref(),
            ],
            &sss::program_id(),
        );

        let mut ixs = vec![
            sss::InitializeInstruction::data(sss::InitializeInstructionData::new(
                Standard::SSS1,
                name.clone(),
                symbol.clone(),
                uri.clone(),
                6,
                admin,
                admin,
                initial_allowance,
                None,
                None,
                None,
            ))
            .accounts(sss::InitializeInstructionAccounts {
                admin,
                mint: mint_kp.pubkey(),
                config: config,
                mint_authority,
                freeze_authority,
                seizer_authority,
                pause_authority,
                master_role,
                minter_account,
                token_program: FuzzTest::TOKEN_2022_PROGRAM_ID,
                event_authority,
                program: sss::program_id(),
            })
            .remaining_accounts(vec![AccountMeta::new(mint_kp.pubkey(), true)])
            .instruction(),
        ];

        ixs.extend(self.trident.initialize_associated_token_account_2022(
            &admin,
            &mint_kp.pubkey(),
            &admin,
            &[],
        ));

        ixs.push(
            sss::UpdateRolesInstruction::data(sss::UpdateRolesInstructionData::new(vec![
                types::UpdateRole::new("pauser".to_string(), None, admin, 0),
            ]))
            .accounts(sss::UpdateRolesInstructionAccounts::new(
                admin,
                mint_kp.pubkey(),
                master_role,
                event_authority,
                sss::program_id(),
            ))
            .remaining_accounts(vec![AccountMeta::new(pauser_role, false)])
            .instruction(),
        );

        let res = self
            .trident
            .process_transaction(&ixs, Some("Initialize SSS1 Stablecoin"));
        if res.is_success() {
            let stable_config = self.fuzz_accounts.stablecoin_config.insert(
                &mut self.trident,
                Some(PdaSeeds::new(
                    &[FuzzTest::CONFIG_SEED, mint_kp.pubkey().as_ref()],
                    sss::program_id(),
                )),
            );
            let config_account = self
                .trident
                .get_account_with_type::<types::StablecoinConfig>(&stable_config, 8);

            if let Some(config_account) = config_account {
                assert_eq!(config_account.standard, types::Standard::SSS1);
                assert_eq!(config_account.name, name);
                assert_eq!(config_account.symbol, symbol);
                assert_eq!(config_account.uri, uri);
                assert_eq!(config_account.decimals, 6);
                assert_eq!(config_account.enable_permanent_delegate, false);
                assert_eq!(config_account.enable_transfer_hook, false);
                assert_eq!(config_account.default_account_frozen, false);
            }
        }
    }

    #[flow]
    fn mint(&mut self) {
        // Perform logic which is meant to be fuzzed
        // This flow is selected randomly from other flows
        let mint = self.fuzz_accounts.mint.get(&mut self.trident).unwrap();
        let admin = self.fuzz_accounts.admin.get(&mut self.trident).unwrap();
        let (minter_account, _) = pubkey::Pubkey::find_program_address(
            &[
                FuzzTest::ROLE_SEED,
                mint.as_ref(),
                FuzzTest::MINTER_SEED,
                admin.as_ref(),
            ],
            &sss::program_id(),
        );
        let to = self.trident.get_associated_token_address(
            &mint,
            &admin,
            &FuzzTest::TOKEN_2022_PROGRAM_ID,
        );
        let minter_authority = self
            .fuzz_accounts
            .mint_authority
            .get(&mut self.trident)
            .unwrap();
        let event_authority = self
            .fuzz_accounts
            .event_authority
            .get(&mut self.trident)
            .unwrap();
        let amount = self.trident.random_from_range(0..100);
        let prev_minted = self
            .trident
            .get_account_with_type::<types::MinterAccount>(&minter_account, 8)
            .unwrap()
            .minted;

        let ix = sss::MintTokensInstruction::data(sss::MintTokensInstructionData::new(amount))
            .accounts(sss::MintTokensInstructionAccounts::new(
                admin,
                mint,
                to,
                minter_account,
                minter_authority,
                event_authority,
                sss::program_id(),
            ))
            .instruction();
        let res = self.trident.process_transaction(&[ix], Some("Mint Tokens"));
        if res.is_success() {
            let minter_account_account = self
                .trident
                .get_account_with_type::<types::MinterAccount>(&minter_account, 8);
            if let Some(minter_account_account) = minter_account_account {
                assert_eq!(minter_account_account.minted, prev_minted + amount);
            }
        }
    }

    #[end]
    fn end(&mut self) {
        // Perform any cleanup here, this method will be executed
        // at the end of each iteration
    }
}

fn main() {
    FuzzTest::fuzz(1000, 100);
}
