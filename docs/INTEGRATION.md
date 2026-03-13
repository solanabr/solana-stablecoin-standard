# Integration guide

How third parties integrate with the Solana Stablecoin Standard: SDK, backend API, CLI, and a minimal "hello stablecoin" flow.

---

## SDK usage

**Create a new stablecoin:** Use `SolanaStablecoin.create(connection, config, signer)`. Config supports presets or custom extensions:

```typescript
import { Connection, Keypair } from "@solana/web3.js";
import { SolanaStablecoin } from "@stbr/sss-token";

const connection = new Connection("https://api.devnet.solana.com");
const authority = Keypair.fromSecretKey(/* ... */);

const stable = await SolanaStablecoin.create(connection, {
  preset: "SSS_1",  // or "SSS_2" for compliant
  name: "My USD",
  symbol: "MYUSD",
  uri: "https://example.com/metadata.json",
  decimals: 6,
}, authority);
console.log("Mint:", stable.mintAddress.toBase58());
```

**Load existing stablecoin:** Use `getProgram(provider)` and `SolanaStablecoin.load(program, mint)`:

```typescript
import { AnchorProvider, Wallet } from "@coral-xyz/anchor";
import { SolanaStablecoin, getProgram } from "@stbr/sss-token";

const provider = new AnchorProvider(connection, new Wallet(authority), {});
const program = getProgram(provider);
const stable = await SolanaStablecoin.load(program, mintPublicKey);
```

Or use the convenience `SolanaStablecoin.loadFromConnection(connection, mint, signer?)` (signer optional if `KEYPAIR_PATH` env is set).

**Mint / burn:**

```typescript
await stable.updateRoles(authority.publicKey, {
  holder: authority.publicKey,
  roles: { isMinter: true, isBurner: true, isPauser: true, isFreezer: false, isBlacklister: false, isSeizer: false },
});
await stable.updateMinter(authority.publicKey, { minter: authority.publicKey, quota: BigInt(1e12) });

await stable.mint(authority.publicKey, {
  recipient: recipientPubkey,
  amount: BigInt(100_000_000),
  minter: authority.publicKey,
});
await stable.burn(authority.publicKey, { amount: BigInt(50_000_000) });
```

**SSS-2 compliance:** `stable.compliance.blacklistAdd(blacklisterPubkey, address, "reason")`, `blacklistRemove`, `seize(seizerPubkey, sourceTokenAccount, destTokenAccount)`. Throws `ComplianceNotEnabledError` if the stablecoin is not SSS-2.

---

## When to use backend vs SDK

| Use case | Prefer |
| -------- | ------ |
| Server-side mint/burn with one keypair, audit trail, rate limits | **Backend API** — set `BACKEND_URL`, use `X-API-Key`, call POST /mint-request, /burn-request, etc. |
| Direct on-chain control from your app (wallet signs) | **SDK** — `SolanaStablecoin.load(program, mint)` and mint/burn/freeze/thaw with the user's keypair. |
| Admin TUI or scripts using a single operator key | **Backend** (TUI) or **CLI** (scripts). |
| Read-only: supply, status, audit log | **Backend** GET /status/:mint, GET /compliance/audit-log, or **SDK** getState(), getTotalSupply(). |

---

## CLI one-liners

```bash
# Init (preset or custom)
pnpm run cli init --preset sss-1 -n "My USD" -s MUSD --uri "https://..."
pnpm run cli init --preset sss-2 -n "Regulated USD" -s RUSD --uri ""

# Operations (require -m <MINT>)
pnpm run cli -m <MINT> mint <RECIPIENT> <AMOUNT>
pnpm run cli -m <MINT> burn <AMOUNT>
pnpm run cli -m <MINT> freeze <OWNER_PUBKEY>
pnpm run cli -m <MINT> thaw <OWNER_PUBKEY>
pnpm run cli -m <MINT> pause
pnpm run cli -m <MINT> unpause
pnpm run cli -m <MINT> blacklist add <ADDRESS> --reason "OFAC"
pnpm run cli -m <MINT> seize <SOURCE_ATA> --to <DEST_ATA>

# Audit (requires backend)
BACKEND_URL=http://localhost:3000 pnpm run cli -m <MINT> audit-log
```

---

## Env vars

| Variable | Where | Purpose |
| -------- | ----- | ------- |
| RPC_URL | SDK, CLI, backend | Solana RPC endpoint. |
| KEYPAIR_PATH | CLI, backend | Path to keypair JSON (default ~/.config/solana/id.json). |
| MINT_ADDRESS | Backend | Default mint for mint/burn API when not overridden per request. |
| BACKEND_URL | CLI | For audit-log command. |
| API_KEY | Backend | If set, protected routes require X-API-Key header. |

---

## Minimal "hello stablecoin" flow

1. **Build and deploy** (or use devnet): see [DEPLOY_PROGRAM.md](DEPLOY_PROGRAM.md).
2. **Create stablecoin:**  
   `pnpm run cli init --preset sss-1 -n "Hello" -s HEL -u ""`
3. **Note the mint** from the command output.
4. **Mint and burn:**  
   `pnpm run cli -m <MINT> mint <YOUR_PUBKEY> 1000000`  
   `pnpm run cli -m <MINT> burn 500000`

Or with the SDK only (Node or browser with keypair): see [examples/1-basic-sss1.ts](../examples/1-basic-sss1.ts).
