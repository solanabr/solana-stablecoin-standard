# Operations Runbook

Operator guide for mint, freeze, thaw, pause, blacklist, and seize using the CLI or SDK.

**Security & audits:** The on-chain program has been audited. See [audits/FINAL_AUDIT.md](../audits/FINAL_AUDIT.md) for the audit summary and recommendation.

## Copy-paste: init, mint, freeze/blacklist, view audit

**CLI (SSS-1):**
```bash
pnpm run cli init --preset sss-1 -n "My USD" -s MUSD --uri "https://example.com"
pnpm run cli -m <MINT> mint <RECIPIENT_PUBKEY> 1000000
pnpm run cli -m <MINT> freeze <OWNER_PUBKEY>
pnpm run cli -m <MINT> thaw <OWNER_PUBKEY>
```

**CLI (SSS-2 blacklist + audit):**
```bash
pnpm run cli init --preset sss-2 -n "Regulated USD" -s RUSD --uri ""
pnpm run cli -m <MINT> blacklist add <ADDRESS> --reason "OFAC match"
BACKEND_URL=http://localhost:3000 pnpm run cli -m <MINT> audit-log
```

**SDK (minimal):**
```typescript
const stable = await SolanaStablecoin.create(connection, { preset: "SSS_1", name: "My USD", symbol: "MUSD", uri: "", decimals: 6 }, authority);
await stable.mint(authority.publicKey, { recipient: recipientPubkey, amount: 1_000_000n, minter: authority.publicKey });
```

## Prerequisites

- Keypair with the required role (authority, minter, burner, pauser, freezer, blacklister, seizer).
- For CLI: `--mint <MINT>` for all commands except `init`. Optionally `--keypair`, `--rpc-url`, or env `KEYPAIR`, `RPC_URL`.

## Mint

**CLI:**

```bash
sss-token -m <MINT> mint <RECIPIENT_PUBKEY> <AMOUNT>
```

**SDK:**

```typescript
await stable.mint(signerPubkey, {
  recipient: recipientPubkey,
  amount: BigInt(amount),
  minter: signerPubkey,
});
```

The signer must have the minter role and sufficient minter quota.

## Burn

**CLI:**

```bash
sss-token -m <MINT> burn <AMOUNT>
```

**SDK:**

```typescript
await stable.burn(signerPubkey, { amount: BigInt(amount) });
```

The signer must have the burner role; tokens are burned from the signer’s token account.

## Freeze / Thaw

**CLI:**

```bash
sss-token -m <MINT> freeze <OWNER_PUBKEY>   # freeze token account of owner
sss-token -m <MINT> thaw <OWNER_PUBKEY>
```

**SDK:**

```typescript
const targetAta = stable.getRecipientTokenAccount(ownerPubkey);
await stable.freezeAccount(signerPubkey, targetAta);
await stable.thawAccount(signerPubkey, targetAta);
```

The signer must have the pauser or freezer role.

## Pause / Unpause

**CLI:**

```bash
sss-token -m <MINT> pause
sss-token -m <MINT> unpause
```

**SDK:**

```typescript
await stable.pause(signerPubkey);
await stable.unpause(signerPubkey);
```

The signer must have the pauser role. When paused, transfers are blocked by the program.

## Blacklist (SSS-2 only)

**CLI:**

```bash
sss-token -m <MINT> blacklist add <ADDRESS> --reason "OFAC match"
sss-token -m <MINT> blacklist remove <ADDRESS>
```

**SDK:**

```typescript
await stable.compliance.blacklistAdd(signerPubkey, addressPubkey, "OFAC match");
await stable.compliance.blacklistRemove(signerPubkey, addressPubkey);
```

The signer must have the blacklister role. Adding an address blocks all transfers from/to that address while the transfer hook is active.

## Seize (SSS-2 only)

**CLI:**

```bash
sss-token -m <MINT> seize <SOURCE_TOKEN_ACCOUNT> --to <TREASURY_TOKEN_ACCOUNT>
```

**SDK:**

```typescript
await stable.compliance.seize(
  signerPubkey,
  sourceTokenAccountPubkey,
  destinationTokenAccountPubkey
);
```

