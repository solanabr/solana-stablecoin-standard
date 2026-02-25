/**
 * SSS Compliance Service — address screening, blacklist queries, and
 * audit trail export for SSS-2 stablecoins.
 *
 * Blacklist state is read live from the Solana chain (BlacklistEntry PDAs).
 * No off-chain database required for read operations.
 *
 * Environment:
 *   SERVICE_PORT         — HTTP port (default 3003)
 *   SOLANA_RPC_URL       — Solana RPC (default http://localhost:8899)
 *   SSS_TOKEN_PROGRAM_ID — main program public key
 *   API_SECRET           — if set, requires Authorization: Bearer <secret>
 */

import express, { Request, Response, NextFunction } from "express";
import { Connection, PublicKey, GetProgramAccountsFilter } from "@solana/web3.js";
import { randomUUID } from "crypto";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const PORT = parseInt(process.env.SERVICE_PORT ?? "3003", 10);
const RPC  = process.env.SOLANA_RPC_URL ?? "http://localhost:8899";
const SSS_PROGRAM = process.env.SSS_TOKEN_PROGRAM_ID ?? "E7iCiXrkudyt5j1nVHHmbuqCEyLP2hD4VGNJyuPAdWwP";
const API_SECRET  = process.env.API_SECRET ?? "";
const START_TIME  = Date.now();

const connection = new Connection(RPC, "confirmed");

// Anchor account discriminator for BlacklistEntry (first 8 bytes of sha256("account:BlacklistEntry"))
// Precomputed: sha256("account:BlacklistEntry")[0..8]
const BLACKLIST_DISCRIMINATOR = Buffer.from([0xba, 0x0a, 0x51, 0xc5, 0x19, 0x40, 0x7f, 0xc0]);

// ---------------------------------------------------------------------------
// In-memory monitor store
// ---------------------------------------------------------------------------

interface Monitor {
  id: string;
  address: string;
  mint: string;
  webhookUrl: string;
  createdAt: string;
}

const monitors = new Map<string, Monitor>();

// ---------------------------------------------------------------------------
// PDA helpers
// ---------------------------------------------------------------------------

function deriveBlacklistEntry(mint: PublicKey, address: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("blacklist"), mint.toBuffer(), address.toBuffer()],
    new PublicKey(SSS_PROGRAM)
  );
  return pda;
}

// ---------------------------------------------------------------------------
// Auth middleware
// ---------------------------------------------------------------------------

function auth(req: Request, res: Response, next: NextFunction): void {
  if (!API_SECRET) { next(); return; }
  if (req.headers.authorization === `Bearer ${API_SECRET}`) { next(); return; }
  res.status(401).json({ error: "Unauthorized", code: "UNAUTHORIZED", statusCode: 401 });
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

const app = express();
app.use(express.json());

// GET /health
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "compliance",
    rpc: RPC,
    monitorCount: monitors.size,
    uptime: Math.floor((Date.now() - START_TIME) / 1000),
  });
});

// POST /api/v1/screen — check whether an address is blacklisted for a given mint
app.post("/api/v1/screen", auth, async (req: Request, res: Response) => {
  const { address, mint } = req.body as { address?: string; mint?: string };
  if (!address || !mint) {
    res.status(400).json({ error: "address and mint are required", code: "MISSING_FIELDS", statusCode: 400 });
    return;
  }

  try {
    const mintPk    = new PublicKey(mint);
    const addressPk = new PublicKey(address);
    const entryPda  = deriveBlacklistEntry(mintPk, addressPk);
    const info      = await connection.getAccountInfo(entryPda);

    if (!info || info.data.length === 0) {
      res.json({ address, mint, blacklisted: false });
      return;
    }

    // Parse reason string from account data (offset 8 discriminator + 32 address + 32 stablecoin + 4 len)
    let reason: string | undefined;
    try {
      const data = info.data;
      const reasonLenOffset = 8 + 32 + 32;
      const reasonLen = data.readUInt32LE(reasonLenOffset);
      reason = data.slice(reasonLenOffset + 4, reasonLenOffset + 4 + reasonLen).toString("utf8");
    } catch {
      reason = undefined;
    }

    res.json({ address, mint, blacklisted: true, entryPda: entryPda.toBase58(), reason });
  } catch (err: unknown) {
    res.status(500).json({ error: String(err), code: "RPC_ERROR", statusCode: 500 });
  }
});

