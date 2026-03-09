import * as fs from "fs";
import * as path from "path";
import { Connection, Keypair } from "@solana/web3.js";
import { AnchorProvider, Wallet } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { SolanaStablecoin, Role } from "@sss/sdk";
import chalk from "chalk";

export function loadKeypair(keypairPath?: string): Keypair {
  const p = keypairPath ?? "~/.config/solana/id.json";
  const resolved = p.startsWith("~")
    ? path.join(process.env.HOME!, p.slice(1))
    : p;
  const secret = JSON.parse(fs.readFileSync(resolved, "utf-8"));
  return Keypair.fromSecretKey(Uint8Array.from(secret));
}

function loadIdl(): unknown {
  const idlPath = path.resolve(__dirname, "../../target/idl/sss_core.json");
  if (!fs.existsSync(idlPath)) {
    console.error(chalk.red("IDL not found. Run 'anchor build' first."));
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(idlPath, "utf-8"));
}

export function createSdk(rpcUrl: string, keypairPath?: string): SolanaStablecoin {
  const connection = new Connection(rpcUrl, "confirmed");
  const wallet = new Wallet(loadKeypair(keypairPath));
  const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new SolanaStablecoin(provider, loadIdl() as any);
}

export function formatPubkey(pk: PublicKey): string {
  const s = pk.toBase58();
  return s.slice(0, 4) + ".." + s.slice(-4);
}

export function logSuccess(msg: string): void {
  console.log(chalk.green(msg));
}

export function logError(msg: string): void {
  console.error(chalk.red(msg));
}

export function parseRole(roleStr: string): Role {
  switch (roleStr.toLowerCase()) {
    case "minter":
      return Role.Minter;
    case "burner":
      return Role.Burner;
    case "seizer":
      return Role.Seizer;
    case "pauser":
      return Role.Pauser;
    case "compliance":
    case "complianceofficer":
      return Role.ComplianceOfficer;
    default:
      throw new Error(
        `Unknown role: ${roleStr}. Use: minter, burner, seizer, pauser, compliance`
      );
  }
}

export function getConnection(rpcUrl: string): Connection {
  return new Connection(rpcUrl, "confirmed");
}

export function getConnectionAndKeypair(
  rpcUrl?: string,
  keypairPath?: string
): { connection: Connection; keypair: Keypair } {
  const resolvedRpc = rpcUrl ?? "https://api.devnet.solana.com";
  const connection = new Connection(resolvedRpc, "confirmed");
  const keypair = loadKeypair(keypairPath);
  return { connection, keypair };
}

export function formatAmount(raw: { toString(): string }, decimals = 6): string {
  const n = BigInt(raw.toString());
  const divisor = BigInt(10 ** decimals);
  const whole = n / divisor;
  const frac = n % divisor;
  const fracStr = frac.toString().padStart(decimals, "0").replace(/0+$/, "") || "0";
  return `${whole}.${fracStr}`;
}
