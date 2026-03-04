# Solana Stablecoin Standard (SSS)

Open-source standards for issuing stablecoins on Solana, built on Token-2022.

SSS defines two interoperable presets — **SSS-1** (minimal) and **SSS-2** (compliant) — backed by auditable on-chain programs, a TypeScript SDK, a CLI, and a backend service suite.

---

## Presets

| Feature | SSS-1 | SSS-2 |
|---|---|---|
| Token-2022 | Yes | Yes |
| MetadataPointer | Yes | Yes |
| FreezeAuthority (config PDA) | Yes | Yes |
| PermanentDelegate (config PDA) | No | Yes |
| TransferHook (blacklist enforcement) | No | Yes |
| DefaultAccountState: Frozen | No | Optional |
| Blacklist | No | Yes |
| Token seizure | No | Yes |
| GENIUS Act alignment | Partial | Full |
| **Use case** | DAO treasury, ecosystem tokens | Regulated payment stablecoins |

---

## Architecture

SSS uses a three-layer model:

```
┌──────────────────────────────────────┐
│  Presets                             │
│  SSS-1 (minimal)  SSS-2 (compliant) │
├──────────────────────────────────────┤
│  Modules                             │
│  roles  compliance  authority        │
├──────────────────────────────────────┤
│  Base SDK / On-Chain Programs        │
│  sss-token program  transfer-hook    │
└──────────────────────────────────────┘
```

- **Base layer** - The `sss_token` Anchor program manages all stablecoin lifecycle operations. The `transfer_hook` program enforces the blacklist on every Token-2022 transfer.
- **Modules** - Role-based access control (Minter, Freezer, Pauser, Burner, Blacklister, Seizer), two-step authority transfer, compliance operations.
- **Presets** - Named configurations passed to `initialize`. SSS-1 omits compliance extensions. SSS-2 enables PermanentDelegate + TransferHook.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for full detail.

---

## Quick Start

### TypeScript SDK

Install:

```bash
npm install @stbr/sss-token
```

**SSS-1 — Minimal stablecoin:**

```typescript
import { Connection, Keypair } from "@solana/web3.js";
import { SolanaStablecoin, Presets } from "@stbr/sss-token";

const connection = new Connection("https://api.devnet.solana.com", "confirmed");
const authority = Keypair.fromSecretKey(/* your key bytes */);

// Create
const stable = await SolanaStablecoin.create(connection, {
  preset: Presets.SSS_1,
  name: "My Stablecoin",
  symbol: "MUSD",
  decimals: 6,
  authority,
});

console.log("Mint:", stable.mint.toBase58());

// Mint tokens
await stable.mint({ recipient: someWallet, amount: 1_000_000n });

// Freeze an account
await stable.freezeAccount(tokenAccount);
```

**SSS-2 — Compliant stablecoin:**

```typescript
import { Connection, Keypair } from "@solana/web3.js";
import { SolanaStablecoin, Presets } from "@stbr/sss-token";

const stable = await SolanaStablecoin.create(connection, {
  preset: Presets.SSS_2,
  name: "Compliant USD",
  symbol: "CUSD",
  decimals: 6,
  authority,
});

// Add address to blacklist (blocks all transfers immediately via hook)
await stable.compliance.blacklistAdd(sanctionedWallet, "OFAC SDN match");

// Freeze the account
await stable.freezeAccount(sanctionedTokenAccount);

// Seize tokens via permanent delegate
await stable.compliance.seize({
  from: sanctionedTokenAccount,
  to: complianceTreasuryAccount,
  amount: 10_000_000n,
});
```

### CLI

