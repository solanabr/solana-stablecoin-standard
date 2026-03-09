# TUI Dashboard Audit Report

**File:** tui/admin_tui.js
**Date:** 2026-03-03
**Auditor:** Claude Code (automated)
**Total findings:** 25

## Summary
| Severity | Count |
|----------|-------|
| CRITICAL | 3     |
| HIGH     | 8     |
| MEDIUM   | 9     |
| LOW      | 5     |

---

## Findings

### [CRITICAL] #1: Floating-point arithmetic for financial BN amounts
- **Tab:** Supply Ops, Blacklist, Attestations, Minters
- **Lines:** 854, 907, 1112, 1249, 1250, 1471
- **Description:** All token amount inputs use `new BN(parseFloat(amountStr) * Math.pow(10, dec))`. Floating-point multiplication produces precision errors (e.g. `parseFloat("100.55") * 1e6 = 100550000.00000001`). BN's constructor with a float silently truncates, causing off-by-one lamport errors in financial transactions. This is a correctness bug for an institutional stablecoin.
- **Fix:** Parse the string as a fixed-point decimal manually. Split on `.`, pad the fractional part to `dec` digits, concatenate, and pass the resulting integer string to `new BN(integerString)`. Example:
  ```js
  function parseTokenAmount(str, decimals) {
    const [whole, frac = ''] = str.split('.');
    const padded = frac.padEnd(decimals, '0').slice(0, decimals);
    return new BN(whole + padded);
  }
  ```

### [CRITICAL] #2: System Logs tab does not fetch on-chain audit logs
- **Tab:** System Logs (Tab 11)
- **Lines:** 1948-2043, missing `fetchAuditLogs` function
- **Description:** The program writes `AuditLog` entries on-chain (PDA helper exists at line 127, `getAuditLogPda`), and every write transaction creates audit entries. However, `renderSystemLogsTab()` never fetches these. Instead, it synthesizes fake log entries from in-memory `liveData` (config timestamps, transaction signatures, blacklist entries). The entire System Logs tab is synthetic — it shows no actual on-chain audit data.
- **Fix:** Add a `fetchAuditLogs(configPda, auditLogIndex)` function similar to `fetchAttestations`. Iterate from 0 to `config.auditLogIndex`, decode each `AuditLog` account, and display the actual on-chain audit trail (action type, actor, timestamp, details).

### [CRITICAL] #3: Transfer History shows config PDA transactions, not token transfers
- **Tab:** Transfer History (Tab 8)
- **Lines:** 320, 1672-1712
- **Description:** `fetchTransactions(configPda, 20)` fetches signatures for the **config PDA address**, not the mint or token accounts. This returns administrative transactions (role updates, attestations, config changes), NOT actual token transfers between holders. The tab is labeled "Transfer History" but shows completely wrong data for that purpose.
- **Fix:** Fetch transactions for the **mint address** instead: `fetchTransactions(new PublicKey(MINT), 20)`. For true transfer-level detail, parse each transaction's inner instructions to extract mint/burn/transfer operations, or use `getSignaturesForAddress` on the mint with the Token-2022 program.

---

### [HIGH] #4: Freeze form "Reason" field is created but never captured
- **Tab:** Freeze / Thaw (Tab 6)
- **Lines:** 1510-1513
- **Description:** The freeze form has a "Reason:" label and textbox, but the textbox is created anonymously (no variable assignment). The `freezeBtn.on('press')` handler at line 1519 only reads `freezeAddrInput` — the reason is silently discarded. Users type a reason that goes nowhere.
- **Fix:** Either capture the textbox in a variable and include the reason in the transaction (if the program supports it), or remove the reason field entirely to avoid misleading operators.

### [HIGH] #5: Frozen accounts list is never populated or displayed
- **Tab:** Freeze / Thaw (Tab 6)
- **Lines:** 385, 1588-1606
- **Description:** `state.frozenAccounts = []` is declared but never populated. The "Account Freeze Status" section just shows a static note: "Individual account freeze status requires per-account queries." No frozen accounts are ever listed, despite freeze/thaw being core compliance operations.
- **Fix:** After each freeze/thaw operation, query the token account state to confirm freeze status. Maintain a local list of known frozen accounts, or scan token accounts with `getProgramAccounts` filtering for frozen state (if the token program supports it via account data filtering).

