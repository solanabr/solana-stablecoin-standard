# npm Publishing Guide

This guide covers release and publish steps for SDK, CLI, and TUI packages.

---

## Current Package Status (as of 2026-03-14)

| Package | Local Version | npm Latest | Status |
|---|---:|---:|---|
| `solana-stablecoin-sdk` | `0.1.2` | `0.1.1` | Republish pending |
| `solana-stablecoin-cli` | `0.1.4` | `0.1.3` | Republish pending |
| `solana-stablecoin-tui` | `0.1.1` | not found | First publish pending |

Registry checks:

```bash
npm view solana-stablecoin-sdk version
npm view solana-stablecoin-cli version
npm view solana-stablecoin-tui version
```

---

## Prerequisites

- npm account with publish permissions
- `npm login`
- Clean working tree
- Built artifacts passing tests

Recommended:

```bash
npm run test:unit
npm run build
```

---

## SDK Publish (`solana-stablecoin-sdk`)

```bash
cd sdk
npm version patch    # or minor/major
npm publish --access public
```

Consumers:

```bash
npm i solana-stablecoin-sdk
```

---

## CLI Publish (`solana-stablecoin-cli`)

```bash
cd cli
npm version patch
npm publish --access public
```

Consumers:

```bash
npm i -g solana-stablecoin-cli
sss-token --help
```

---

## TUI Publish (`solana-stablecoin-tui`) — First Release

### 1) Prepare package metadata

In `tui/package.json`, make sure:

- `name` is final (`solana-stablecoin-tui`)
- `version` is intended release (`0.1.1` or higher)
- `main` points to built JS entry (recommended `dist/index.js`)
- `files` includes `dist` and docs
- add `bin` if you want command usage (example: `sss-tui`)

### 2) Build output

```bash
cd tui
npm run build
```

### 3) Publish package

```bash
npm publish --access public
```

### 4) Verify

```bash
npm view solana-stablecoin-tui version
```

Consumers:

```bash
npm i -g solana-stablecoin-tui
```

---

## Suggested Release Flow

1. Bump versions in changed packages.
2. Update changelog/README snippets.
3. Run tests/build.
4. Publish SDK first, then CLI, then TUI.
5. Update root README package table.
6. Tag release in Git.
