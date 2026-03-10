import { Router, Request, Response } from "express";
import { Connection, PublicKey } from "@solana/web3.js";
import { config } from "../config";
import { createLogger } from "../logger";

const log = createLogger("routes:info");
const router = Router();

// ── Helpers ─────────────────────────────────────────────────────────────────

function isValidPublicKey(value: string): boolean {
  try {
    new PublicKey(value);
    return true;
  } catch {
    return false;
  }
}

function getConnection(): Connection {
  return new Connection(config.solana.rpcUrl, "confirmed");
}

function deriveConfigPda(mint: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("config"), mint.toBuffer()],
    new PublicKey(config.programs.sssCore)
  );
}

function deriveMinterStatePda(
  configPda: PublicKey,
  minter: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("minter"), configPda.toBuffer(), minter.toBuffer()],
    new PublicKey(config.programs.sssCore)
  );
}

// ── StablecoinConfig account parsing ────────────────────────────────────────
// Layout (after 8-byte Anchor discriminator):
//   mint:               32 bytes (Pubkey)
//   preset:              1 byte  (u8)
//   authority:          32 bytes (Pubkey)
//   pending_authority:  32 bytes (Pubkey)
//   master_minter:      32 bytes (Pubkey)
//   pauser:             32 bytes (Pubkey)
//   blacklister:        32 bytes (Pubkey)
//   paused:              1 byte  (bool)
//   total_minted:        8 bytes (u64 LE)
//   total_burned:        8 bytes (u64 LE)
//   bump:                1 byte  (u8)
//   mint_authority_bump: 1 byte  (u8)

interface ParsedStablecoinConfig {
  mint: string;
  preset: number;
  authority: string;
  pendingAuthority: string;
  masterMinter: string;
  pauser: string;
  blacklister: string;
  paused: boolean;
  totalMinted: string;
  totalBurned: string;
  bump: number;
  mintAuthorityBump: number;
}

function parseStablecoinConfig(data: Buffer): ParsedStablecoinConfig {
  let offset = 8; // skip discriminator

  const mint = new PublicKey(data.subarray(offset, offset + 32)).toBase58();
  offset += 32;

  const preset = data[offset];
  offset += 1;

  const authority = new PublicKey(data.subarray(offset, offset + 32)).toBase58();
  offset += 32;

  const pendingAuthority = new PublicKey(data.subarray(offset, offset + 32)).toBase58();
  offset += 32;

  const masterMinter = new PublicKey(data.subarray(offset, offset + 32)).toBase58();
  offset += 32;

  const pauser = new PublicKey(data.subarray(offset, offset + 32)).toBase58();
  offset += 32;

  const blacklister = new PublicKey(data.subarray(offset, offset + 32)).toBase58();
  offset += 32;

  const paused = data[offset] === 1;
  offset += 1;

  const totalMinted = data.readBigUInt64LE(offset).toString();
  offset += 8;

  const totalBurned = data.readBigUInt64LE(offset).toString();
  offset += 8;

  const bump = data[offset];
  offset += 1;

  const mintAuthorityBump = data[offset];

  return {
    mint,
    preset,
    authority,
    pendingAuthority,
    masterMinter,
    pauser,
    blacklister,
    paused,
    totalMinted,
    totalBurned,
    bump,
    mintAuthorityBump,
  };
}

// ── MinterState account parsing ─────────────────────────────────────────────
// Layout (after 8-byte discriminator):
//   config:        32 bytes (Pubkey)
//   minter:        32 bytes (Pubkey)
//   quota:          8 bytes (u64 LE)
//   minted_amount:  8 bytes (u64 LE)
//   enabled:        1 byte  (bool)
//   bump:           1 byte  (u8)

interface ParsedMinterState {
  config: string;
  minter: string;
  quota: string;
  mintedAmount: string;
  enabled: boolean;
  bump: number;
}

function parseMinterState(data: Buffer): ParsedMinterState {
  let offset = 8;

  const configAddr = new PublicKey(data.subarray(offset, offset + 32)).toBase58();
  offset += 32;

  const minter = new PublicKey(data.subarray(offset, offset + 32)).toBase58();
  offset += 32;

  const quota = data.readBigUInt64LE(offset).toString();
  offset += 8;

  const mintedAmount = data.readBigUInt64LE(offset).toString();
  offset += 8;

  const enabled = data[offset] === 1;
  offset += 1;

  const bump = data[offset];

  return { config: configAddr, minter, quota, mintedAmount, enabled, bump };
}

