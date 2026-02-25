# Testing

## Running the test suite

```bash
anchor test
```

Starts a local validator, deploys both programs (`sss-token` and `transfer-hook`), and runs all integration tests.

## Current status

```
14 passing (~17s)
```

| Suite | Tests |
|---|---|
| SSS-1: minimal stablecoin lifecycle | 8 |
| SSS-2: compliant stablecoin lifecycle | 6 |

No Rust compiler warnings and no Node runtime warnings in test suite output.

## Coverage

**SSS-1** — initialize, mint with quota, quota enforcement, burn, freeze/thaw, pause/unpause, authority transfer.

**SSS-2** — initialize with all extensions, SSS-2 instructions rejected on SSS-1 token, thaw-then-mint flow, blacklist add/remove lifecycle, token seizure via permanent delegate, seizure rejected when account is not frozen.

## Expected build-tool warnings (non-blocking)

Two warnings are emitted by `cargo-build-sbf` during compilation. Both are inherent to the Anchor toolchain and do not indicate bugs.

### 1. Dual crate-type LTO warning

```
Package has two crate types defined: cdylib and lib ... this precludes LTO
```

Anchor programs must declare both `cdylib` (the on-chain BPF binary) and `lib` (for CPI consumers and unit tests). Cargo cannot apply LTO across both crate types simultaneously. This is a known Cargo limitation and is expected for any Anchor program that exposes a `cpi` feature.

### 2. Post-processing undefined syscalls

```
undefined and not known syscalls in program: [...]
```

`cargo-build-sbf` runs a post-processing pass to validate syscall references in the compiled SBF binary. Some syscall stubs included transitively by the Rust standard library are flagged here even though they are never reached at runtime. This warning is standard across Solana programs and is non-blocking.

## Notes

- The `seize` instruction uses `spl_token_2022::onchain::invoke_transfer_checked` rather than a raw `invoke_signed`. This ensures the extra account metas required by the transfer hook (hook program, validation PDA, blacklist PDAs) are added to the instruction's account metas — not just the account infos — so Token-2022 can resolve them correctly when invoking the hook.
- SSS-2 accounts use the `DefaultAccountState(Frozen)` extension; token accounts must be thawed before first use.