The signer must have the seizer role. Source and destination are token account addresses (e.g. ATAs). Full balance of the source account is transferred to the destination (treasury).

## Status and Supply

**CLI:**

```bash
sss-token -m <MINT> status   # name, symbol, decimals, paused, SSS-2, totals
sss-token -m <MINT> supply   # total supply (minted - burned)
```

**SDK:**

```typescript
const state = await stable.getState();
const supply = await stable.getTotalSupply();
```

## Role and Minter Management

- **Update roles:** Use SDK `updateRoles(signer, { holder, roles })` (authority only). CLI: `minters add` / `minters remove` (see Management below).
- **Update minter quota:** Use SDK `updateMinter(signer, { minter, quota })` (authority only). CLI: `minters add <ADDRESS> --quota <AMOUNT>`.
- **Transfer authority:** Use SDK `transferAuthority(signer, newAuthority)` (authority only). Single-step: the new authority does not sign. The new authority does not auto-receive roles. **Procedure:** (1) Current authority calls `update_roles` to grant new authority the required roles, then calls `transfer_authority`; or (2) Current authority calls `transfer_authority`, then new authority calls `update_roles` to grant themselves roles. **Do not lose access to the old authority key until roles are granted**, or the new authority may be locked out.

## Management (CLI)

**Minters:**

```bash
sss-token -m <MINT> minters list
sss-token -m <MINT> minters add <ADDRESS> --quota <AMOUNT>
sss-token -m <MINT> minters remove <ADDRESS>
```

`minters add` grants both minter and burner roles. To grant or update roles for an existing address (e.g. add burner to a key that only has minter):

```bash
sss-token -m <MINT> roles grant <ADDRESS> --minter --burner
```

**Holders** (token accounts by mint, optional min balance):

```bash
sss-token -m <MINT> holders
sss-token -m <MINT> holders --min-balance <AMOUNT>
```

**Audit log** (from backend; requires `BACKEND_URL`):

```bash
BACKEND_URL=http://localhost:3000 sss-token -m <MINT> audit-log
BACKEND_URL=http://localhost:3000 sss-token -m <MINT> audit-log --action mint
```

## TUI (admin interface)

Use **backend-driven TUI** when the backend holds the operator keypair and you want audit log and compliance (set `BACKEND_URL`). Use **RPC-only** when you run the TUI with a local keypair and no backend (unset `BACKEND_URL`). Labels and terminology in the TUI match the SDK and docs: presets **SSS-1** / **SSS-2**, roles **minter**, **burner**, **pauser**, **freezer**, **blacklister**, **seizer**. See [API.md#admin-tui](API.md#admin-tui).

## Recovery: create a stablecoin you control

If you only have one keypair (e.g. `~/.config/solana/id.json`) and the current mint was created by another keypair you don't have, you cannot pause/unpause that mint. Create a new stablecoin with your keypair as authority, then use it with the backend and TUI.

1. **Create the stablecoin** (your keypair becomes authority and gets pauser; it still needs a minter quota to mint):

   ```bash
   pnpm cli init -p sss-1 -n "My USD" -s MUSD -k /Users/patel/.config/solana/id.json
   ```

   Copy the printed **Mint** address.

2. **Add your keypair as minter with a quota** (authority can mint only after MinterInfo exists):

   ```bash
   # Replace NEW_MINT with the mint from step 1; get your pubkey: solana address -k /Users/patel/.config/solana/id.json
   pnpm cli minters add $(solana address -k /Users/patel/.config/solana/id.json) -m NEW_MINT -q 1000000000 -k /Users/patel/.config/solana/id.json
   ```

3. **Point the backend at the new mint:** set `MINT_ADDRESS=NEW_MINT` and `KEYPAIR_PATH=/Users/patel/.config/solana/id.json` in `backend/.env`, then restart the backend.

4. **Use the TUI:** run `pnpm tui`; it will use the backend's mint. You can unpause, mint, burn, freeze/thaw, and manage blacklist from the TUI because your keypair is both authority (pauser) and minter.

---
