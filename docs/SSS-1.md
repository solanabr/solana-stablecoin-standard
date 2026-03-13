# SSS-1: Minimal Stablecoin

## Scope

SSS-1 is the minimal stablecoin standard: what’s needed on every stablecoin and nothing more.

## Features

- **Token-2022 mint** with metadata (name, symbol, URI, decimals).
- **Mint authority** and **freeze authority** held by the program’s stablecoin PDA (not a single EOA).
- **Role-based access:** master authority, minters (with per-minter quotas), burners, pausers. No blacklist or seizure.
- **Operations:** initialize, mint, burn, freeze/thaw, pause/unpause, update_roles, update_minter, transfer_authority.

## What SSS-1 Does Not Include

- No permanent delegate.
- No transfer hook.
- No default-account-frozen (new accounts are not frozen by default).
- No blacklist or seize.

## Use Cases

- Internal settlement tokens.
- DAO treasuries.
- Ecosystem or partner stablecoins where compliance is handled off-chain (e.g. freeze accounts as needed).

## Instructions (SSS-1)

| Instruction | Who signs | Description |
| ----------- | --------- | ----------- |
| initialize_stablecoin | authority | Create mint, StablecoinState PDA, authority RoleAccount. Sets enable_permanent_delegate, enable_transfer_hook, default_account_frozen (immutable). |
| mint_tokens | minter | Mint to recipient; requires minter role and quota. |
| burn_tokens | burner | Burn from signer's token account. |
| freeze_account / thaw_account | pauser or freezer | Freeze or thaw a token account. |
| pause / unpause | pauser | Block or allow mints and burns. |
| update_roles | authority | Set role flags for a holder. |
| update_minter | authority | Set minter quota (increase only). |
| transfer_authority | authority | Change stablecoin authority. |
| update_supply_cap | authority | Set or clear supply cap. |

## Failure modes

- **Unauthorized (6000):** Signer lacks the required role (e.g. non-minter tries to mint).
- **Paused (6001):** Mint or burn called while stablecoin is paused.
- **QuotaExceeded (6005):** Mint would exceed minter quota.
- **SupplyCapExceeded (6014):** Mint would exceed supply cap.
- **ZeroAmount (6006):** Mint or burn amount is zero.

SSS-1 does not have blacklist or seize; calling those on an SSS-1 mint is a configuration error (use SSS-2 for compliance).

## Initialization

Use preset `SSS_1` or `extensions: { enablePermanentDelegate: false, enableTransferHook: false, defaultAccountFrozen: false }`. After init, the stablecoin cannot be upgraded to SSS-2 (flags are immutable).
