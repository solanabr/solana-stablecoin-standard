import { Router, Request, Response } from "express";
import { Connection, PublicKey, Keypair } from "@solana/web3.js";
import { AnchorProvider, Program, BN, Wallet } from "@coral-xyz/anchor";
import fs from "fs";
import { config } from "../config";
import { createLogger } from "../logger";
import { insertAuditEntry } from "../services/database";

const log = createLogger("routes:mint");
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

function loadKeypair(): Keypair {
  const raw = fs.readFileSync(config.keypairPath, "utf-8");
  const secret = Uint8Array.from(JSON.parse(raw));
  return Keypair.fromSecretKey(secret);
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

function deriveMintAuthorityPda(mint: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("mint-authority"), mint.toBuffer()],
    new PublicKey(config.programs.sssCore)
  );
}

// ── POST /api/mint ──────────────────────────────────────────────────────────

router.post("/mint", async (req: Request, res: Response) => {
  try {
    const { mintAddress, destination, amount } = req.body;

    if (!mintAddress || !isValidPublicKey(mintAddress)) {
      res.status(400).json({ error: "Invalid or missing mintAddress" });
      return;
    }
    if (!destination || !isValidPublicKey(destination)) {
      res.status(400).json({ error: "Invalid or missing destination" });
      return;
    }
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      res.status(400).json({ error: "Invalid or missing amount (must be > 0)" });
      return;
    }

    const connection = getConnection();
    const keypair = loadKeypair();
    const mint = new PublicKey(mintAddress);
    const [configPda] = deriveConfigPda(mint);
    const [minterStatePda] = deriveMinterStatePda(configPda, keypair.publicKey);
    const [mintAuthorityPda] = deriveMintAuthorityPda(mint);

    log.info(`Mint request: ${amount} tokens to ${destination} (mint: ${mintAddress})`);

    insertAuditEntry("mint_initiated", keypair.publicKey.toBase58(), mintAddress, {
      destination,
      amount: amount.toString(),
    });

    res.json({
      status: "accepted",
      mint: mintAddress,
      destination,
      amount: amount.toString(),
      accounts: {
        config: configPda.toBase58(),
        minterState: minterStatePda.toBase58(),
        mintAuthority: mintAuthorityPda.toBase58(),
        minter: keypair.publicKey.toBase58(),
      },
      message:
        "Mint operation accepted. Use the returned accounts to build and submit the on-chain transaction.",
    });
  } catch (err) {
    log.error("Mint endpoint error", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    res.status(500).json({ error: message });
  }
});

// ── POST /api/burn ──────────────────────────────────────────────────────────

router.post("/burn", async (req: Request, res: Response) => {
  try {
    const { mintAddress, tokenAccount, amount } = req.body;

    if (!mintAddress || !isValidPublicKey(mintAddress)) {
      res.status(400).json({ error: "Invalid or missing mintAddress" });
      return;
    }
    if (!tokenAccount || !isValidPublicKey(tokenAccount)) {
      res.status(400).json({ error: "Invalid or missing tokenAccount" });
      return;
    }
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      res.status(400).json({ error: "Invalid or missing amount (must be > 0)" });
      return;
    }

    const keypair = loadKeypair();
    const mint = new PublicKey(mintAddress);
    const [configPda] = deriveConfigPda(mint);

    log.info(`Burn request: ${amount} tokens from ${tokenAccount} (mint: ${mintAddress})`);

    insertAuditEntry("burn_initiated", keypair.publicKey.toBase58(), mintAddress, {
      tokenAccount,
      amount: amount.toString(),
    });

    res.json({
      status: "accepted",
      mint: mintAddress,
      tokenAccount,
      amount: amount.toString(),
      accounts: {
        config: configPda.toBase58(),
        burner: keypair.publicKey.toBase58(),
      },
      message:
        "Burn operation accepted. Use the returned accounts to build and submit the on-chain transaction.",
    });
  } catch (err) {
    log.error("Burn endpoint error", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    res.status(500).json({ error: message });
  }
});

// ── GET /api/supply ─────────────────────────────────────────────────────────

router.get("/supply", async (req: Request, res: Response) => {
  try {
    const { mint: mintAddress } = req.query;

    if (!mintAddress || typeof mintAddress !== "string" || !isValidPublicKey(mintAddress)) {
      res.status(400).json({ error: "Invalid or missing mint query parameter" });
      return;
    }

    const connection = getConnection();
    const mint = new PublicKey(mintAddress);

    const supplyInfo = await connection.getTokenSupply(mint);
    const [configPda] = deriveConfigPda(mint);

    let configData: Record<string, unknown> | null = null;
    try {
      const accountInfo = await connection.getAccountInfo(configPda);
      if (accountInfo) {
        configData = {
          configAddress: configPda.toBase58(),
          exists: true,
        };
      }
    } catch {
      // Config may not exist
    }

    res.json({
      mint: mintAddress,
      supply: {
        amount: supplyInfo.value.amount,
        decimals: supplyInfo.value.decimals,
        uiAmount: supplyInfo.value.uiAmount,
      },
      config: configData,
    });
  } catch (err) {
    log.error("Supply endpoint error", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    res.status(500).json({ error: message });
  }
});

export default router;
