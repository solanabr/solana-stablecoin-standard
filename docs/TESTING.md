# Testing

## Commands

```bash
npm --prefix sdk/core run build
npm --prefix cli run build
npm --prefix services/mint-burn run build
npm --prefix services/indexer run build
npm --prefix services/compliance run build
anchor build
cargo test --workspace --locked
anchor test --skip-build --provider.cluster localnet
```

## Latest Verification (2026-03-13 20:12:22Z)

- `npm --prefix sdk/core run build`: pass
- `npm --prefix cli run build`: pass
- `npm --prefix services/mint-burn run build`: pass
- `npm --prefix services/indexer run build`: pass
- `npm --prefix services/compliance run build`: pass
- `anchor build`: pass
- `cargo test --workspace --locked`: pass
- `anchor test --skip-build --provider.cluster localnet`: failed in this environment because `solana-test-validator` binary is missing

## Notes

- The codebase now uses one program (`sss-1`) for both core and optional hook-module flows.
- Hook-module integration tests remain in `tests/sss-2-hook.ts` but execute against `anchor.workspace.Sss1`.
