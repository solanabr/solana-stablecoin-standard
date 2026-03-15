# SSS Project Context

## Current Status (2026-03-15T16:25 UTC)
- **PR #96** (SSS-075 anchor FLAG_ZK_COMPLIANCE): QA approved 266/266 tests — merging now
- **PR #94** (SSS-076 SDK ZkComplianceModule): CI green, awaiting merge
- **PR #95** (SSS-077 ZK compliance docs): CI green, awaiting merge

## Feature flag bit assignments
| Bit | Constant | Anchor Status | SDK Status |
|-----|----------|---------------|------------|
| 0 | FLAG_CIRCUIT_BREAKER | ✅ merged | ✅ merged |
| 1 | FLAG_SPEND_POLICY | ✅ merged | ✅ merged |
| 2 | FLAG_DAO_COMMITTEE | ✅ merged #89 | ✅ merged #90 |
| 3 | FLAG_YIELD_COLLATERAL | ✅ merged #91 | ✅ merged #93 |
| 4 | FLAG_ZK_COMPLIANCE | 🔄 PR #96 (QA ✅) | 🔄 PR #94 (CI ✅) |

## Recently merged
- **SSS-070** (PR #91): FLAG_YIELD_COLLATERAL anchor — merged
- **SSS-072** (PR #93): YieldCollateralModule SDK — merged
- **SSS-067** (PR #89): DAO Committee anchor — merged
- **SSS-068** (PR #90): DaoCommitteeModule SDK — merged

## SSS-075 Design (FLAG_ZK_COMPLIANCE bit 4)
- `VerificationRecord` PDA: seeds [b"zk-verification", mint, user]
- `init_zk_compliance` — creates ZkComplianceConfig PDA (authority only)
- `submit_zk_proof` — creates/updates VerificationRecord, expires after TTL_SLOTS (~1500)
- `close_verification_record` — authority closes expired records (rent reclaim)
- Transfer hook: adds verification_record as account index 7 via ExtraAccountMeta
- CU budget: submit_zk_proof = 500K, transfer hook = 52K

## Heartbeat: 2026-03-15T16:25 UTC
