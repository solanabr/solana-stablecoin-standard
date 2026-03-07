import express from "express";
import { PublicKey, Keypair, Connection } from "@solana/web3.js";
import * as fs from "fs";
import BN from "bn.js";
import { v4 as uuidv4 } from "uuid";
import { SolanaStablecoin } from "@stbr/sss-token";

const app = express();
const PORT = parseInt(process.env.PORT ?? "3001", 10);
const RPC_URL = process.env.RPC_URL ?? "http://localhost:8899";
const MINT_PUBKEY = process.env.MINT ?? "";
const AUTHORITY_KEYPAIR_PATH =
  process.env.AUTHORITY_KEYPAIR_PATH ?? "/secrets/authority.json";

app.use(express.json());

function loadKeypair(): Keypair {
  const secret = JSON.parse(
    fs.readFileSync(AUTHORITY_KEYPAIR_PATH, "utf8")
  ) as number[];
  return Keypair.fromSecretKey(Uint8Array.from(secret));
}

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "sss-mint-burn" });
});

/**
 * POST /mint
 * Body: { recipient: string, amount: string, requestId?: string }
 */
app.post("/mint", async (req, res) => {
  const { recipient, amount, requestId } = req.body as {
    recipient: string;
    amount: string;
    requestId?: string;
  };

  if (!recipient || !amount) {
    return res.status(400).json({ error: "recipient and amount required" });
  }

  const id = requestId ?? uuidv4();

  try {
    const connection = new Connection(RPC_URL, "confirmed");
    const authority = loadKeypair();
    const mint = new PublicKey(MINT_PUBKEY);

    const stable = await SolanaStablecoin.load(connection, mint, authority);
    const config = await stable.getConfig();
    const amountBN = new BN(amount).mul(new BN(10).pow(new BN(config.decimals)));

    const sig = await stable.mintTokens(
      { recipient: new PublicKey(recipient), amount: amountBN },
      authority
    );

    return res.json({ requestId: id, signature: sig, status: "executed" });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ requestId: id, error: message });
  }
});

/**
 * POST /burn
 * Body: { tokenAccount: string, amount: string }
 */
app.post("/burn", async (req, res) => {
  const { tokenAccount, amount, requestId } = req.body as {
    tokenAccount: string;
    amount: string;
    requestId?: string;
  };

  if (!tokenAccount || !amount) {
    return res.status(400).json({ error: "tokenAccount and amount required" });
  }

  const id = requestId ?? uuidv4();

  try {
    const connection = new Connection(RPC_URL, "confirmed");
    const authority = loadKeypair();
    const mint = new PublicKey(MINT_PUBKEY);

    const stable = await SolanaStablecoin.load(connection, mint, authority);
    const config = await stable.getConfig();
    const amountBN = new BN(amount).mul(new BN(10).pow(new BN(config.decimals)));

    const sig = await stable.burn(
      {
        tokenAccount: new PublicKey(tokenAccount),
        tokenAccountOwner: authority.publicKey,
        amount: amountBN,
      },
      authority
    );

    return res.json({ requestId: id, signature: sig, status: "executed" });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ requestId: id, error: message });
  }
});

app.listen(PORT, () => {
  console.log(`SSS Mint/Burn service listening on port ${PORT}`);
});
