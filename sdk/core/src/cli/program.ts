import * as fs from "node:fs";
import * as path from "node:path";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { AnchorProvider, Program, Wallet } from "@coral-xyz/anchor";

import type { LoadedCliConfig } from "./config";

const DEFAULT_PROGRAM_ID = "G3jadBDzaF2HbTY2at5auYYQQ94zhhWaocMuWDgUy2vL";

/**
 * Standard IDL search paths (relative to project root or absolute).
 * `anchor build` outputs to `target/idl/`.
 */
const IDL_SEARCH_PATHS = [
  "target/idl/sss_core.json",
  "../target/idl/sss_core.json",
  "../../target/idl/sss_core.json",
];

function loadKeypair(keypairPath: string): Keypair {
  const resolved = keypairPath.replace("~", process.env.HOME ?? "");
  const secret = JSON.parse(fs.readFileSync(resolved, "utf8"));
  return Keypair.fromSecretKey(new Uint8Array(secret));
}

function findIdl(): object | null {
  for (const rel of IDL_SEARCH_PATHS) {
    const abs = path.resolve(rel);
    if (fs.existsSync(abs)) {
      return JSON.parse(fs.readFileSync(abs, "utf8"));
    }
  }

  // Also check SSS_IDL_PATH env var
  const envPath = process.env.SSS_IDL_PATH;
  if (envPath && fs.existsSync(envPath)) {
    return JSON.parse(fs.readFileSync(envPath, "utf8"));
  }

  return null;
}

export function createProvider(config: LoadedCliConfig): AnchorProvider {
  const connection = new Connection(config.rpcUrl, "confirmed");
  const wallet = new Wallet(loadKeypair(config.keypairPath));
  return new AnchorProvider(connection, wallet, { commitment: "confirmed" });
}

export function getProgramId(config: LoadedCliConfig): PublicKey {
  return new PublicKey(config.programId ?? DEFAULT_PROGRAM_ID);
}

/**
 * Load the Anchor Program for sss-core.
 *
 * Attempts to load the IDL from standard paths. If the IDL is not found
 * (e.g., `anchor build` has not been run), returns null with a helpful message.
 */
export function loadProgram(config: LoadedCliConfig): {
  program: Program;
  provider: AnchorProvider;
} | null {
  const idl = findIdl();
  if (!idl) {
    return null;
  }

  const provider = createProvider(config);
  const programId = getProgramId(config);
  const program = new Program(idl as any, provider);
  return { program, provider };
}

/**
 * Error message when IDL is not found.
 */
export const IDL_NOT_FOUND_MSG =
  "IDL not found. Run `anchor build` first, or set SSS_IDL_PATH env var.";
