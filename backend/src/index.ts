/**
 * SSS Backend Service
 *
 * Provides REST API for coordinating fiat lifecycle operations:
 * - POST /mint — Coordinate fiat deposit → on-chain mint
 * - POST /burn — Coordinate on-chain burn → fiat redemption
 * - GET  /supply — Total supply with metadata
 * - POST /compliance/blacklist — Add to blacklist (SSS-2)
 * - DELETE /compliance/blacklist/:address — Remove from blacklist (SSS-2)
 * - GET  /compliance/blacklist/:address — Check blacklist status
 * - GET  /audit — Recent audit log entries
 * - POST /webhook — Register webhook for on-chain events
 *
 * Requires env vars:
 *   ANCHOR_WALLET — path to keypair JSON
 *   ANCHOR_PROVIDER_URL — Solana RPC URL
 *   PORT — HTTP port (default: 3000)
 *   SSS_MINT — mint address to manage
 */

import * as anchor from '@coral-xyz/anchor';
import { Keypair, PublicKey, Connection } from '@solana/web3.js';
import * as fs from 'fs';
import * as http from 'http';
import * as url from 'url';
import * as path from 'path';
import * as os from 'os';

// ─── Setup ──────────────────────────────────────────────────────────────────

function loadProvider(): anchor.AnchorProvider {
  const rpc = process.env.ANCHOR_PROVIDER_URL ?? 'https://api.devnet.solana.com';
  const keypairPath = process.env.ANCHOR_WALLET ??
    path.join(os.homedir(), '.config', 'solana', 'id.json');

  const secret = JSON.parse(fs.readFileSync(keypairPath, 'utf-8')) as number[];
  const keypair = Keypair.fromSecretKey(Uint8Array.from(secret));
  const connection = new Connection(rpc, 'confirmed');
  return new anchor.AnchorProvider(connection, new anchor.Wallet(keypair), { commitment: 'confirmed' });
}

// ─── HTTP Server ─────────────────────────────────────────────────────────────

interface RouteHandler {
  (req: http.IncomingMessage, res: http.ServerResponse, body: string): Promise<void>;
}

async function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => (data += chunk));
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function json(res: http.ServerResponse, status: number, data: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function parseJson(body: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

// ─── Routes ──────────────────────────────────────────────────────────────────

const routes: Record<string, RouteHandler> = {
  'GET /health': async (req, res) => {
    json(res, 200, {
      status: 'ok',
      timestamp: new Date().toISOString(),
      mint: process.env.SSS_MINT ?? 'not configured',
    });
  },

  'GET /supply': async (req, res) => {
    const provider = loadProvider();
    const mintAddr = process.env.SSS_MINT;
    if (!mintAddr) return json(res, 400, { error: 'SSS_MINT not configured' });

    try {
      const mint = new PublicKey(mintAddr);
      const info = await provider.connection.getTokenSupply(mint);
      json(res, 200, {
        mint: mintAddr,
        supply: info.value.amount,
        decimals: info.value.decimals,
        uiAmount: info.value.uiAmountString,
      });
    } catch (err) {
      json(res, 500, { error: String(err) });
    }
  },

  'POST /mint': async (req, res, body) => {
    const data = parseJson(body) as { destination?: string; amount?: string } | null;
    if (!data?.destination || !data?.amount) {
      return json(res, 400, { error: 'Required: destination, amount' });
    }

    const mintAddr = process.env.SSS_MINT;
    if (!mintAddr) return json(res, 400, { error: 'SSS_MINT not configured' });

    try {
      const provider = loadProvider();
      const { BN } = anchor;
      const { SolanaStablecoin } = await import('@stbr/sss-sdk');

      const token = SolanaStablecoin.load(provider, new PublicKey(mintAddr));
      const sig = await token.mint(new PublicKey(data.destination), new BN(data.amount));

      json(res, 200, { success: true, signature: sig, amount: data.amount });
    } catch (err) {
      json(res, 500, { error: String(err) });
    }
  },

  'POST /burn': async (req, res, body) => {
    const data = parseJson(body) as { source?: string; amount?: string } | null;
    if (!data?.source || !data?.amount) {
      return json(res, 400, { error: 'Required: source, amount' });
    }

    const mintAddr = process.env.SSS_MINT;
    if (!mintAddr) return json(res, 400, { error: 'SSS_MINT not configured' });

    try {
      const provider = loadProvider();
      const { BN } = anchor;
      const { SolanaStablecoin } = await import('@stbr/sss-sdk');

      const token = SolanaStablecoin.load(provider, new PublicKey(mintAddr));
      const sig = await token.burn(new PublicKey(data.source), new BN(data.amount));

      json(res, 200, { success: true, signature: sig, amount: data.amount });
    } catch (err) {
      json(res, 500, { error: String(err) });
    }
  },

  'POST /compliance/blacklist': async (req, res, body) => {
    const data = parseJson(body) as { address?: string; reason?: number } | null;
    if (!data?.address) return json(res, 400, { error: 'Required: address' });

    const mintAddr = process.env.SSS_MINT;
    if (!mintAddr) return json(res, 400, { error: 'SSS_MINT not configured' });

    try {
      const provider = loadProvider();
      const { SolanaStablecoin } = await import('@stbr/sss-sdk');

      const token = SolanaStablecoin.load(provider, new PublicKey(mintAddr));
      const sig = await token.compliance.blacklistAdd(new PublicKey(data.address), data.reason ?? 0);

      json(res, 200, { success: true, signature: sig, address: data.address });
    } catch (err) {
      json(res, 500, { error: String(err) });
    }
  },

  'GET /compliance/check': async (req, res) => {
    const parsedUrl = url.parse(req.url ?? '', true);
    const address = parsedUrl.query['address'] as string;
    if (!address) return json(res, 400, { error: 'Required: address query param' });

    const mintAddr = process.env.SSS_MINT;
    if (!mintAddr) return json(res, 400, { error: 'SSS_MINT not configured' });

    try {
      const provider = loadProvider();
      const { SolanaStablecoin } = await import('@stbr/sss-sdk');

      const token = SolanaStablecoin.load(provider, new PublicKey(mintAddr));
      const isBlacklisted = await token.compliance.isBlacklisted(new PublicKey(address));

      json(res, 200, { address, blacklisted: isBlacklisted });
    } catch (err) {
      json(res, 500, { error: String(err) });
    }
  },
};

// ─── Server Bootstrap ─────────────────────────────────────────────────────────

const PORT = parseInt(process.env.PORT ?? '3000', 10);

const server = http.createServer(async (req, res) => {
  const method = req.method ?? 'GET';
  const parsedUrl = url.parse(req.url ?? '/');
  const pathname = parsedUrl.pathname ?? '/';
  const key = `${method} ${pathname}`;

  // Structured request logging
  const start = Date.now();
  console.log(JSON.stringify({ level: 'info', method, path: pathname, ts: new Date().toISOString() }));

  const handler = routes[key];
  if (!handler) {
    json(res, 404, { error: 'Not found', path: pathname });
    return;
  }

  try {
    const body = await readBody(req);
    await handler(req, res, body);
  } catch (err) {
    console.error(JSON.stringify({ level: 'error', error: String(err) }));
    if (!res.headersSent) {
      json(res, 500, { error: 'Internal server error' });
    }
  } finally {
    console.log(JSON.stringify({ level: 'info', method, path: pathname, ms: Date.now() - start }));
  }
});

server.listen(PORT, () => {
  console.log(JSON.stringify({ level: 'info', message: `SSS backend running on port ${PORT}` }));
});

process.on('SIGTERM', () => {
  server.close(() => process.exit(0));
});
