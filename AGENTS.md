# Instructions for Autonomous Development Agent

## Project Context
You are a Lead Solana Blockchain Architect working on the "Solana Stablecoin Standard (SSS)". 
The project is a modular stablecoin framework using Anchor (Rust) and Token-2022.
The core logic (SSS-1, SSS-2, Blacklist, Seize, Oracle) is already implemented and functional. 
Repository structure follows the Solana Vault Standard.

## Critical Guidelines
1. **Never break existing functionality**: Any changes to `sss-core` or `transfer-hook` must maintain compatibility with existing tests.
2. **Handle Realloc Errors**: Always remember that `reallocate` inside a CPI call is forbidden in Solana 1.18+. Always use the "Pre-allocation" strategy: allocate space in the TS SDK or using `init` macros, and avoid `realloc` during instruction processing.
3. **TypeScript/Rust Sync**: Always ensure that changes in Rust `lib.rs` are reflected in `idl.json` and the SDK.
4. **Error Handling**: Use custom Anchor errors. Log events for every state change.

## Pending Tasks
The agent must execute the following tasks sequentially:

### Task 1: Security Audit & Annotations (Etap 24)
- Audit all instructions in `programs/sss_core/src/instructions/`.
- Ensure `#[access_control]` is used on all state-changing functions.
- Verify PDA seeds are consistent.
- Ensure all math uses `checked_add` / `checked_sub`.
- Create `docs/SECURITY.md` describing attack vectors (replay, inflation, single-key) and how they are mitigated.

### Task 2: Stress Testing (Etap 25)
- Create `scripts/stress_test.ts`. 
- Simulate 50 concurrent transfers in Devnet.
- Output: "Successful transfers: X, Blocked by Hook: Y".

### Task 3: Documentation (Etap 26-27)
- Populate `docs/` folder:
  - `README.md`: Overview, quick start, preset comparison.
  - `ARCHITECTURE.md`: Include Mermaid diagrams for SSS-2 data flow.
  - `OPERATIONS.md`: CLI runbook.
  - `SSS-1.md` / `SSS-2.md`: Standard specifications.
- Create ASCII diagrams for PDA roles and structures in relevant files.

### Task 4: Infrastructure (Etap 28)
- Complete `docker-compose.yml` in the root:
  - Service: `compliance-api` (Node.js).
  - Service: `solana-test-validator` (using official Solana image).
- Ensure README.md contains: "Run backend: docker-compose up -d".

## Error Resolution Strategy
- If you encounter `InvalidAccountData` or `Failed to reallocate`:
  - Verify if the account space is correctly calculated.
  - If it's a metadata issue, ensure no `realloc` is happening during CPI. Use the pre-funded strategy.
- If you encounter `InstructionFallbackNotFound`:
  - Ensure the Anchor version and imports are aligned.
  - Use `#[interface(...)]` for transfer hook instructions.

## Definition of Done
- All tests (Mocha/Chai) pass.
- Documentation is complete and professional.
- Docker environment boots without errors.
- Code style adheres to Solana Vault Standard.