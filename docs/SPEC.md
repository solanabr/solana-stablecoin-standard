# On-chain program specification — SSS

**Version:** 1.x  
**Network:** Devnet / Mainnet (deployment-specific)  
**Framework:** Anchor, SPL Token-2022

---

## Account types (sss-1)

| Account         | Seeds | Size (approx) | Purpose |
| --------------- | ----- | ------------- | ------- |
| StablecoinState | `["stablecoin", mint]` | Variable (name, symbol, uri strings) | Per-mint state: authority, mint, metadata, enable_permanent_delegate, enable_transfer_hook, default_account_frozen, paused, total_minted, total_burned, bump. |
| RoleAccount     | `["role", stablecoin, holder]` | 8 + 32 + 32 + 6 + 1 | Role flags for holder (minter, burner, pauser, freezer, blacklister, seizer), bump. |
| MinterInfo      | `["minter", stablecoin, minter]` | 8 + 32 + 32 + 8 + 8 + 1 | Quota and minted amount for a minter, bump. |
| BlacklistEntry  | `["blacklist", stablecoin, address]` | Variable (reason string) | SSS-2: blacklisted address, reason, timestamps. |
| SupplyCap       | `["supply_cap", stablecoin]` | 8 + 8 + 1 | Optional supply cap (owner, cap, bump). |

---

## Instructions (sss-1)

| Instruction            | Who signs   | Description |
| ---------------------- | ----------- | ----------- |
| initialize_stablecoin   | authority   | Create mint (Token-2022), StablecoinState PDA, authority RoleAccount. Sets immutable flags. |
| mint_tokens             | minter      | Mint to recipient; requires minter role and quota; respects supply cap. |
| burn_tokens             | burner      | Burn from signer's token account; requires burner role. |
| freeze_account          | pauser/freezer | Freeze a token account (Token-2022 CPI). |
| thaw_account            | pauser/freezer | Thaw a token account. |
| pause                   | pauser      | Set stablecoin.paused = true; mints/burns blocked. |
| unpause                 | pauser      | Set stablecoin.paused = false. |
| update_roles            | authority   | Set role flags for a holder. |
| update_minter           | authority   | Set minter quota (can only increase). |
| transfer_authority      | authority   | Set stablecoin.authority to new pubkey. |
| update_supply_cap       | authority   | Set or clear supply cap. |
| add_to_blacklist        | blacklister | SSS-2 only; create BlacklistEntry for address. Fails with ComplianceNotEnabled if not SSS-2. |
| remove_from_blacklist   | blacklister | SSS-2 only; close BlacklistEntry. |
| seize                   | seizer      | SSS-2 only; transfer full balance from source token account to destination (permanent delegate CPI). Fails with ComplianceNotEnabled if not SSS-2. |

---

## Instructions (sss-2 transfer hook)

| Instruction | Who signs | Description |
| ----------- | --------- | ----------- |
| initialize_extra_account_meta_list | authority | Create ExtraAccountMetaList PDA for mint (extra accounts for Token-2022 transfer hook). |
| execute (fallback) | — | Token-2022 invokes on transfer; checks paused and blacklist PDAs; denies transfer if paused or source/dest blacklisted. |

---

## User flows

**Issuer:** Generate keypair → deploy programs (or use existing) → run CLI/SDK `init` (preset sss-1 or sss-2) → grant roles and minter quotas via `update_roles` / `update_minter`.

**Operator:** Use CLI or SDK with keypair that has minter/burner/pauser/freezer role → mint, burn, freeze, thaw, pause, unpause.

**Compliance (SSS-2):** Blacklister adds/removes addresses; seizer calls seize. Transfer hook blocks transfers involving blacklisted addresses.

---

## Failure modes and RBAC

- **Unauthorized (6000):** Signer does not have the required role PDA or role flag.
- **Paused (6001):** Mint or burn called while stablecoin is paused.
- **ComplianceNotEnabled (6002):** Blacklist or seize called on a non-SSS-2 stablecoin.
- **QuotaExceeded (6005):** Mint would exceed minter's quota.
- **SupplyCapExceeded (6014):** Mint would exceed supply cap.
- **ZeroAmount (6006):** Mint or burn amount zero.

RBAC: Every privileged instruction requires the correct role account (PDA with seeds above) and the matching signer; role flags are checked inside the handler.