### [HIGH] #6: No minter deactivation functionality
- **Tab:** Minters (Tab 5)
- **Lines:** 1446-1492, specifically 1479
- **Description:** The minter form is labeled "Add / Update Minter" but the submit handler hardcodes `isActive: true` (line 1479). There is no way to deactivate a minter (set `isActive: false`) or remove a minter from the registry through the TUI.
- **Fix:** Add a toggle or separate "Deactivate Minter" button that calls `updateMinter({ isActive: false, mintQuota: new BN(0) })`. Alternatively, add a checkbox/radio for active status in the existing form.

### [HIGH] #7: fetchBlacklist scans ALL program accounts without dataSize filter
- **Tab:** Blacklist (Tab 2)
- **Lines:** 213-237, specifically 216-219
- **Description:** `fetchBlacklist` uses `getProgramAccounts` with only a `memcmp` offset filter but NO `dataSize` filter. This means it fetches **every** account owned by the program, then tries to decode each one as `BlacklistEntry` (catching decode failures silently). As the program grows with more account types (minters, attestations, audit logs), this becomes increasingly expensive and slow.
- **Fix:** Add a `{ dataSize: <BlacklistEntry size> }` filter to the `filters` array, matching the pattern used in `fetchMinters` (line 191). Determine the exact `BlacklistEntry` account size from the IDL.

### [HIGH] #8: Status bar hardcodes "RPC: DEVNET" regardless of actual network
- **Tab:** All (status bar)
- **Lines:** 531
- **Description:** The status bar always shows `RPC: DEVNET` even when the user passes `--rpc https://api.mainnet-beta.solana.com` or any other URL. This is misleading and dangerous — operators could think they're on devnet while executing real mainnet transactions.
- **Fix:** Parse the RPC URL to determine network, or display the actual URL:
  ```js
  function detectNetwork(url) {
    if (url.includes('mainnet')) return 'MAINNET';
    if (url.includes('devnet')) return 'DEVNET';
    if (url.includes('testnet')) return 'TESTNET';
    if (url.includes('localhost') || url.includes('127.0.0.1')) return 'LOCAL';
    return 'CUSTOM';
  }
  ```

### [HIGH] #9: PROGRAM_ID is hardcoded with no CLI override
- **Tab:** Global
- **Lines:** 29
- **Description:** `PROGRAM_ID` is hardcoded as `'5ZBiFxX4ggWfNR5VhAQDRZauG6CvG84puS4SQiH8BcL4'` with no `--program` CLI flag or environment variable override. Every other key parameter (RPC, MINT, KEYPAIR) is configurable, but the program ID is not. This prevents using the TUI with different deployments.
- **Fix:** Add `--program` CLI arg and `PROGRAM_ID` env var support, matching the pattern of the other CLI args.

### [HIGH] #10: Attestation fetch is capped at 10
- **Tab:** Attestations (Tab 3)
- **Lines:** 241
- **Description:** `fetchAttestations` uses `Math.min(count, 10)` to cap fetched attestations at 10. For a compliance-focused stablecoin that requires regular GENIUS Act attestations, older attestations become invisible once index exceeds 10. There's no pagination or way to view historical attestations.
- **Fix:** Either raise the cap significantly, implement pagination (fetch in batches with offset controls), or add a "Load More" mechanism in the Attestations tab.

### [HIGH] #11: Burn form "Source Account" label is ambiguous
- **Tab:** Supply Ops (Tab 1)
- **Lines:** 887-927, specifically 887 and 919
- **Description:** The burn form label says "Source Account:" but the instruction account is named `tokenAccount` (line 919). Operators may enter a **wallet address** (pubkey) when the instruction actually requires the **token account address** (ATA). This will cause transaction failures with a confusing error.
- **Fix:** Rename the label to "Token Account (ATA):" and add a helper note. Alternatively, accept a wallet address and auto-derive the ATA using `getAssociatedTokenAddressSync`, matching the pattern used in the mint form.

---

### [MEDIUM] #12: Overview sparkline is synthetic, not real time-series data
- **Tab:** Overview (Tab 0)
- **Lines:** 764-780
- **Description:** The sparkline labeled "Recent Activity (last 7 data points)" doesn't show actual activity over time. It takes the total transaction count and distributes it evenly across 7 bars: `Math.floor(txCount / 7)`. This produces a flat bar chart regardless of actual activity patterns. It gives the appearance of analytics without providing any real insight.
- **Fix:** Use actual transaction timestamps to bucket transactions into time intervals (e.g., last 7 hours or last 7 refresh cycles), or remove the sparkline and show a simple "Transactions in last refresh: N" counter.

