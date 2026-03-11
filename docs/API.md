# API Reference

## Program Instructions

### Stablecoin Program

#### `initialize(params: InitializeParams)`
Creates a new stablecoin mint with Token-2022 extensions.

**Accounts**: authority (signer), mint (signer), config (init PDA), mintAuthority (PDA), transferHookProgram (optional), tokenProgram, systemProgram, rent

**Params**: preset, name, symbol, uri, decimals, masterMinter, pauser, blacklister, enablePermanentDelegate, enableTransferHook, enableConfidentialTransfers, defaultAccountFrozen, auditorElgamalPubkey

---

#### `mint_tokens(amount: u64)`
Mints tokens to a recipient. Requires active minter with sufficient allowance.

**Accounts**: minter (signer), config, minterAllowance, mint, mintAuthority, recipientTokenAccount, tokenProgram

---

#### `burn_tokens(amount: u64)`
Burns tokens from the caller's token account.

**Accounts**: burner (signer), config, minterAllowance, mint, burnerTokenAccount, tokenProgram

---

#### `pause()` / `unpause()`
Pauses/unpauses all minting. S³-2 mints also block transfers via hook.

**Accounts**: pauser (signer), config

---

#### `freeze_account()` / `thaw_account()`
Freezes/thaws an individual token account.

**Accounts**: authority (signer), config, mint, mintAuthority, tokenAccount, tokenProgram

---

#### `blacklist_add(reason: String)`
Adds an address to the blacklist (S³-2 only). Also freezes the wallet's token account.

**Accounts**: blacklister (signer), config, mint, wallet, blacklistEntry (init PDA), mintAuthority, walletTokenAccount, tokenProgram, systemProgram

---

#### `blacklist_remove()`
Removes an address from the blacklist. Closes the PDA.

**Accounts**: blacklister (signer), config, mint, wallet, blacklistEntry (close PDA), systemProgram

---

#### `seize(amount: u64)`
Seizes tokens from a blacklisted account using permanent delegate. Pass transfer hook accounts as `remainingAccounts` for S³-2 mints.

**Accounts**: owner (signer), config, mint, mintAuthority, blacklistEntry, targetWallet, sourceTokenAccount, treasuryTokenAccount, tokenProgram

---

#### `add_minter(minter: Pubkey, allowance: u64)`
Adds a new minter with the specified allowance.

**Accounts**: authority (signer, master_minter), config, minterAllowance (init PDA), systemProgram

---

#### `remove_minter()`
Removes a minter and closes the PDA.

**Accounts**: authority (signer, master_minter), config, minterAllowance (close PDA), systemProgram

---

#### `update_minter_allowance(new_allowance: u64)`
Updates an existing minter's allowance.

**Accounts**: authority (signer, master_minter), config, minterAllowance

---

#### `assign_role(role: Role, assignee: Pubkey)`
Assigns a role to an address.

**Accounts**: authority (signer, owner), config, roleAssignment (init PDA), systemProgram

---

#### `revoke_role()`
Revokes a role assignment.

**Accounts**: authority (signer, owner), config, roleAssignment (close PDA), systemProgram

---

#### `transfer_ownership(new_owner: Pubkey)`
Step 1: Sets pending owner.

**Accounts**: owner (signer), config

---

#### `accept_ownership()`
Step 2: Accepts ownership.

**Accounts**: newOwner (signer), config

---

### Transfer Hook Program

#### `initialize_extra_account_meta_list()`
Registers extra accounts for the transfer hook.

**Accounts**: payer (signer), extraAccountMetaList (PDA), mint, systemProgram

#### `transfer_hook(amount: u64)`
Called by Token-2022 during transfer_checked. Checks pause and blacklist.

**Accounts**: sourceToken, mint, destinationToken, owner, extraAccountMetaList, stablecoinProgram, config, sourceBlacklist, destinationBlacklist

## Error Codes

| Code | Name | Description |
|------|------|-------------|
| 6000 | TokenPaused | Token is paused |
| 6001 | AddressBlacklisted | Address is blacklisted |
| 6002 | FeatureNotEnabled | Feature not enabled for this preset |
| 6003 | Unauthorized | Caller lacks required authority |
| 6004 | AllowanceExceeded | Mint amount exceeds minter allowance |
| 6005 | MinterNotActive | Minter is not active |
| 6006 | InvalidPreset | Invalid preset configuration |
