# Starter Prompt — Paste this into a new Claude Code session

```
I'm building a submission for the Superteam Brazil bounty "Build the Solana Stablecoin Standard" ($5K total, $2.5K 1st place). Deadline: March 14, 2026.

## Repo
- Local: ~/local-dev/solana-stablecoin-standard/
- Fork: rz1989s/solana-stablecoin-standard (origin)
- Upstream: solanabr/solana-stablecoin-standard (submit PR here at the end)
- Design doc: docs/plans/2026-02-24-sss-design.md (read this first)

## Bounty URL
https://superteam.fun/earn/listing/build-the-solana-stablecoin-standard-bounty

## Architecture (decided)
- 2 Anchor programs: `sss-core` (universal stablecoin management) + `sss-transfer-hook` (blacklist/allowlist compliance)
- 3 presets (SDK-level, not program-level): SSS-1 (minimal), SSS-2 (compliant), SSS-3 (private/confidential)
- TypeScript SDK (`@sss/sdk`), Rust CLI (`sss-cli`), Backend services (Express/Fastify)
- Transfer hooks + confidential transfers are INCOMPATIBLE — SSS-2 uses hooks, SSS-3 uses auditor key mechanism

## Strategy
- Full sweep on bonus features (up to 50%): SSS-3, Oracle integration, Admin TUI (ratatui), Example frontend (Next.js)
- Single PR at the end (build/audit/roast internally, submit polished final product)
- SSS-3 is our killer differentiator — no competitor has ZK/privacy experience. I have SIP Protocol background ($16.5K in Solana Foundation grants, Zypherpunk hackathon winner)

## Evaluation Criteria
- SDK Design & Modularity: 20%
- Completeness: 20%
- Code Quality: 20%
- Security: 15%
- Authority (my credentials): 20%
- Usability & Documentation: 5%
- Bonus: up to 50%

## Competitors (5 PRs submitted)
- Strongest: PR #3 (Harshil — 5 test files, 10 examples) and PR #5 (Peter — Rust CLI, devnet proofs, CI, 11 docs)
- Nobody has SSS-3, fuzz tests, TUI, oracle integration, or frontend

## What to do now
1. Read the design doc: docs/plans/2026-02-24-sss-design.md
2. Use /superpowers:writing-plans to create a detailed implementation plan
3. Then execute the plan with parallel agents, audit/roast cycles
4. Monorepo structure: programs/, sdk/, cli/, backend/, tui/, frontend/, tests/, trident-tests/, scripts/, deployments/, docs/
```