### [MEDIUM] #13: Confidential Transfers "COMING SOON" in 3 locations
- **Tab:** Overview (Tab 0), Config (Tab 9), Compliance (Tab 10)
- **Lines:** 746, 1726, 1937-1942
- **Description:** Three separate places show "COMING SOON" or "ZK Pending" for confidential transfers when the SSS-3 preset is enabled. While this reflects a real Solana limitation (ZK ElGamal Proof Program), the phrasing implies the TUI will support it in the future. No date or condition is specified for when this will resolve.
- **Fix:** Update the text to reference the Solana feature gate status. Link to the Solana feature gate tracking for ZK ElGamal Proof Program. Consider making the text dynamic based on whether the feature is actually enabled on the connected cluster.

### [MEDIUM] #14: Compliance clearance rate is misleading
- **Tab:** Compliance (Tab 10)
- **Lines:** 1879-1880
- **Description:** Clearance rate is calculated as `((holderCount - blCount) / holderCount) * 100`, but `holderCount` comes from `getTokenLargestAccounts` which returns at most 20 accounts. If there are 1000 actual holders and 5 blacklisted, the clearance shows `(20-5)/20 = 75%` instead of the true `99.5%`. The metric is mathematically incorrect.
- **Fix:** Either use actual total holder count (from `getTokenSupply` and `getProgramAccounts` for token accounts), or clearly label it as "Top 20 Clearance" and add a disclaimer.

### [MEDIUM] #15: No Solana address validation before transaction submission
- **Tab:** All tabs with forms
- **Lines:** 860, 911, 1018, 1062, 1116, 1120, 1351, 1389, 1475, 1525, 1567
- **Description:** Address inputs are passed directly to `new PublicKey(address)` inside the `executeTx` callback. If the address is invalid, it throws inside the async callback, and the error is caught as a generic "Transaction Failed" with a truncated error message. Users get no specific feedback about which field had the bad address.
- **Fix:** Validate addresses before calling `executeTx`:
  ```js
  try { new PublicKey(address); } catch { showMessage('Error', 'Invalid Solana address.', 2000); return; }
  ```

### [MEDIUM] #16: Attestation hash validation only checks length, not hex characters
- **Tab:** Attestations (Tab 3)
- **Lines:** 1241-1246
- **Description:** Hash validation checks `cleanHex.length !== 64` but doesn't verify that the string contains only valid hex characters (0-9, a-f, A-F). Invalid characters like 'g', 'z', or spaces would pass the length check and produce `NaN` bytes from `parseInt(..., 16)`, which would silently create a corrupted hash array sent to the chain.
- **Fix:** Add hex validation: `if (!/^[0-9a-fA-F]{64}$/.test(cleanHex)) { showMessage('Error', 'Hash must be 64 valid hex characters.'); return; }`

### [MEDIUM] #17: Compliance screening log is synthetic
- **Tab:** Compliance (Tab 10)
- **Lines:** 1900-1924
- **Description:** The "Screening Log" box just reformats existing blacklist entries and top holders from memory. It doesn't represent actual compliance screening events, risk scoring, or AML/KYC checks. It shows "[FLAG]" for blacklisted addresses and "[CLEAR]" for top holders, but no actual screening occurred.
- **Fix:** Either rename to "Blacklist Summary" to accurately reflect the data shown, or implement actual compliance event tracking (log each blacklist check during transfers, each attestation verification, etc.) if the on-chain program supports it.

### [MEDIUM] #18: MinterInfo dataSize hardcoded to 113
- **Tab:** Minters (Tab 5)
- **Lines:** 191
- **Description:** `fetchMinters` uses `{ dataSize: 113 }` as a filter to find MinterInfo accounts. This byte size is hardcoded and will silently break if the MinterInfo struct changes (added/removed fields, version upgrade). The fetch would return zero results with no error.
- **Fix:** Derive the account size from the IDL programmatically, or add a comment documenting how 113 was calculated so future developers can update it. Add a warning if zero accounts are returned but the config has minter-related activity.

### [MEDIUM] #19: fetchHolders function is dead code
- **Tab:** Global
- **Lines:** 261-275
- **Description:** `fetchHolders(mint)` is defined as a standalone function but is never called anywhere. The holder-fetching logic is instead inlined in `refreshData()` at lines 329-339, doing the exact same thing. This creates maintenance risk — a bug fix to one copy won't fix the other.
- **Fix:** Delete the standalone `fetchHolders` function and keep the inline version in `refreshData`, or refactor `refreshData` to call `fetchHolders(MINT)` and remove the inline duplication.

