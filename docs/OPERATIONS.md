# Operations Runbook

## Prerequisites

| Tool | Version |
|---|---|
| Rust + `cargo-build-sbf` | `stable` channel |
| Anchor CLI | `0.31.x` |
| Solana CLI | `1.18.x` or later |
| Node.js | `>= 18` |
| Yarn | `1.x` (classic) |

A funded Solana keypair must exist at `~/.config/solana/id.json` or be specified via `--keypair`. For devnet, request an airdrop:

```bash
solana airdrop 2 --url devnet
```

---

## Deploy Programs

**1. Build**

```bash
anchor build
yarn install && yarn build
```

`anchor build` compiles both `sss-token` and `transfer-hook` using `cargo-build-sbf` and generates IDL files in `target/idl/`. `yarn build` compiles the TypeScript SDK and CLI.

Expected non-blocking build warnings:
- `Package has two crate types defined: cdylib and lib ... this precludes LTO` — inherent to Anchor programs with a `cpi` feature.
- `undefined and not known syscalls in program: [...]` — standard post-processing warning; no runtime impact.

**2. Deploy to devnet**

```bash
anchor deploy --provider.cluster devnet
```

Program IDs (same on localnet and devnet):

| Program | ID |
|---|---|
| `sss_token` | `E7iCiXrkudyt5j1nVHHmbuqCEyLP2hD4VGNJyuPAdWwP` |
| `transfer_hook` | `6tULvFAJ7HfaMsjqcUyS7G3kJyncrBsth9kp2UGramiY` |

**3. Revoke upgrade authority (production)**

```bash
solana program set-upgrade-authority <PROGRAM_ID> --final --url mainnet-beta
```

Run for both program IDs. This step is irreversible and makes the programs immutable.

---

## CLI Reference

The CLI binary is `sss-token` (entry point: `cli/dist/index.js`).

**Global flags** (available on every command):

```
--cluster <mainnet|devnet|testnet|localnet|URL>   RPC endpoint (default: devnet)
--keypair <path>                                  Authority keypair JSON
--mint <address>                                  Mint address (overrides .sss-config.json)
--json                                            Machine-readable JSON output
```

### `init`

Deploy a new stablecoin.

```bash
sss-token init --name "USD Backed" --symbol "USDB" --preset sss-2 \
  --decimals 6 --uri "https://example.com/meta.json" --keypair ./authority.json
```

Options: `--preset sss-1|sss-2` (default `sss-1`), `--decimals` (default `6`), `--uri`, `--config <path>` / `--custom <path>` (JSON or TOML config file), `--mint-keypair <path>` (auto-generated if omitted). Saves the mint address to `.sss-config.json`.

Initialize from a config file (JSON or TOML):

```bash
sss-token init --config ./my-stablecoin.json --keypair ./authority.json
sss-token init --custom ./config.toml --keypair ./authority.json
```

JSON config format:

```json
{
  "name": "Custom Stable",
  "symbol": "CUSD",
  "decimals": 6,
  "uri": "",
  "preset": "sss-2"
}
```

TOML config format:

```toml
name = "Custom Stable"
symbol = "CUSD"
decimals = 6
uri = ""
preset = "sss-2"
```

### `status`

```bash
sss-token status --mint <MINT_ADDRESS>
```

### `mint`

```bash
sss-token mint <RECIPIENT_WALLET> <AMOUNT> --keypair ./minter.json
```

`<AMOUNT>` is in display units (e.g., `100.5`). The CLI converts to raw units using the on-chain `decimals` value. Use `--minter <path>` to provide a separate minter keypair.

### `burn`

```bash
sss-token burn <AMOUNT> --keypair ./burner.json
```

### `freeze` / `thaw`

```bash
sss-token freeze <WALLET_ADDRESS> --keypair ./authority.json
sss-token thaw   <WALLET_ADDRESS> --keypair ./authority.json
```

