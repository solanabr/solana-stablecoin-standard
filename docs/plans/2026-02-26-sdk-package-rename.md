# SDK Package Rename: @sss/sdk → @stbr/sss-token

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rename the SDK package from `@sss/sdk` to `@stbr/sss-token` to align with the Superteam Brazil bounty's expected import path.

**Architecture:** Pure string replacement across 23 files (42 occurrences). No logic changes, no API changes. The workspace resolution stays directory-based (`sdk/`), only the npm package name changes.

**Tech Stack:** pnpm workspace, TypeScript, Rust (string literals), Markdown docs

---

### Task 1: Rename SDK package.json

**Files:**
- Modify: `sdk/package.json:2`

**Step 1: Update package name**

Change `"name": "@sss/sdk"` to `"name": "@stbr/sss-token"` in sdk/package.json.

**Step 2: Verify package.json is valid JSON**

Run: `node -e "require('./sdk/package.json')" && echo OK`
Expected: `OK`

---

### Task 2: Update workspace consumers

**Files:**
- Modify: `package.json:7` (root)
- Modify: `backend/package.json:14`
- Modify: `.github/workflows/ci.yml:130,179`
- Modify: `backend/Dockerfile:21`

**Step 1: Update root package.json**

Change `pnpm --filter @sss/sdk test` to `pnpm --filter @stbr/sss-token test`.

**Step 2: Update backend/package.json**

Change `"@sss/sdk": "workspace:*"` to `"@stbr/sss-token": "workspace:*"`.

**Step 3: Update backend/src/services/solana.ts**

Change `import { SSS } from "@sss/sdk"` to `import { SSS } from "@stbr/sss-token"`.

**Step 4: Update CI workflow**

Replace both occurrences of `pnpm --filter @sss/sdk build` with `pnpm --filter @stbr/sss-token build` in `.github/workflows/ci.yml`.

**Step 5: Update backend Dockerfile**

Change `RUN pnpm --filter @sss/sdk build` to `RUN pnpm --filter @stbr/sss-token build`.

**Step 6: Regenerate lockfile**

Run: `pnpm install --no-frozen-lockfile`
Expected: Clean install, lockfile updated with new package name.

**Step 7: Verify workspace resolution**

Run: `pnpm --filter @stbr/sss-token test`
Expected: 32 tests passing.

---

### Task 3: Update Rust string literals

**Files:**
- Modify: `cli/src/commands/init.rs:94`
- Modify: `cli/src/commands/confidential.rs:40,52`

**Step 1: Replace @sss/sdk in init.rs**

Change the `@sss/sdk` reference in the help text to `@stbr/sss-token`.

**Step 2: Replace @sss/sdk in confidential.rs**

Change both `@sss/sdk` references in the hint messages to `@stbr/sss-token`.

**Step 3: Verify Rust compiles**

Run: `cargo build --bin sss-token 2>&1 | tail -3`
Expected: `Finished` with no errors.

---

### Task 4: Update documentation

**Files (all replace `@sss/sdk` → `@stbr/sss-token`):**
- Modify: `README.md` (4 occurrences)
- Modify: `CLAUDE.md` (1 occurrence)
- Modify: `docs/SDK.md` (8 occurrences)
- Modify: `docs/ARCHITECTURE.md` (2 occurrences)
- Modify: `docs/API.md` (1 occurrence)
- Modify: `docs/OPERATIONS.md` (2 occurrences)
- Modify: `docs/SSS-1.md` (1 occurrence)
- Modify: `docs/SSS-2.md` (1 occurrence)
- Modify: `docs/SSS-3.md` (1 occurrence)

**Step 1: Bulk replace in all docs**

Replace all occurrences of `@sss/sdk` with `@stbr/sss-token` in the above files.

**Step 2: Verify no stale references**

Run: `grep -r "@sss/sdk" --include="*.md" --include="*.ts" --include="*.rs" --include="*.json" --include="*.yml" . | grep -v node_modules | grep -v pnpm-lock | grep -v docs/plans/2026-02-24 | grep -v docs/plans/2026-02-25 | grep -v docs/plans/STARTER`
Expected: No output (zero remaining references outside historical plan docs).

---

### Task 5: Update historical plan docs (optional, low priority)

**Files:**
- Modify: `docs/plans/STARTER_PROMPT.md` (1 occurrence)
- Modify: `docs/plans/2026-02-24-sss-implementation-plan.md` (3 occurrences)
- Modify: `docs/plans/2026-02-24-sss-design.md` (2 occurrences)
- Modify: `docs/plans/2026-02-25-bounty-gap-fixes.md` (2 occurrences)
- Modify: `docs/plans/2026-02-25-roast-fixes.md` (2 occurrences)

Replace `@sss/sdk` → `@stbr/sss-token` in all plan docs for consistency.

---

### Task 6: Final verification and commit

**Step 1: Run full test suite**

Run: `pnpm --filter @stbr/sss-token test`
Expected: 32 passing.

**Step 2: Build SDK**

Run: `cd sdk && pnpm build`
Expected: Clean tsc output.

**Step 3: Verify exports under new name**

Run: `node -e "const s = require('./sdk/dist/index.js'); console.log('Presets:', JSON.stringify(s.Presets)); console.log('SSS===SolanaStablecoin:', s.SSS === s.SolanaStablecoin)"`
Expected: Presets and alias both resolve correctly.

**Step 4: Verify zero stale references**

Run: `grep -r "@sss/sdk" . --include="*.ts" --include="*.rs" --include="*.json" --include="*.yml" --include="*.md" | grep -v node_modules | grep -v pnpm-lock | grep -v target`
Expected: No output (only pnpm-lock.yaml may have cached refs, regenerated in Task 2).

**Step 5: Commit**

```bash
git add -A
git commit -m "chore: rename SDK package from @sss/sdk to @stbr/sss-token"
git push origin main
```
