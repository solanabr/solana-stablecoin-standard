import express, { Request, Response } from "express";
import fs from "fs";
import os from "os";
import path from "path";
import { AnchorProvider, BN, Idl, Program, Wallet } from "@coral-xyz/anchor";
import { PublicKey, Connection, Keypair, SystemProgram } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";

type StablecoinProgram = Program<Idl>;

const app = express();
app.use(express.json());

const PORT = Number(process.env.PORT ?? 3001);
const RPC_URL = process.env.SOLANA_RPC_URL ?? "http://127.0.0.1:8899";
const WALLET_PATH = resolveTilde(process.env.SOLANA_WALLET ?? "~/.config/solana/deployer.json");

const provider = buildProvider(RPC_URL, WALLET_PATH);
const stablecoinProgram = buildStablecoinProgram(provider);

const ROLE_MINTER = 1;

function resolveTilde(input: string): string {
  if (input.startsWith("~/")) {
    return path.join(os.homedir(), input.slice(2));
  }
  return input;
}

function resolveFirstExistingPath(paths: string[]): string {
  const resolved = paths.map((candidate) => path.resolve(candidate));
  const found = resolved.find((candidate) => fs.existsSync(candidate));
  if (!found) {
    throw new Error(`Unable to find IDL file. Tried: ${resolved.join(", ")}`);
  }
  return found;
}

function buildProvider(rpcUrl: string, walletPath: string): AnchorProvider {
  const walletSecret = JSON.parse(fs.readFileSync(walletPath, "utf-8")) as number[];
  const walletKeypair = Keypair.fromSecretKey(Uint8Array.from(walletSecret));
  const wallet = new Wallet(walletKeypair);
  const connection = new Connection(rpcUrl, "confirmed");
  return new AnchorProvider(connection, wallet, { commitment: "confirmed" });
}

function loadSss1Idl(): Idl {
  const configuredPath = process.env.SSS1_IDL_PATH;
  const idlPath = configuredPath
    ? resolveFirstExistingPath([configuredPath])
    : resolveFirstExistingPath([
        "target/idl/sss_1.json",
        "../../target/idl/sss_1.json",
        "../../../target/idl/sss_1.json",
      ]);
  return JSON.parse(fs.readFileSync(idlPath, "utf-8")) as Idl;
}

function buildStablecoinProgram(anchorProvider: AnchorProvider): StablecoinProgram {
  const idl = loadSss1Idl();
  const envProgramId = process.env.SSS1_PROGRAM_ID;
  const programId = envProgramId ? new PublicKey(envProgramId) : new PublicKey((idl as any).address);
  const idlWithAddress = {
    ...idl,
    address: programId.toBase58(),
  } as Idl;
  return new Program(idlWithAddress, anchorProvider) as StablecoinProgram;
}

function parsePublicKey(value: unknown, field: string): PublicKey {
  if (typeof value !== "string") {
    throw new Error(`Invalid ${field}: expected base58 string`);
  }
  return new PublicKey(value);
}

function parseAmount(value: unknown): BN {
  if (typeof value !== "number" && typeof value !== "string") {
    throw new Error("Invalid amount: expected number or string");
  }
  const asString = String(value);
  if (!/^\d+$/.test(asString)) {
    throw new Error("Invalid amount: must be an integer");
  }
  const parsed = new BN(asString, 10);
  if (parsed.lte(new BN(0))) {
    throw new Error("Invalid amount: must be > 0");
  }
  return parsed;
}

function findConfigPda(mint: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("config"), mint.toBuffer()],
    stablecoinProgram.programId
  )[0];
}

function findRolePda(config: PublicKey, authority: PublicKey, roleType: number): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("role"), config.toBuffer(), authority.toBuffer(), Buffer.from([roleType])],
    stablecoinProgram.programId
  )[0];
}

function handleRouteError(res: Response, err: unknown): Response {
  const message = err instanceof Error ? err.message : String(err);
  const isValidationError = message.startsWith("Invalid ") || message.startsWith("Missing ");
  return res.status(isValidationError ? 400 : 500).json({ error: message });
}

