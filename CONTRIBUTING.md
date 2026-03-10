# Contributing

Thank you for your interest in contributing to the Solana Stablecoin Standard.

## Development Setup

### Prerequisites

- Rust 1.75+ with `solana` target
- Anchor CLI 0.32.1
- Solana CLI 2.3.0
- Node.js 20+
- Yarn

### Getting Started

```bash
git clone https://github.com/solanabr/solana-stablecoin-standard.git
cd solana-stablecoin-standard

# Install dependencies
yarn install

# Build programs
anchor build

# Run tests
anchor test
```

### Project Structure

```
programs/
  sss-core/    # Core stablecoin program (SSS-1 + SSS-2 presets)
  sss-hook/    # Transfer hook for SSS-2 compliance
modules/
  sss-events/  # Shared event definitions
sdk/
  src/         # TypeScript SDK + CLI
tests/         # Anchor integration tests
docs/          # Documentation
```

## Code Standards

### Rust / Anchor

- No `unwrap()` in production code. Use `?` or explicit error handling.
- Use checked arithmetic (`checked_add`, `checked_sub`, `checked_mul`).
- Document all public functions with `///` comments.
- Run `cargo fmt` and `cargo clippy -- -W clippy::all` before committing.
- Use `#[derive(InitSpace)]` for account sizing.

### TypeScript

- Strict mode, no `any` types.
- Use `BN` for all on-chain numeric values.
- Format with Prettier.

### Commit Messages

Use conventional commits:
- `feat:` for new features
- `fix:` for bug fixes
- `docs:` for documentation
- `test:` for tests
- `refactor:` for code changes that don't add features or fix bugs

## Testing

All changes must pass existing tests and include tests for new functionality:

```bash
# Run all tests
anchor test

# Run specific test file
yarn run ts-mocha -p ./tsconfig.json -t 1000000 tests/sss-1.ts
```

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
