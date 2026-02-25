# Roast Fixes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix all 13 actionable findings from the code roast audit to harden the codebase before bounty submission.

**Architecture:** Targeted fixes across 6 groups (A-F), each independently committable. No architectural changes — purely hardening, deduplication, and wiring existing SDK methods into frontend stubs.

**Tech Stack:** Rust/Anchor (programs), TypeScript (SDK, backend, frontend/Next.js), Anchor IDL

---

### Task 1: Fix `unwrap()` in oracle parsing (Program)

**Files:**
- Modify: `programs/sss-core/src/instructions/mint_tokens.rs:154-155`

**Step 1: Replace unwrap with proper error mapping**

Change lines 154-155 from:

```rust
let expo = i32::from_le_bytes(data[20..24].try_into().unwrap());
let price = i64::from_le_bytes(data[208..216].try_into().unwrap());
```

To:

```rust
let expo = i32::from_le_bytes(
    data[20..24].try_into().map_err(|_| error!(SssError::InvalidOracleData))?
);
let price = i64::from_le_bytes(
    data[208..216].try_into().map_err(|_| error!(SssError::InvalidOracleData))?
);
```

**Step 2: Build the program**

Run: `anchor build`
Expected: SUCCESS (no compilation errors)

**Step 3: Commit**

```bash
git add programs/sss-core/src/instructions/mint_tokens.rs
git commit -m "fix(program): replace unwrap with proper error handling in oracle parsing"
```

---

### Task 2: Fix `unwrap()` in CLI info command

**Files:**
- Modify: `cli/src/commands/info.rs:22-36`

**Step 1: Replace all unwrap() with proper error handling**

Replace lines 22-36 from manual unwrap() parsing to use anyhow context:

```rust
let authority = solana_sdk::pubkey::Pubkey::try_from(&data[8..40])
    .map_err(|_| anyhow::anyhow!("Invalid authority pubkey in config data"))?;
let mint_key = solana_sdk::pubkey::Pubkey::try_from(&data[40..72])
    .map_err(|_| anyhow::anyhow!("Invalid mint pubkey in config data"))?;
let preset = data[72];
let paused = data[73] != 0;

// Option<u64>: 1 byte tag + 8 bytes value
let (supply_cap, offset) = if data[74] == 1 {
    let cap = u64::from_le_bytes(data[75..83].try_into()
        .map_err(|_| anyhow::anyhow!("Invalid supply cap bytes"))?);
    (Some(cap), 83)
} else {
    (None, 75)
};

let total_minted = u64::from_le_bytes(data[offset..offset + 8].try_into()
    .map_err(|_| anyhow::anyhow!("Invalid total_minted bytes"))?);
let total_burned = u64::from_le_bytes(data[offset + 8..offset + 16].try_into()
    .map_err(|_| anyhow::anyhow!("Invalid total_burned bytes"))?);
```

**Step 2: Add a length check for supply counter fields**

After the supply_cap parsing (around line 34), add:

```rust
if data.len() < offset + 16 {
    anyhow::bail!("Config account data too short for supply counters");
}
```

**Step 3: Build the CLI**

Run: `cargo build --bin sss-cli`
Expected: SUCCESS

**Step 4: Commit**

```bash
git add cli/src/commands/info.rs
git commit -m "fix(cli): replace unwrap with proper error handling in info command"
```

---

### Task 3: Document SSS-2 seize limitation + LastAdmin design in README

**Files:**
- Modify: `README.md` — add Known Limitations section
- Modify: `programs/sss-core/src/instructions/manage_roles.rs:120-127` — add clarifying comment

**Step 1: Add Known Limitations section to README**

Append before the final section of README.md:

```markdown
## Known Limitations

### SSS-2: Seize operation not supported

The `seize` instruction uses Token-2022's `TransferChecked` CPI with the config PDA as permanent delegate. On SSS-2 mints, the transfer hook requires extra accounts (blacklist PDA, hook program) that cannot be forwarded through the `TransferChecked` CPI. This is a Token-2022 design constraint — transfer hooks and permanent delegate CPIs are not composable in the current runtime.

**Workaround:** For SSS-2 compliance scenarios requiring asset seizure, use a freeze + admin-coordinated manual transfer flow.

**Affects:** SSS-2 preset only. SSS-1 and SSS-3 seize works correctly.

### Admin role revocation

The `LastAdmin` protection prevents an admin from revoking their own admin role (which would permanently brick the config). However, Admin A can revoke Admin B's admin role even if B is the only other admin. This is by design — counting total admins on-chain would require an additional counter or enumeration mechanism, adding complexity and cost. The recommended pattern is: always maintain 2+ admins, and use a multisig for the primary admin key.
```