// ── GET /api/config/:mint ───────────────────────────────────────────────────

router.get("/config/:mint", async (req: Request, res: Response) => {
  try {
    const { mint: mintAddress } = req.params;

    if (!isValidPublicKey(mintAddress)) {
      res.status(400).json({ error: "Invalid mint address" });
      return;
    }

    const connection = getConnection();
    const mint = new PublicKey(mintAddress);
    const [configPda] = deriveConfigPda(mint);

    const accountInfo = await connection.getAccountInfo(configPda);

    if (!accountInfo) {
      res.status(404).json({
        error: "Stablecoin config not found",
        configPda: configPda.toBase58(),
      });
      return;
    }

    const parsed = parseStablecoinConfig(accountInfo.data);

    res.json({
      configPda: configPda.toBase58(),
      presetLabel: parsed.preset === 1 ? "SSS-1 (Minimal)" : "SSS-2 (Compliant)",
      ...parsed,
    });
  } catch (err) {
    log.error("Config endpoint error", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    res.status(500).json({ error: message });
  }
});

// ── GET /api/minters/:mint ──────────────────────────────────────────────────

router.get("/minters/:mint", async (req: Request, res: Response) => {
  try {
    const { mint: mintAddress } = req.params;

    if (!isValidPublicKey(mintAddress)) {
      res.status(400).json({ error: "Invalid mint address" });
      return;
    }

    const connection = getConnection();
    const coreProgramId = new PublicKey(config.programs.sssCore);
    const mint = new PublicKey(mintAddress);
    const [configPda] = deriveConfigPda(mint);

    // Fetch all MinterState PDAs for this config by scanning program accounts
    // with the minter discriminator [251, 69, 145, 137, 48, 218, 88, 148]
    const discriminator = Buffer.from([251, 69, 145, 137, 48, 218, 88, 148]);

    const accounts = await connection.getProgramAccounts(coreProgramId, {
      filters: [
        { memcmp: { offset: 0, bytes: discriminator.toString("base64") } },
        { memcmp: { offset: 8, bytes: configPda.toBase58() } },
      ],
    });

    const minters = accounts.map((account) => {
      const parsed = parseMinterState(account.account.data);
      return {
        address: account.pubkey.toBase58(),
        ...parsed,
      };
    });

    res.json({
      mint: mintAddress,
      configPda: configPda.toBase58(),
      count: minters.length,
      minters,
    });
  } catch (err) {
    log.error("Minters endpoint error", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    res.status(500).json({ error: message });
  }
});

// ── GET /api/minter/:mint/:wallet ───────────────────────────────────────────

router.get("/minter/:mint/:wallet", async (req: Request, res: Response) => {
  try {
    const { mint: mintAddress, wallet } = req.params;

    if (!isValidPublicKey(mintAddress)) {
      res.status(400).json({ error: "Invalid mint address" });
      return;
    }
    if (!isValidPublicKey(wallet)) {
      res.status(400).json({ error: "Invalid wallet address" });
      return;
    }

    const connection = getConnection();
    const mint = new PublicKey(mintAddress);
    const walletPk = new PublicKey(wallet);
    const [configPda] = deriveConfigPda(mint);
    const [minterStatePda] = deriveMinterStatePda(configPda, walletPk);

    const accountInfo = await connection.getAccountInfo(minterStatePda);

    if (!accountInfo) {
      res.status(404).json({
        error: "Minter state not found",
        minterStatePda: minterStatePda.toBase58(),
      });
      return;
    }

    const parsed = parseMinterState(accountInfo.data);

    res.json({
      minterStatePda: minterStatePda.toBase58(),
      ...parsed,
      remainingQuota: (BigInt(parsed.quota) - BigInt(parsed.mintedAmount)).toString(),
    });
  } catch (err) {
    log.error("Minter state endpoint error", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    res.status(500).json({ error: message });
  }
});

export default router;