// GET /api/v1/blacklist — list all blacklist entries for a mint
app.get("/api/v1/blacklist", auth, async (req: Request, res: Response) => {
  const { mint } = req.query as { mint?: string };
  if (!mint) {
    res.status(400).json({ error: "mint query param required", code: "MISSING_FIELDS", statusCode: 400 });
    return;
  }

  try {
    const mintPk  = new PublicKey(mint);
    const filters: GetProgramAccountsFilter[] = [
      { memcmp: { offset: 0, bytes: BLACKLIST_DISCRIMINATOR.toString("base64") } },
      // mint is stored at offset 40 (8 discriminator + 32 address)
      { memcmp: { offset: 40, bytes: mintPk.toBase58() } },
    ];

    const accounts = await connection.getProgramAccounts(
      new PublicKey(SSS_PROGRAM),
      { filters }
    );

    const entries = accounts.map(({ pubkey, account }) => {
      const data = account.data;
      const address = new PublicKey(data.slice(8, 40)).toBase58();
      const reasonLenOffset = 8 + 32 + 32;
      let reason = "";
      try {
        const len = data.readUInt32LE(reasonLenOffset);
        reason = data.slice(reasonLenOffset + 4, reasonLenOffset + 4 + len).toString("utf8");
      } catch { /* ignore */ }
      return { pda: pubkey.toBase58(), address, reason };
    });

    res.json({ mint, entries });
  } catch (err: unknown) {
    res.status(500).json({ error: String(err), code: "RPC_ERROR", statusCode: 500 });
  }
});

// POST /api/v1/monitor/start — register an address for ongoing screening
app.post("/api/v1/monitor/start", auth, (req: Request, res: Response) => {
  const { address, mint, webhookUrl } = req.body as {
    address?: string; mint?: string; webhookUrl?: string;
  };
  if (!address || !mint || !webhookUrl) {
    res.status(400).json({
      error: "address, mint, and webhookUrl are required",
      code: "MISSING_FIELDS",
      statusCode: 400,
    });
    return;
  }

  const monitor: Monitor = {
    id: randomUUID(),
    address,
    mint,
    webhookUrl,
    createdAt: new Date().toISOString(),
  };
  monitors.set(monitor.id, monitor);
  res.status(201).json({ monitorId: monitor.id, address, mint, createdAt: monitor.createdAt });
});

// GET /api/v1/audit/export — export compliance events
// In production this queries the indexer service or Postgres.
// Here we pull live blacklist entries from the chain as the audit source.
app.get("/api/v1/audit/export", auth, async (req: Request, res: Response) => {
  const { mint, format = "json" } = req.query as { mint?: string; format?: string };
  if (!mint) {
    res.status(400).json({ error: "mint query param required", code: "MISSING_FIELDS", statusCode: 400 });
    return;
  }

  try {
    const mintPk  = new PublicKey(mint);
    const filters: GetProgramAccountsFilter[] = [
      { memcmp: { offset: 0, bytes: BLACKLIST_DISCRIMINATOR.toString("base64") } },
      { memcmp: { offset: 40, bytes: mintPk.toBase58() } },
    ];
    const accounts = await connection.getProgramAccounts(new PublicKey(SSS_PROGRAM), { filters });

    const rows = accounts.map(({ account }) => {
      const data = account.data;
      const address = new PublicKey(data.slice(8, 40)).toBase58();
      const reasonLenOffset = 8 + 32 + 32;
      let reason = "";
      try {
        const len = data.readUInt32LE(reasonLenOffset);
        reason = data.slice(reasonLenOffset + 4, reasonLenOffset + 4 + len).toString("utf8");
      } catch { /* ignore */ }
      return { mint, address, reason, action: "blacklist_add", exportedAt: new Date().toISOString() };
    });

    if (format === "csv") {
      const header = "mint,address,reason,action,exportedAt\n";
      const body   = rows.map((r) =>
        `${r.mint},${r.address},"${r.reason.replace(/"/g, '""')}",${r.action},${r.exportedAt}`
      ).join("\n");
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="audit-${mint.slice(0, 8)}.csv"`);
      res.send(header + body);
      return;
    }

    res.json({ mint, exportedAt: new Date().toISOString(), count: rows.length, entries: rows });
  } catch (err: unknown) {
    res.status(500).json({ error: String(err), code: "RPC_ERROR", statusCode: 500 });
  }
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

app.listen(PORT, () => {
  console.log(`[compliance] listening on port ${PORT}  rpc=${RPC}`);
});

export default app;
