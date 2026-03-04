import { Connection, Keypair, clusterApiUrl } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

export interface CliConfig {
  rpcUrl: string;
  keypairPath: string;
  commitment: "confirmed" | "finalized";
}

const DEFAULT_KEYPAIR_PATH = path.join(
  os.homedir(),
  ".config",
  "solana",
  "id.json"
);

export function loadKeypair(keypairPath?: string): Keypair {
  const resolved = keypairPath ?? DEFAULT_KEYPAIR_PATH;
  if (!fs.existsSync(resolved)) {
    throw new Error(
      `Keypair not found at ${resolved}. Run 'solana-keygen new' or pass --keypair`
    );
  }
  const raw = JSON.parse(fs.readFileSync(resolved, "utf-8"));
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

export function getConnection(rpcUrl?: string): Connection {
  const url = rpcUrl ?? clusterApiUrl("devnet");
  return new Connection(url, "confirmed");
}

export function getProvider(
  connection: Connection,
  keypair: Keypair
): anchor.AnchorProvider {
  const wallet = new anchor.Wallet(keypair);
  return new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
}

export function loadIdl(idlPath?: string): anchor.Idl {
  const resolved =
    idlPath ??
    path.join(
      process.cwd(),
      "target",
      "idl",
      "sss_token.json"
    );
  if (!fs.existsSync(resolved)) {
    throw new Error(
      `IDL not found at ${resolved}. Build the program first with 'anchor build'`
    );
  }
  return JSON.parse(fs.readFileSync(resolved, "utf-8"));
}
