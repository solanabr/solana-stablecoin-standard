# SSS Verification Bundles

## 1. Property-Based Test Cases (Hedgehog/Trident)
- **Prop_SupplyBalance**: `forall(seq_ops): sum(balances) == supply`.
- **Prop_QuotaIntegrity**: `forall(m \in Minters, amt): mint(m, amt) success => balance_change(m, amt) \land consumed_quota(m, amt)`.
- **Prop_BlacklistSanctity**: `forall(u \in Blacklist, d \notin Blacklist): transfer(u, d) => Revert`.
- **Prop_RoleExclusion**: `forall(k \in Signers): k \notin RoleRegistry(Seizer) => seize(k) => Unauthorized`.

## 2. Fuzz Targets (Trident)
- **Target_Mint_Quota**: Sequential randomized minting from multiple keys until quota exhaustion.
- **Target_Pause_Interleaving**: Flashing the `is_paused` flag while concurrent mint/burn requests are in flight.
- **Target_TransferHook_Race**: Updating the `BlacklistRegistry` while a large batch of transfers involving the same address is pending.

## 3. State Machine Assertions (Runtime)
- `assert(config.is_paused == false || (instruction != Mint && instruction != Burn))`.
- `assert(blacklist_record.exists == true => transfer_hook.action == REJECT)`.
- `assert(master_authority == current_signer || instruction != UpdateRoles)`.

## 4. Prioritized Audit Checklist
1. **[Critical]** Seize instruction must verify BlacklistRegistry PDA existence.
2. **[Critical]** Initialize instruction must verify `mint.mint_authority == payer`.
3. **[High]** Minter quota must utilize `checked_sub` and `checked_add` to prevent balance desync.
4. **[High]** Transfer Hook must not leak authority to accounts outside the SSS Core cluster.
5. **[Medium]** Master Authority rotation must require a two-step `propose -> claim` to prevent accidental locking.
