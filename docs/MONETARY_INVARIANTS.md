# Core Protocol Invariants

## 1. Supply Invariant
**"Total supply must equal the sum of all valid token account balances."**
- **Enforcement**: SPL-Token-2022 internal accounting.
- **SSS Specifics**: The `seize` instruction does not destroy supply, it moves it to a treasury. `burn` instruction is the only path to decreasing supply, requiring `Burner` role authorization.

## 2. Mint Quota Invariant
**"Total minted amount by a specific key cannot exceed its assigned quota."**
- **Enforcement**: `instructions/token/mint.rs`
- **Logic**: 
    1. Fetch `MinterQuota` PDA.
    2. Check `limit >= amount`.
    3. Decrement `limit` by `amount`. 
- **Guarantee**: Even if a Minter key is compromised, the damage is capped mathematically.

## 3. Compliance Invariant (Blacklist)
**"A blacklisted address cannot send or receive tokens."**
- **Enforcement**: `programs/transfer_hook` + `TransferHook` Token Extension.
- **Logic**: The extension forces the Solana Runtime to call the Hook Program. The Hook Program checks for the existence of the `BlacklistRegistry` PDA for both `source` and `destination`.
- **Guarantee**: Real-time enforcement during the transfer transaction, not a retroactive "catch-up" sweep.

## 4. Seizure Authorization Invariant
**"Funds can only be seized from accounts that have been formally blacklisted."**
- **Enforcement**: `instructions/compliance/seize.rs` (V4 Patch).
- **Logic**: The instruction requires the `BlacklistRegistry` PDA as a remaining account/constraint.
- **Guarantee**: Prevents a compromised `Seizer` role from arbitrarily stealing from users.

## 5. RBAC Authorization Invariant
**"Only the Master Authority can alter roles and quotas."**
- **Enforcement**: `has_one = master_authority` on the `config` check.
- **Logic**: Every `update_roles` or `update_quota` requires a signature from the key stored in `StablecoinConfig.master_authority`.

## 6. Initialization Invariant
**"A stablecoin configuration can only be initialized by the legitimate Mint owner."**
- **Enforcement**: `initialize.rs` (V4 Patch).
- **Logic**: Verifies `mint_authority == payer`.