**Step 2: Add clarifying comment to manage_roles.rs**

Enhance the comment at line 120-126 to:

```rust
// Prevent revoking the last admin — would brick the config permanently.
// NOTE: This only blocks self-revocation. Admin A can still revoke Admin B
// even if B is the last admin. Counting total admins on-chain would require
// an enumeration mechanism (additional PDA or counter), adding complexity.
// Recommended: always maintain 2+ admins via multisig.
```

**Step 3: Commit**

```bash
git add README.md programs/sss-core/src/instructions/manage_roles.rs
git commit -m "docs: add known limitations section for SSS-2 seize and admin revocation"
```

---

### Task 4: Deduplicate ConfidentialTransferMint instruction builder

**Files:**
- Modify: `sdk/src/presets/sss3.ts` — export the function
- Modify: `sdk/src/index.ts` — re-export it
- Modify: `tests/helpers.ts` — import from SDK instead of inline
- Modify: `scripts/devnet-proof.ts` — import from SDK instead of inline

**Step 1: Export the function from SDK**

In `sdk/src/presets/sss3.ts`, change `function` to `export function` at line 51:

```typescript
export function createInitializeConfidentialTransferMintInstruction(
```

**Step 2: Re-export from SDK index**

In `sdk/src/index.ts`, add:

```typescript
export { createInitializeConfidentialTransferMintInstruction } from "./presets/sss3";
```

**Step 3: Update tests/helpers.ts**

In `tests/helpers.ts`, at the SSS-3 mint creation section (~line 526), replace the inline instruction building with an import from the SDK:

```typescript
import { createInitializeConfidentialTransferMintInstruction } from "../sdk/src/presets/sss3";
```

Then replace the inline 67-byte buffer construction with a call to the imported function.

**Step 4: Update scripts/devnet-proof.ts**

Remove the local `buildConfidentialTransferMintIx` function (~lines 153-172) and import from SDK:

```typescript
import { createInitializeConfidentialTransferMintInstruction } from "../sdk/src/presets/sss3";
```

Replace calls to `buildConfidentialTransferMintIx(...)` with `createInitializeConfidentialTransferMintInstruction(...)`.

**Step 5: Build and verify**

Run: `pnpm build --filter @sss/sdk`
Expected: SUCCESS

**Step 6: Commit**

```bash
git add sdk/src/presets/sss3.ts sdk/src/index.ts tests/helpers.ts scripts/devnet-proof.ts
git commit -m "refactor: deduplicate ConfidentialTransferMint instruction builder"
```

---

### Task 5: Extract shared constants and validation schemas

**Files:**
- Create: `frontend/src/lib/constants.ts`
- Create: `backend/src/utils/validation.ts`
- Modify: `frontend/src/hooks/use-program.ts` — import from constants
- Modify: `frontend/src/hooks/use-stablecoin-config.ts` — import from constants + validate pubkey
- Modify: `backend/src/routes/operations.ts` — import from shared validation
- Modify: `backend/src/routes/compliance.ts` — import from shared validation

**Step 1: Create frontend constants**

Create `frontend/src/lib/constants.ts`:

```typescript
import { PublicKey } from "@solana/web3.js";

export const SSS_CORE_PROGRAM_ID = new PublicKey(
  "Corep3pXJzUGaqpw2xzWQi4q63cn1STABiCDMJhMECB",
);

export const SSS_HOOK_PROGRAM_ID = new PublicKey(
  "hookXMsC9txN6T8hyS9GCyubBL4nvp9XPWg5wW3z3pH",
);
```

**Step 2: Update frontend hooks to import from constants**

In `frontend/src/hooks/use-program.ts`, remove the local `SSS_CORE_PROGRAM_ID` constant and add:

