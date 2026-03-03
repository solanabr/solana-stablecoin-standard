import { Connection, Keypair } from "@solana/web3.js";
import { AnchorProvider, Wallet } from "@coral-xyz/anchor";
import { SolanaStablecoin } from "@sss/sdk";
import fs from "fs";
import path from "path";

let _stablecoin: SolanaStablecoin | null = null;

export function getProvider(): AnchorProvider {
  const rpcUrl = process.env.RPC_URL || "http://localhost:8899";
  const keypairPath =
    process.env.KEYPAIR_PATH ||
    path.join(process.env.HOME!, ".config/solana/id.json");
  const secret = JSON.parse(fs.readFileSync(keypairPath, "utf-8"));
  const keypair = Keypair.fromSecretKey(Uint8Array.from(secret));
  const connection = new Connection(rpcUrl, "confirmed");
  return new AnchorProvider(connection, new Wallet(keypair), {
    commitment: "confirmed",
  });
}

export function getStablecoin(): SolanaStablecoin {
  if (_stablecoin) return _stablecoin;
  const provider = getProvider();
  const idlPath = path.resolve(
    __dirname,
    "../../../target/idl/sss_core.json"
  );
  const idl = JSON.parse(fs.readFileSync(idlPath, "utf-8"));
  _stablecoin = new SolanaStablecoin(provider, idl);
  return _stablecoin;
}