### [MEDIUM] #20: Silent error swallowing in all fetch functions
- **Tab:** Global
- **Lines:** 164-166, 181-183, 206, 231, 256, 272-274, 287-288, 339, 677
- **Description:** Every fetch function catches errors and returns null/empty arrays without logging or displaying the error. Only `refreshData()` at line 363 surfaces errors (to `liveData.error`). If `fetchMinters`, `fetchBlacklist`, `fetchAttestations`, or `fetchHolders` fail individually, the tab shows "No data" with no indication that a fetch error occurred vs. genuinely having no data.
- **Fix:** At minimum, log errors to a diagnostic buffer that the System Logs tab can display. Better: add per-section error states so each tab can show "Error loading minters: <reason>" instead of "No minters".

---

### [LOW] #21: frozenAccounts state property declared but unused
- **Tab:** Global
- **Lines:** 385
- **Description:** `state.frozenAccounts = []` is declared in the global state object but never written to or read from. It's a vestige of planned functionality that was never implemented.
- **Fix:** Remove the property, or implement the frozen accounts tracking (see HIGH #5).

### [LOW] #22: renderPlaceholderTab is effectively unreachable
- **Tab:** N/A
- **Lines:** 704, 2046-2052
- **Description:** `renderPlaceholderTab()` is only reachable via the `default` case in `renderTabContent()`. Since tab indices are controlled by the side menu (0-11) and keyboard shortcuts (0-11), no user action can trigger an out-of-range index. The function and its "MODULE PENDING ALLOCATION" text are dead code.
- **Fix:** Remove `renderPlaceholderTab()` and the `default` case, or keep as a defensive fallback but change the text to something more helpful (e.g., "Unknown tab index").

### [LOW] #23: Fixed sidebar width may overflow on narrow terminals
- **Tab:** Global
- **Lines:** 501, 509
- **Description:** Side menu has a fixed `width: 25` characters and main content uses `left: 25, width: '100%-25'`. On terminals narrower than ~60 columns, the main content area becomes too small to render tables and forms properly. No minimum terminal size check exists.
- **Fix:** Add a minimum terminal size check at startup:
  ```js
  if (screen.width < 80 || screen.height < 24) {
    console.error('Terminal must be at least 80x24. Current: ' + screen.width + 'x' + screen.height);
    process.exit(1);
  }
  ```

### [LOW] #24: Token holders limited to 20 by API
- **Tab:** Token Holders (Tab 7)
- **Lines:** 264, 1617
- **Description:** `getTokenLargestAccounts` is an RPC method that returns at most 20 accounts. The tab title says "Token Holders" but only shows the top 20. There's no indication that more holders may exist, and no pagination or search.
- **Fix:** Add a note in the table label: "Top 20 Holders (by balance)". For a more complete view, consider using `getProgramAccounts` with token-2022 account filters to count total holders, even if only the top 20 are displayed.

### [LOW] #25: contrib widgets use absolute screen positioning
- **Tab:** Blacklist, Attestations, Roles, Minters, Token Holders, Transfer History, Compliance
- **Lines:** 958-966, 1144-1152, 1283-1291, 1409-1417, 1613-1621, 1676-1684, 1889-1895
- **Description:** `contrib.table` and `contrib.gauge` widgets are appended to `screen` (not `mainContent`) and positioned using `getContentBounds()` which calculates absolute coordinates. On terminal resize, these widgets may not reposition correctly, causing overlap or overflow.
- **Fix:** Add a `screen.on('resize')` handler that re-renders the current tab: `screen.on('resize', () => { renderTabContent(); screen.render(); });`

---

## Architecture Notes

### What works well
- **Real on-chain data**: Config, roles, minters, blacklist, attestations, and holders all fetch live data from the Solana program via RPC.
- **Full transaction execution**: Mint, burn, blacklist add/remove, seize, freeze, thaw, role updates, authority transfer, pause/unpause all submit real on-chain transactions.
- **Auto-refresh**: 10-second polling with countdown timer and manual refresh (R key).
- **Read-only mode**: Gracefully degrades when no keypair is provided.
- **Onboarding flow**: Splash screen and preset picker provide guided entry.
- **All 12 tabs have renderers**: No tab falls through to the placeholder.

### Priority fix order
1. **CRITICAL #1** (float precision) — immediate financial correctness risk
2. **HIGH #8** (hardcoded DEVNET) — operator safety, mainnet risk
3. **CRITICAL #3** (wrong tx source) — Transfer History shows wrong data
4. **HIGH #7** (blacklist scan) — performance degradation over time
5. **CRITICAL #2** (no audit logs) — compliance gap
6. **HIGH #6** (no deactivate minter) — operational gap
7. **HIGH #4, #5** (freeze form/list) — incomplete freeze management