```typescript
import { SSS_CORE_PROGRAM_ID } from "@/lib/constants";
```

In `frontend/src/hooks/use-stablecoin-config.ts`, remove both `SSS_CONFIG_SEED` and `SSS_CORE_PROGRAM_ID` constants, import `SSS_CORE_PROGRAM_ID` from `@/lib/constants`, and keep the seed as a local const (it's config-hook specific).

Also add pubkey validation before the `new PublicKey()` call:

```typescript
// Validate the mint address before attempting RPC call
try {
  new PublicKey(mintAddress);
} catch {
  setError("Please enter a valid Solana address");
  setLoading(false);
  return;
}
```

**Step 3: Create backend validation utils**

Create `backend/src/utils/validation.ts`:

```typescript
import { z } from "zod";
import { PublicKey } from "@solana/web3.js";

export const publicKeySchema = z.string().refine(
  (val) => {
    try {
      new PublicKey(val);
      return true;
    } catch {
      return false;
    }
  },
  { message: "Invalid Solana public key" },
);
```

**Step 4: Update backend routes to import from shared**

In `backend/src/routes/operations.ts`, remove the local `publicKeySchema` (lines 13-23) and add:

```typescript
import { publicKeySchema } from "../utils/validation";
```

In `backend/src/routes/compliance.ts`, remove the local `publicKeySchema` (lines 13-23) and add:

```typescript
import { publicKeySchema } from "../utils/validation";
```

**Step 5: Build and verify**

Run: `cd frontend && npx next build` and `cd backend && npx tsc --noEmit`
Expected: SUCCESS for both

**Step 6: Commit**

```bash
git add frontend/src/lib/constants.ts backend/src/utils/validation.ts \
  frontend/src/hooks/use-program.ts frontend/src/hooks/use-stablecoin-config.ts \
  backend/src/routes/operations.ts backend/src/routes/compliance.ts
git commit -m "refactor: extract shared constants and validation schemas"
```

---

### Task 6: Harden backend auth + environment config

**Files:**
- Modify: `backend/src/middleware/auth.ts` — timing-safe comparison
- Modify: `backend/src/services/solana.ts` — fail loudly on missing RPC_URL

**Step 1: Add timing-safe comparison to auth middleware**

Replace the comparison in `backend/src/middleware/auth.ts` (line 21):

```typescript
import { timingSafeEqual } from "crypto";

// ...inside authMiddleware:
if (
  !apiKey ||
  typeof apiKey !== "string" ||
  apiKey.length !== process.env.API_KEY.length ||
  !timingSafeEqual(Buffer.from(apiKey), Buffer.from(process.env.API_KEY))
) {
```

**Step 2: Fail loudly on missing SOLANA_RPC_URL**

In `backend/src/services/solana.ts` line 48, change:

```typescript
const rpcUrl = process.env.SOLANA_RPC_URL || "http://localhost:8899";
```

To:

```typescript
const rpcUrl = process.env.SOLANA_RPC_URL;
if (!rpcUrl) {
  throw new Error("SOLANA_RPC_URL environment variable is required");
}
```

**Step 3: Build and verify**

Run: `cd backend && npx tsc --noEmit`
Expected: SUCCESS

**Step 4: Commit**

```bash
git add backend/src/middleware/auth.ts backend/src/services/solana.ts
git commit -m "fix(backend): timing-safe auth comparison and strict env validation"
```

---

### Task 7: Fix hardcoded keypair path in devnet scripts

**Files:**
- Modify: `scripts/devnet-proof.ts:18` — use ANCHOR_WALLET env var

**Step 1: Replace hardcoded path with env var**

Replace line 18:

```typescript
const KEYPAIR_PATH = resolve(homedir(), ".config/solana/id.json");
```

With:

```typescript
const KEYPAIR_PATH = process.env.ANCHOR_WALLET
  || resolve(homedir(), ".config/solana/id.json");
```

**Step 2: Commit**

```bash
git add scripts/devnet-proof.ts
git commit -m "fix(scripts): use ANCHOR_WALLET env var for keypair path"
```

---

### Task 8: Wire frontend operations page to real transactions

**Files:**
- Modify: `frontend/src/app/operations/page.tsx` — wire all 6 handlers to Anchor program
- Modify: `frontend/src/hooks/use-stablecoin-config.ts` — export mint selector context

**Context:** The operations page has 6 handlers (mint, burn, freeze, thaw, pause, unpause) that currently just `console.log`. Wire them to the Anchor program using the same pattern as `use-stablecoin-config.ts` — get the program instance, build the instruction, send via wallet adapter.

**Step 1: Create a shared transaction execution hook**

Create `frontend/src/hooks/use-transaction.ts`:

```typescript
"use client";

import { useState, useCallback } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { Transaction, PublicKey } from "@solana/web3.js";
import { useCoreProgram } from "./use-program";
import { BN } from "@coral-xyz/anchor";
import { SSS_CORE_PROGRAM_ID } from "@/lib/constants";

export interface TxResult {
  signature: string | null;
  error: string | null;
  loading: boolean;
}

export function useTransaction() {
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();
  const program = useCoreProgram();
  const [result, setResult] = useState<TxResult>({
    signature: null,
    error: null,
    loading: false,
  });

  const execute = useCallback(
    async (
      buildIx: (program: ReturnType<typeof useCoreProgram>) => Promise<Transaction>,
    ) => {
      if (!program || !publicKey) {
        setResult({ signature: null, error: "Wallet not connected", loading: false });
        return;
      }
      setResult({ signature: null, error: null, loading: true });
      try {
        const tx = await buildIx(program);
        const signature = await sendTransaction(tx, connection);
        await connection.confirmTransaction(signature, "confirmed");
        setResult({ signature, error: null, loading: false });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setResult({ signature: null, error: message, loading: false });
      }
    },
    [program, publicKey, sendTransaction, connection],
  );

  const reset = useCallback(() => {
    setResult({ signature: null, error: null, loading: false });
  }, []);

  return { ...result, execute, reset };
}
```

**Step 2: Add a MintSelector context to share activeMint across pages**

Create `frontend/src/hooks/use-active-mint.ts`:

```typescript
"use client";

import { createContext, useContext } from "react";

export const ActiveMintContext = createContext<string | null>(null);

export function useActiveMint() {
  return useContext(ActiveMintContext);
}
```

**Step 3: Wire all 6 handlers in operations/page.tsx**

Replace the `console.log` handlers with real transaction calls using the `useTransaction` hook. Each handler builds an instruction via the Anchor program and sends it.

The handlers should:
1. Validate inputs (non-empty, valid pubkey format)
2. Build the instruction using `program.methods.mintTokens(new BN(amount)).accountsPartial({...}).instruction()`
3. Wrap in Transaction and send via `useTransaction().execute()`
4. Show success signature or error message in the UI

Add a `MintSelector` at the top of the page (same as dashboard) to know which stablecoin to operate on.

Add result feedback UI: success shows signature link, error shows message in red banner.

**Step 4: Build and verify**

Run: `cd frontend && npx next build`
Expected: All routes compile

**Step 5: Commit**

```bash
git add frontend/src/hooks/use-transaction.ts frontend/src/hooks/use-active-mint.ts \
  frontend/src/app/operations/page.tsx
git commit -m "feat(frontend): wire operations page to real Anchor transactions"
```

---

### Task 9: Wire frontend roles page to real transactions

**Files:**
- Modify: `frontend/src/app/roles/page.tsx` — wire grant/revoke, remove placeholder data

**Step 1: Wire handlers and replace placeholder data**

Replace `PLACEHOLDER_ROLES` with an empty initial state. The role table should note "Connect wallet and select a mint to view roles."

Wire `handleGrant` and `handleRevoke` to the Anchor program:
- Grant: `program.methods.grantRole(roleNumber).accountsPartial({...}).transaction()`
- Revoke: `program.methods.revokeRole().accountsPartial({...}).transaction()`

Add `MintSelector` at top of page. Add `useTransaction` hook for execution.

**Step 2: Build and verify**

Run: `cd frontend && npx next build`
Expected: SUCCESS

**Step 3: Commit**

```bash
git add frontend/src/app/roles/page.tsx
git commit -m "feat(frontend): wire roles page to real Anchor transactions"
```

---

### Task 10: Wire frontend blacklist page to real transactions

**Files:**
- Modify: `frontend/src/app/blacklist/page.tsx` — wire add/remove/check, remove placeholder data

**Step 1: Wire handlers and replace placeholder data**

Replace `PLACEHOLDER_ENTRIES` with empty state. Note: "Connect wallet and select a mint to view blacklist."

Wire handlers:
- Check: derive blacklist PDA, check if account exists via `connection.getAccountInfo()`
- Add: `hookProgram.methods.addToBlacklist().accountsPartial({...}).transaction()`
- Remove: `hookProgram.methods.removeFromBlacklist().accountsPartial({...}).transaction()`

This requires the transfer hook program, so add a `useHookProgram` hook similar to `useCoreProgram` but using the hook IDL.

Add `MintSelector` at top. Add `useTransaction` hook for execution.

**Step 2: Build and verify**

Run: `cd frontend && npx next build`
Expected: SUCCESS

**Step 3: Commit**

```bash
git add frontend/src/app/blacklist/page.tsx frontend/src/hooks/use-hook-program.ts
git commit -m "feat(frontend): wire blacklist page to real Anchor transactions"
```

---

### Task 11: Wire frontend confidential page with honest "Coming Soon" state

**Files:**
- Modify: `frontend/src/app/confidential/page.tsx` — disable buttons with honest messaging

**Context:** Confidential transfers require client-side ElGamal keypair derivation and zero-knowledge proof generation, which depends on a Rust WASM module not yet built. Wiring these to `console.log` stubs is misleading. Instead, honestly label them.

**Step 1: Add disabled state to all action buttons**

Replace all `onClick={() => console.log(...)}` handlers with disabled buttons:

```tsx
<button
  disabled
  className="rounded-lg bg-muted px-4 py-2.5 text-sm font-medium text-muted-foreground cursor-not-allowed"
  title="Requires client-side ZK proof generation (coming soon)"
>
  Configure Account
</button>
```

Add a note below the SSS-3 banner:

```tsx
<div className="rounded-xl border border-warning/20 bg-warning/5 p-4">
  <p className="text-sm text-warning font-medium">Client-side operations coming soon</p>
  <p className="text-xs text-muted-foreground mt-1">
    Confidential transfers require client-side ElGamal key derivation and zero-knowledge
    proof generation. The admin dashboard will display extension status and audit data.
    Direct operations require the SSS CLI or SDK.
  </p>
</div>
```

**Step 2: Build and verify**

Run: `cd frontend && npx next build`
Expected: SUCCESS

**Step 3: Commit**

```bash
git add frontend/src/app/confidential/page.tsx
git commit -m "feat(frontend): add honest 'coming soon' state for confidential page"
```

---

### Task 12: Wire frontend history page to real event data

**Files:**
- Modify: `frontend/src/app/history/page.tsx` — replace placeholder with on-chain event parsing

**Context:** The history page has hardcoded `PLACEHOLDER_HISTORY`. Replace with real data by parsing program logs from `connection.getSignaturesForAddress(configPda)` and then parsing the Anchor events from each transaction.

**Step 1: Replace placeholder with real data fetching**

Add `MintSelector` at top. When a mint is selected:
1. Derive config PDA
2. Fetch recent signatures for the config PDA: `connection.getSignaturesForAddress(configPda, { limit: 50 })`
3. For each signature, fetch the transaction: `connection.getParsedTransaction(sig)`
4. Parse Anchor event logs to determine transaction type
5. Display in the existing UI

Remove `PLACEHOLDER_HISTORY` array entirely.

Add loading and empty states.

**Step 2: Build and verify**

Run: `cd frontend && npx next build`
Expected: SUCCESS

**Step 3: Commit**

```bash
git add frontend/src/app/history/page.tsx
git commit -m "feat(frontend): wire history page to real on-chain event data"
```

---

### Task 13: Final build verification

**Step 1: Build everything**

Run:
```bash
anchor build
cargo build --bin sss-cli
cd frontend && npx next build
cd backend && npx tsc --noEmit
pnpm build --filter @sss/sdk
```

Expected: All builds succeed with zero errors.

**Step 2: Commit any remaining fixes**

If any build issues arise, fix and commit.