```bash
# Initialize SSS-1
npx sss-token init \
  --name "My USD" \
  --symbol MUSD \
  --decimals 6 \
  --preset sss-1

# Initialize SSS-2
npx sss-token init \
  --name "Compliant USD" \
  --symbol CUSD \
  --decimals 6 \
  --preset sss-2

# Mint tokens
npx sss-token mint \
  --mint <MINT_PUBKEY> \
  --recipient <WALLET_PUBKEY> \
  --amount 1000000

# Freeze an account
npx sss-token freeze --mint <MINT_PUBKEY> --account <TOKEN_ACCOUNT>

# SSS-2: blacklist an address
npx sss-token blacklist add \
  --mint <MINT_PUBKEY> \
  --address <WALLET_PUBKEY> \
  --reason "OFAC SDN"

# SSS-2: seize tokens
npx sss-token seize \
  --mint <MINT_PUBKEY> \
  --from <TOKEN_ACCOUNT> \
  --to <DEST_ACCOUNT> \
  --amount 1000000
```

---

## Repository Structure

```
.
├── programs/
│   ├── sss-token/          - Core Anchor program (SSS-1 + SSS-2)
│   │   └── src/
│   │       ├── lib.rs          - Program entry, instruction routing
│   │       ├── state.rs        - StablecoinConfig, MinterRole, RoleEntry, BlacklistEntry
│   │       ├── error.rs        - StablecoinError enum
│   │       ├── events.rs       - On-chain events
│   │       └── instructions/   - One file per instruction group
│   └── transfer-hook/      - SSS-2 transfer hook program (blacklist enforcement)
│       └── src/
│           ├── lib.rs          - Program entry
│           └── instructions/   - initialize, execute, update
├── sdk/
│   └── core/               - @stbr/sss-token TypeScript SDK + CLI
│       └── src/
│           ├── stablecoin.ts   - SolanaStablecoin class
│           ├── compliance.ts   - ComplianceModule class
│           ├── pda.ts          - PDA derivation utilities
│           ├── types.ts        - TypeScript types and constants
│           ├── cli.ts          - CLI entry point
│           └── index.ts        - Package exports
├── tests/
│   ├── sss-1.ts            - Integration tests: SSS-1 preset
│   ├── sss-2.ts            - Integration tests: SSS-2 preset
│   └── helpers/
│       └── setup.ts        - Test utilities
├── backend/
│   ├── mint-service/       - REST API for minting (port 3001)
│   ├── indexer/            - On-chain event indexer + webhook emitter
│   ├── compliance-service/ - REST API for compliance ops (port 3003)
│   └── docker-compose.yml
├── docs/
│   ├── ARCHITECTURE.md
│   ├── SSS-1.md
│   ├── SSS-2.md
│   ├── COMPLIANCE.md
│   ├── SDK.md
│   ├── API.md
│   └── OPERATIONS.md
├── Anchor.toml
├── Cargo.toml
└── package.json
```

---

## Program IDs

| Program | ID |
|---|---|
| `sss_token` | `Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS` |
| `transfer_hook` | `HmbTLCmaGvZhKnn1Zfa1JVnp7vkMV4DYVxPLWBVoN65` |

---

## Development Setup

**Prerequisites:**
- Rust + Cargo
- Solana CLI >= 2.1
- Anchor CLI 0.32.1
- Node.js >= 18
- Yarn

**Build programs:**

```bash
anchor build
anchor keys sync
```

**Run integration tests:**

```bash
anchor test
```

**Run SDK unit tests:**

```bash
yarn workspace @stbr/sss-token test
```

**Deploy to devnet:**

```bash
anchor deploy --provider.cluster devnet
```

**Start backend services:**

```bash
cp backend/.env.example backend/.env
# Edit backend/.env with your RPC_URL and KEYPAIR_PATH
docker compose -f backend/docker-compose.yml up
```

---

## Documentation

- [Architecture](docs/ARCHITECTURE.md) - Three-layer model, PDA layout, transfer hook flow
- [SSS-1 Specification](docs/SSS-1.md) - Minimal stablecoin standard
- [SSS-2 Specification](docs/SSS-2.md) - Compliant stablecoin standard
- [Compliance](docs/COMPLIANCE.md) - GENIUS Act alignment, OFAC integration
- [SDK Reference](docs/SDK.md) - Full `@stbr/sss-token` API
- [API Reference](docs/API.md) - Backend service REST APIs
- [Operations Runbook](docs/OPERATIONS.md) - Deployment, minting, incident response

---

## License

Apache 2.0
