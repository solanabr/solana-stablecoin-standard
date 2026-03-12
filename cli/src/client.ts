import * as fs from "fs";
import { Connection, Keypair } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import type { Program, AnchorProvider } from "@coral-xyz/anchor";

import type { CliConfig } from "./config";

export function buildProvider(cfg: CliConfig): AnchorProvider {
  const connection = new Connection(cfg.rpcUrl, "confirmed");
  const rawKey = JSON.parse(fs.readFileSync(cfg.keypairPath, "utf8"));
  const keypair = Keypair.fromSecretKey(Uint8Array.from(rawKey));
  const wallet = new anchor.Wallet(keypair);
  return new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
}

export function buildProgram(provider: AnchorProvider, idl: any): Program<any> {
  return new anchor.Program(idl, provider);
}