### `pause` / `unpause`

```bash
sss-token pause   --keypair ./pauser.json
sss-token unpause --keypair ./pauser.json
```

### `blacklist` (SSS-2 only)

```bash
# Add
sss-token blacklist add <WALLET> --reason "sanctions screening" --keypair ./blacklister.json

# Remove
sss-token blacklist remove <WALLET> --keypair ./blacklister.json

# Check single address
sss-token blacklist check <WALLET>

# List all blacklisted addresses
sss-token blacklist list
```

### `seize` (SSS-2 only)

```bash
sss-token seize <FROM_WALLET> <AMOUNT> --to <TREASURY_WALLET> --keypair ./seizer.json
```

### `supply`

```bash
sss-token supply --mint <MINT_ADDRESS>
```

Shows the current circulating supply (totalMinted - totalBurned).

### `minters`

```bash
# List all minters with quota info
sss-token minters list --mint <MINT_ADDRESS>

# Add a new minter with a quota (in display units)
sss-token minters add <ADDRESS> --quota 10000 --keypair ./authority.json

# Remove a minter
sss-token minters remove <ADDRESS> --keypair ./authority.json
```

The `<FROM_WALLET>`'s token account must be frozen before calling.

---

## Common Workflows

### Mint Lifecycle

1. Deploy:
   ```bash
   sss-token init --name "USDB" --symbol "USDB" --preset sss-1 --keypair ./authority.json
   ```
2. Grant Minter role (SDK):
   ```typescript
   await coin.addMinter(authority, minterPublicKey, 1_000_000n * 10n ** 6n);
   ```
3. Mint:
   ```bash
   sss-token mint <RECIPIENT> 10000 --keypair ./minter.json
   ```
4. For SSS-2, thaw the recipient's ATA before first use:
   ```bash
   sss-token thaw <RECIPIENT> --keypair ./authority.json
   ```

### Freeze / Seize Workflow (SSS-2)

1. Blacklist the address to block transfers immediately:
   ```bash
   sss-token blacklist add <WALLET> --reason "court order 2024-001" --keypair ./blacklister.json
   ```
2. Freeze the token account:
   ```bash
   sss-token freeze <WALLET> --keypair ./authority.json
   ```
3. After legal authorization, seize to treasury:
   ```bash
   sss-token seize <WALLET> <AMOUNT> --to <TREASURY> --keypair ./seizer.json
   ```
4. Optionally remove from the blacklist once resolved:
   ```bash
   sss-token blacklist remove <WALLET> --keypair ./blacklister.json
   ```

### Pause Response

```bash
# Halt operations
sss-token pause --keypair ./pauser.json

# Resume
sss-token unpause --keypair ./pauser.json
```

The pause flag blocks `mintTokens` and `burnTokens` at the program level. Token-2022 transfers are not blocked by the pause flag directly. For a full transfer halt on SSS-2, freeze individual accounts or rely on `DefaultAccountState(Frozen)`.

---

## Key Rotation (transferAuthority)

There is no CLI command for authority rotation because it is high-risk. Use the SDK directly:

```typescript
import { SolanaStablecoin } from "@stbr/sss-sdk";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";

const connection = new Connection("https://api.devnet.solana.com", "confirmed");
const currentAuthority = Keypair.fromSecretKey(/* current authority bytes */);
const newAuthorityKey = new PublicKey("NewAuthorityAddress...");

const coin = await SolanaStablecoin.load(connection, new PublicKey("MintAddress..."));
const sig = await coin.transferAuthority(currentAuthority, newAuthorityKey);
console.log("Authority transferred:", sig);
```

**Warnings:**
- Verify the new authority address before signing. The change takes effect on confirmation.
- If the new authority key is lost, the stablecoin becomes permanently unmanaged.
- For production, the new authority should be a hardware wallet or on-chain multisig (e.g., Squads).
- All subsequent admin operations must be signed by the new authority.
