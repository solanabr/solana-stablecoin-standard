# SECURITY AUDIT (Stage 24)

## Scope
- `programs/sss_core/src/instructions/initialize.rs`
- `programs/sss_core/src/instructions/mint.rs`
- `programs/sss_core/src/instructions/burn.rs`
- `programs/sss_core/src/instructions/seize.rs`
- `programs/sss_core/src/lib.rs`

## Control Summary
- Added `#[access_control(...)]` on all state-changing entrypoints in `sss_core` (`initialize`, `mint_token`, `burn_token`, `seize_tokens`, `update_mock_oracle`).
- Verified PDA seed consistency:
  - Config PDA: `[b"config"]`
  - Oracle PDA: `[b"mock_oracle"]`
- Verified arithmetic hardening:
  - Oracle-adjusted mint amount uses `checked_pow`, `checked_mul`, and safe division + conversion.
- Verified no `realloc` in CPI path:
  - Mint/account allocation remains pre-allocated from SDK flow.

## Threat Model & Mitigations

### 1) Replay Attacks
**Vector**: Reusing signed transactions or replaying old instructions.

**Mitigations**:
- Solana runtime blockhash expiration prevents stale replay.
- PDA authority model (`config`) restricts privileged CPI authority to program-derived signer.
- Role checks (`minter_authority`, `burner_authority`, `seizer_authority`) gate privileged operations.

### 2) Inflation / Unauthorized Minting
**Vector**: Minting by arbitrary caller or malformed oracle math leading to overflow.

**Mitigations**:
- `mint_token` requires signer to equal `config.minter_authority`.
- Oracle path now enforces:
  - `price > 0`
  - checked math for power/multiplication/division
  - checked conversion to `u64`
- Mint authority transferred to Config PDA in creation flow.

### 3) Single-Key Compromise
**Vector**: One compromised hot key can mint/burn/seize.

**Current status**:
- Separated role fields exist in config (`minter`, `burner`, `freezer`, `seizer`) but currently initialized to admin key.

**Recommended hardening**:
- Rotate role keys to dedicated operational keypairs.
- Move operational roles to multisig PDA/governance.
- Introduce timelock + dual-control for seize and role changes.

## Operational Security Checklist
- [ ] Rotate admin/role keys after deployment.
- [ ] Restrict RPC and signer exposure in CI/CD.
- [ ] Monitor emitted events for mint/burn/seize/blacklist actions.
- [ ] Run stress + regression tests after any instruction change.