app.post("/mint", async (req: Request, res: Response) => {
  try {
    const mint = parsePublicKey(req.body.mint, "mint");
    const destination = parsePublicKey(req.body.destination, "destination");
    const amount = parseAmount(req.body.amount);
    const minter = req.body.minter ? parsePublicKey(req.body.minter, "minter") : provider.wallet.publicKey;

    const config = findConfigPda(mint);
    const role = findRolePda(config, minter, ROLE_MINTER);

    const tx = await stablecoinProgram.methods
      .mintTokens(amount)
      .accounts({
        minter,
        config,
        role,
        mint,
        destination,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();

    return res.json({ status: "ok", action: "mint_tokens", tx });
  } catch (err) {
    return handleRouteError(res, err);
  }
});

app.post("/burn", async (req: Request, res: Response) => {
  try {
    const mint = parsePublicKey(req.body.mint, "mint");
    const source = parsePublicKey(req.body.source, "source");
    const amount = parseAmount(req.body.amount);
    const burner = req.body.burner ? parsePublicKey(req.body.burner, "burner") : provider.wallet.publicKey;

    const config = findConfigPda(mint);
    const role = findRolePda(config, burner, 2);

    const tx = await stablecoinProgram.methods
      .burnTokens(amount)
      .accounts({
        burner,
        config,
        role,
        mint,
        source,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();

    return res.json({ status: "ok", action: "burn_tokens", tx });
  } catch (err) {
    return handleRouteError(res, err);
  }
});

app.post("/pause", async (req: Request, res: Response) => {
  try {
    const mint = parsePublicKey(req.body.mint, "mint");
    const config = findConfigPda(mint);

    const tx = await stablecoinProgram.methods
      .pause()
      .accounts({
        admin: provider.wallet.publicKey,
        config,
      })
      .rpc();

    return res.json({ status: "ok", action: "pause", tx });
  } catch (err) {
    return handleRouteError(res, err);
  }
});

app.post("/unpause", async (req: Request, res: Response) => {
  try {
    const mint = parsePublicKey(req.body.mint, "mint");
    const config = findConfigPda(mint);

    const tx = await stablecoinProgram.methods
      .unpause()
      .accounts({
        admin: provider.wallet.publicKey,
        config,
      })
      .rpc();

    return res.json({ status: "ok", action: "unpause", tx });
  } catch (err) {
    return handleRouteError(res, err);
  }
});

app.post("/seize", async (req: Request, res: Response) => {
  try {
    const mint = parsePublicKey(req.body.mint, "mint");
    const from = parsePublicKey(req.body.from, "from");
    const to = parsePublicKey(req.body.to, "to");
    const amount = parseAmount(req.body.amount);
    const config = findConfigPda(mint);

    const tx = await stablecoinProgram.methods
      .seizeTokens(amount)
      .accounts({
        admin: provider.wallet.publicKey,
        config,
        mint,
        from,
        to,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();

    return res.json({ status: "ok", action: "seize_tokens", tx });
  } catch (err) {
    return handleRouteError(res, err);
  }
});

app.post("/roles/minter/update", async (req: Request, res: Response) => {
  try {
    const mint = parsePublicKey(req.body.mint, "mint");
    const oldMinter = parsePublicKey(req.body.oldMinter, "oldMinter");
    const newMinter = parsePublicKey(req.body.newMinter, "newMinter");
    const config = findConfigPda(mint);
    const oldRole = findRolePda(config, oldMinter, ROLE_MINTER);
    const newRole = findRolePda(config, newMinter, ROLE_MINTER);

    const grantTx = await stablecoinProgram.methods
      .grantRole(ROLE_MINTER)
      .accounts({
        admin: provider.wallet.publicKey,
        config,
        authority: newMinter,
        role: newRole,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const revokeTx = await stablecoinProgram.methods
      .revokeRole()
      .accounts({
        admin: provider.wallet.publicKey,
        config,
        authority: oldMinter,
        role: oldRole,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    return res.json({
      status: "ok",
      action: "minter_rotation",
      grantTx,
      revokeTx,
    });
  } catch (err) {
    return handleRouteError(res, err);
  }
});

app.post("/authorities/admin/transfer", async (req: Request, res: Response) => {
  try {
    const mint = parsePublicKey(req.body.mint, "mint");
    const newAdmin = parsePublicKey(req.body.newAdmin, "newAdmin");
    const config = findConfigPda(mint);

    const tx = await stablecoinProgram.methods
      .transferAdmin()
      .accounts({
        admin: provider.wallet.publicKey,
        config,
        newAdmin,
      })
      .rpc();

    return res.json({ status: "ok", action: "transfer_admin", tx });
  } catch (err) {
    return handleRouteError(res, err);
  }
});

app.get("/health", (_req: Request, res: Response) =>
  res.json({
    status: "ok",
    programId: stablecoinProgram.programId.toBase58(),
    wallet: provider.wallet.publicKey.toBase58(),
    rpcUrl: RPC_URL,
  })
);

app.listen(PORT, () => {
  console.log(`mint-burn service listening on :${PORT} (program ${stablecoinProgram.programId.toBase58()})`);
});
