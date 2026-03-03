# Security Model — Solana Stablecoin Standard (SSS)

## Threat Model

SSS is designed to be deployed by stablecoin issuers who need to meet regulatory obligations (OFAC compliance, investor protection laws, insolvency proceedings). The primary adversaries are:

1. **Compromised minter keys** — minters who mint beyond their authorization
2. **Compromised admin keys** — attacker who takes over the admin role
3. **Blacklist bypass** — token holder who attempts to transfer despite being blacklisted
4. **Reentrancy / cross-program exploits** — malicious programs that try to exploit the hook or seize flow
5. **Integer overflow** — arithmetic errors in accounting fields
6. **Front-running** — race conditions in time-sensitive operations (seize)

Trusted parties: the admin, and any role holders explicitly granted by the admin. All other accounts and callers are untrusted.

---

## Attack Vectors and Mitigations

### Authority Escalation

**Vector:** An attacker calls a privileged instruction (e.g. `mint_to`, `seize`) without holding the required role.

**Mitigation:**
- Every privileged instruction requires a `RoleAccount` PDA derived from `["sss_role", config, signer, role_discriminant]`. The PDA can only be created by the admin via `grant_role`. An attacker cannot forge the PDA seeds because they do not include any attacker-controlled nonce — the role discriminant is a fixed enum value, and the config is derived from the mint.
- Admin-only instructions verify `signer == config.admin` inline via Anchor `constraint`.
- No instruction upgrades a role or grants itself elevated privileges.

### Blacklist Bypass

**Vector:** A blacklisted wallet attempts a token transfer by calling `spl_token_2022::transfer_checked` directly, bypassing sss-core.

**Mitigation:**
- The `TransferHook` extension is registered on the mint. Token-2022 runtime always invokes the hook program when processing transfers, regardless of the caller. The hook checks `BlacklistEntry` PDAs for both sender and recipient and reverts with `Blacklisted` if either exists.
- The hook authority in `HookConfig` is the sss-core config PDA. Only sss-core (via `invoke_signed`) can add/remove blacklist entries. No other caller can impersonate the config PDA.
- `DefaultAccountState(Frozen)` means new accounts cannot receive tokens at all until explicitly thawed by a ComplianceOfficer, providing a second layer of defense.

### Reentrancy

**Vector:** A malicious token account owner creates a program that is invoked during the hook's execution and re-enters sss-core or sss-transfer-hook.

**Mitigation:**
- The `transfer_hook` instruction in sss-transfer-hook only reads PDA account data; it does not perform any CPI calls or state mutations.
- Solana's runtime prevents reentrancy into the same program within the same transaction via the account borrow model (accounts locked for write cannot be re-borrowed mutably).
- sss-core's `seize` instruction sequences operations atomically in a single instruction (thaw → burn → freeze → mint); there is no intermediate state an attacker can exploit.

### Integer Overflow

**Vector:** `total_minted`, `total_burned`, `total_seized`, or `allowance` wraps around due to unchecked arithmetic.

**Mitigation:**
- All arithmetic on these fields uses `checked_add` / `checked_sub` with `ok_or(SssError::Overflow)`. Any overflow causes the instruction to revert rather than produce incorrect state.
- Allowance decrement in `mint_to` uses `checked_sub`; the check `amount <= role_account.allowance` happens before the subtraction.

### Seize Front-Running

**Vector:** Between the time a compliance officer identifies a frozen account and the time the `seize` instruction executes, the account owner unfreezes (or transfers) tokens using another path.

**Mitigation:**
- Accounts with `DefaultAccountState(Frozen)` can only be thawed by the config PDA (freeze authority). No user can thaw their own account.
- The seize instruction itself performs the thaw as its first atomic step, so the thaw-burn-freeze-mint sequence cannot be interrupted by an external actor.
- The `PermanentDelegate` (config PDA) can burn from the account even in the frozen state, providing a further fallback.

### Admin Key Compromise

**Vector:** An attacker gains access to the current admin private key and attempts to take over the stablecoin.

**Mitigation:**
- The two-step admin transfer (`transfer_admin` + `accept_admin`) means a compromised admin key can nominate a new admin, but the new admin must separately sign `accept_admin`. If the legitimate team holds the new admin key, they can accept the transfer and immediately call `transfer_admin` again to a known-safe key.
- The admin key does not hold the mint authority, freeze authority, or permanent delegate — these are all held by the config PDA. A compromised admin key cannot directly mint, burn, freeze, or seize without going through sss-core's instruction logic (which enforces all checks).
- Recommended operational practice: hold the admin key in a multisig (e.g., Squads) so that any admin action requires M-of-N signers.

### Pause Bypass

**Vector:** An attacker calls `mint_to` or `seize` while the protocol is paused.

**Mitigation:**
- `mint_to`, `burn_from`, and `seize` all check `!config.paused` at the start of the handler and revert with `Paused` if true.
- The pause bit is stored on the `StablecoinConfig` account, which is derived from the mint. Modifying it requires a valid `pause` or `unpause` instruction signed by the admin or a `Pauser` role holder.

### Unauthorized Hook CPI

**Vector:** An external program calls `sss-transfer-hook::add_to_blacklist` directly without going through sss-core, attempting to blacklist an arbitrary wallet.

**Mitigation:**
- `add_to_blacklist` requires `authority` to sign the transaction. The `authority` is validated against `HookConfig.authority`, which is set to the sss-core config PDA at initialization.
- The config PDA can only sign via `invoke_signed` in sss-core (since its seeds `["sss_config", mint, bump]` are known only to the deployed sss-core program). External programs cannot generate a valid signature for the config PDA.

---

## Audit Recommendations

1. **Verify PDA derivation consistency** — Confirm that the seed constants (`b"sss_config"`, `b"sss_role"`, `b"hook_config"`, `b"blacklist"`, `b"extra-account-metas"`) are used identically across the Rust programs and the TypeScript SDK. A mismatch would cause PDA lookups to silently fail.

2. **Test hook invocation with direct SPL transfers** — Write integration tests that call `spl_token_2022::transfer_checked` directly (bypassing sss-core) and confirm the hook reverts for blacklisted accounts.

3. **Test DefaultAccountState enforcement** — Confirm that newly created ATAs for SSS-2/SSS-3 mints cannot receive tokens before being explicitly thawed.

4. **Allowance edge cases** — Test `mint_to` with `allowance == u64::MAX - 1` to confirm no overflow. Test `increment_allowance` that would cause `allowance` to overflow.

5. **Seize with zero balance** — Test `seize(0)` is rejected by the `require!(amount > 0)` guard, and test seize of an amount larger than the account balance is rejected by the burn CPI.

6. **Admin transfer cancellation** — Test that calling `transfer_admin(new_key)` twice overwrites the pending admin correctly, and that the previous pending admin cannot call `accept_admin` after being replaced.

7. **Reentrancy via malicious transfer hook program** — Although SSS-3 registers its own hook, test that substituting a malicious hook program is impossible after initialization (the `TransferHookAuthority` is the config PDA; only sss-core can update it).

8. **ConfidentialTransferMint (SSS-3)** — Before enabling full confidential transfers, audit the ElGamal key registration flow, auditor key management, and the interaction between `DefaultAccountState(Frozen)` and confidential balance states. Ensure the auditor key is held in a hardware-secured environment.

9. **Upgrade authority** — Verify that the deployed programs use an upgrade authority that is held in a multisig. Consider setting upgrade authority to `None` after a sufficient audit period.

10. **Event completeness** — All state-changing instructions emit events. Confirm that off-chain indexers consume all event types and that the event schema matches the on-chain IDL.
