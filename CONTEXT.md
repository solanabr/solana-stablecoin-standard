# sss-sdk Context

## Current Status
All assigned tasks complete. Awaiting PR reviews.

## Completed Work

### SSS-052 — DONE ✅ (2026-03-15)
- fetchCdpPosition(wallet, connection, pythFeeds?) → CdpPosition
  - Live Pyth oracle prices via @pythnetwork/client parsePriceData
  - CollateralVault discovery via getProgramAccounts discriminator filter
  - Accurate ratio/healthFactor/liquidationPrice; graceful feed failure handling
- fetchCollateralTypes(connection, pythFeeds?) → CollateralType[]
  - Program-wide CollateralVault scan, mint aggregation (activeVaults, totalDeposited)
  - Optional Pyth prices per type; malformed accounts skipped
- CollateralType interface exported from sdk/src/index.ts
- @pythnetwork/client added to SDK dependencies
- 16 new tests; 138/138 total passing
- PR #122: https://github.com/solanabr/solana-stablecoin-standard/pull/122
- Branch: feat/sss-052-cdp-module-fetchcollateraltypes

### SSS-054 — DONE ✅ (2026-03-15)
- Fixed CDP liquidation insolvency bug (SSS-049 follow-up)
- Root cause: cdp_liquidate zeroed ALL debt but only seized ONE CollateralVault
- Fix: restrict CDP to single collateral per position (1:1 CollateralVault:CdpPosition)
- Changes:
  - CdpPosition gains `collateral_mint: Pubkey` field (locked on first borrow)
  - cdp_borrow_stable: sets collateral_mint on init; rejects wrong mint with WrongCollateralMint
  - cdp_liquidate: account constraint enforces vault collateral_mint == position collateral_mint
  - New SssError::WrongCollateralMint added to error.rs
- 2 new anchor tests (28/28 total pass)
- PR #65: https://github.com/dcccrypto/solana-stablecoin-standard/pull/65
- Branch: fix/sss-054-cdp-single-collateral

### SSS-051 — DONE ✅ (2026-03-15)
- CdpModule added to SDK (Direction 2)
- Functions: depositCollateral, borrowStable, repayStable, getPosition
- Types: CdpPosition, CollateralEntry (full health metrics)
- PDA helpers: getCollateralVaultPda, getCdpPositionPda
- Exported from sdk/src/index.ts
- 20 Vitest unit tests; full suite 122/122
- PR #63: https://github.com/dcccrypto/solana-stablecoin-standard/pull/63

### SSS-049 — DONE ✅ (2026-03-15)
- Multi-Collateral CDP (Direction 2) implemented
- 4 new Anchor instructions: cdp_deposit_collateral, cdp_borrow_stable, cdp_repay_stable, cdp_liquidate
- New state: CollateralVault PDA + CdpPosition PDA
- Pyth oracle integration: pyth-sdk-solana 0.10.6, 60s staleness, Trading status check
- Collateral ratio: 150% min borrow, 120% liquidation threshold
- 26/26 anchor tests pass (7 new CDP tests)
- PR #62: https://github.com/dcccrypto/solana-stablecoin-standard/pull/62

### SSS-048 — DONE ✅
- docs/PROOF-OF-RESERVES.md written: user guide + API reference (direction 1)
- README.md updated with new "Advanced Features" section
- PR #61: https://github.com/dcccrypto/solana-stablecoin-standard/pull/61

### SSS-046 — DONE ✅
- PR #60: https://github.com/dcccrypto/solana-stablecoin-standard/pull/60
- Endpoint: GET /api/reserves/proof

### SSS-047 — DONE ✅
- ProofOfReserves SDK module implemented
- PR #59: https://github.com/dcccrypto/solana-stablecoin-standard/pull/59

### SSS-030 — DONE ✅
- Mainnet readiness audit, PR #58

### SSS-043 — DONE ✅
- SDK module stubs (5 directions), PR #114 to solanabr fork

### SSS-044 — DONE ✅
- Backend API endpoint stubs (5 directions), PR #56

## Test History
- **Anchor:** 28/28 — 2026-03-15 05:09 UTC (2 new SSS-054 tests)
- **Backend (cargo):** 35/35 — 2026-03-15 04:14 UTC
- **SDK (vitest unit):** 138/138 — 2026-03-15 05:16 UTC (16 new SSS-052 tests)
- **Spikes (vitest):** 82/82 — 2026-03-15 03:24 UTC

## Open PRs
- PR #122 — SSS-052 fetchCdpPosition + fetchCollateralTypes — awaiting review
- PR #65 — SSS-054 CDP single-collateral fix — awaiting review

## CDP Architecture Notes (post SSS-054)
- CollateralVault PDA seeds: ["cdp-collateral-vault", sss_mint, user, collateral_mint]
- CdpPosition PDA seeds: ["cdp-position", sss_mint, user]
- CdpPosition.collateral_mint: locked on first borrow, immutable thereafter
- Liquidation: full position (all debt burned, single collateral vault seized)
- Pyth price expo assumed negative; uses price.expo.unsigned_abs()
- Borrow limit: floor(collateral_value_usd * 10^sss_decimals * 10000 / 15000 / 10^6)

## Next
- Await PR reviews/merges (PR #122, PR #65)
- Monitor for new backlog tasks
