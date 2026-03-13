import { AnchorProvider, BN, Idl, Program, Wallet } from "@coral-xyz/anchor";
import { TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import { Connection, Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import express, { Request, Response } from "express";
import fs from "fs";
import os from "os";
import path from "path";

const app = express();
app.use(express.json());
const PORT = Number(process.env.PORT || 3003);
const RPC_URL = process.env.SOLANA_RPC_URL || process.env.RPC_URL || "http://127.0.0.1:8899";
const WALLET_PATH = resolveTilde(process.env.SOLANA_WALLET || "~/.config/solana/deployer.json");
const ROLE_MINTER = 1;

const provider = buildProvider(RPC_URL, WALLET_PATH);
const connection = provider.connection;
const stablecoinProgram = buildStablecoinProgram(provider);

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
  const rpcConnection = new Connection(rpcUrl, "confirmed");
  return new AnchorProvider(rpcConnection, wallet, { commitment: "confirmed" });
}

function loadIdl(defaultFilename: string, envPath?: string): Idl {
  const idlPath = envPath
    ? resolveFirstExistingPath([envPath])
    : resolveFirstExistingPath([
        `target/idl/${defaultFilename}`,
        `../../target/idl/${defaultFilename}`,
        `../../../target/idl/${defaultFilename}`,
      ]);
  return JSON.parse(fs.readFileSync(idlPath, "utf-8")) as Idl;
}

function buildStablecoinProgram(anchorProvider: AnchorProvider): Program<Idl> {
  const idl = loadIdl("sss_1.json", process.env.SSS1_IDL_PATH ?? process.env.SSS_IDL_PATH);
  const configuredProgramId = process.env.SSS1_PROGRAM_ID ?? process.env.SSS_PROGRAM_ID;
  const programId = configuredProgramId ? new PublicKey(configuredProgramId) : new PublicKey((idl as any).address);
  return new Program({ ...idl, address: programId.toBase58() }, anchorProvider) as Program<Idl>;
}

function parsePublicKey(value: unknown, field: string): PublicKey {
  if (typeof value !== "string") {
    throw new Error(`Invalid ${field}: expected base58 string`);
  }
  return new PublicKey(value);
}

function parseBoolean(value: unknown, field: string): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    const normalized = value.toLowerCase();
    if (normalized === "true") {
      return true;
    }
    if (normalized === "false") {
      return false;
    }
  }
  throw new Error(`Invalid ${field}: expected boolean`);
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
  return PublicKey.findProgramAddressSync([Buffer.from("config"), mint.toBuffer()], stablecoinProgram.programId)[0];
}

function findBlacklistPda(hookConfig: PublicKey, address: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("blacklist"), hookConfig.toBuffer(), address.toBuffer()],
    stablecoinProgram.programId
  )[0];
}

function findHookConfigPda(mint: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from("hook_config"), mint.toBuffer()], stablecoinProgram.programId)[0];
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

app.get("/compliance/:mint/:address", async (req: Request, res: Response) => {
  try {
    const mint = new PublicKey(req.params.mint);
    const address = new PublicKey(req.params.address);
    const hookConfig = findHookConfigPda(mint);
    const blacklistPda = findBlacklistPda(hookConfig, address);

    const account = await connection.getAccountInfo(blacklistPda);
    const isBlacklisted = account !== null;

    res.json({
      address: req.params.address,
      mint: req.params.mint,
      blacklisted: isBlacklisted,
      compliant: !isBlacklisted,
      checkedAt: new Date().toISOString(),
    });
  } catch (err) {
    return handleRouteError(res, err);
  }
});

app.post("/blacklist/add", async (req: Request, res: Response) => {
  try {
    const mint = parsePublicKey(req.body.mint, "mint");
    const address = parsePublicKey(req.body.address, "address");
    const hookConfig = findHookConfigPda(mint);
    const blacklist = findBlacklistPda(hookConfig, address);

    const tx = await stablecoinProgram.methods
      .addToBlacklist()
      .accounts({
        authority: provider.wallet.publicKey,
        hookConfig,
        blacklist,
        address,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    return res.json({ status: "ok", action: "add_to_blacklist", tx });
  } catch (err) {
    return handleRouteError(res, err);
  }
});

app.post("/blacklist/remove", async (req: Request, res: Response) => {
  try {
    const mint = parsePublicKey(req.body.mint, "mint");
    const address = parsePublicKey(req.body.address, "address");
    const hookConfig = findHookConfigPda(mint);
    const blacklist = findBlacklistPda(hookConfig, address);

    const tx = await stablecoinProgram.methods
      .removeFromBlacklist()
      .accounts({
        authority: provider.wallet.publicKey,
        hookConfig,
        address,
        blacklist,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    return res.json({ status: "ok", action: "remove_from_blacklist", tx });
  } catch (err) {
    return handleRouteError(res, err);
  }
});

app.post("/compliance/mode", async (req: Request, res: Response) => {
  try {
    const mint = parsePublicKey(req.body.mint, "mint");
    const enabled = parseBoolean(req.body.enabled, "enabled");
    const hookConfig = findHookConfigPda(mint);

    const tx = await stablecoinProgram.methods
      .setComplianceMode(enabled)
      .accounts({
        authority: provider.wallet.publicKey,
        hookConfig,
      })
      .rpc();

    return res.json({ status: "ok", action: "set_compliance_mode", enabled, tx });
  } catch (err) {
    return handleRouteError(res, err);
  }
});

app.post("/authorities/hook/transfer", async (req: Request, res: Response) => {
  try {
    const mint = parsePublicKey(req.body.mint, "mint");
    const newAuthority = parsePublicKey(req.body.newAuthority, "newAuthority");
    const hookConfig = findHookConfigPda(mint);

    const tx = await stablecoinProgram.methods
      .transferHookAuthority()
      .accounts({
        authority: provider.wallet.publicKey,
        hookConfig,
        newAuthority,
      })
      .rpc();

    return res.json({ status: "ok", action: "transfer_hook_authority", tx });
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

    return res.json({ status: "ok", action: "minter_rotation", grantTx, revokeTx });
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

app.get("/health", (_req: Request, res: Response) =>
  res.json({
    status: "ok",
    programId: stablecoinProgram.programId.toBase58(),
    wallet: provider.wallet.publicKey.toBase58(),
    rpcUrl: RPC_URL,
  })
);

app.listen(PORT, () => {
  console.log(`compliance service listening on :${PORT} (program ${stablecoinProgram.programId.toBase58()})`);
});
