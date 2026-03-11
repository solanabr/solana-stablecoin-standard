import * as anchor from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey, clusterApiUrl } from "@solana/web3.js";
import chalk from "chalk";
import * as fs from "fs";
import * as path from "path";

const STABLECOIN_PROGRAM_ID = new PublicKey("SSSW3EixhrbB6yYpTdKmH2nCReqsA1VJqJkhwvcdzLA");
const TRANSFER_HOOK_PROGRAM_ID = new PublicKey("Fi6N4Z2Xm47dRmLoDRcVAvoiQ1UnT2WcuzvwjXvcB8mu");

export function resolveUrl(url: string): string {
  switch (url) {
    case "mainnet":
      return clusterApiUrl("mainnet-beta");
    case "devnet":
      return clusterApiUrl("devnet");
    case "localnet":
      return "http://127.0.0.1:8899";
    default:
      return url;
  }
}

export function loadKeypair(keypairPath?: string): Keypair {
  const resolvedPath =
    keypairPath ??
    path.join(
      process.env.HOME || "~",
      ".config",
      "solana",
      "id.json"
    );

  const secretKey = JSON.parse(fs.readFileSync(resolvedPath, "utf-8"));
  return Keypair.fromSecretKey(Uint8Array.from(secretKey));
}

export function getProgram(
  connection: Connection,
  wallet: Keypair
): anchor.Program {
  const provider = new anchor.AnchorProvider(
    connection,
    new anchor.Wallet(wallet),
    { commitment: "confirmed" }
  );

  // Load IDL from well-known path or embed
  const idlPath = path.resolve(
    __dirname,
    "..",
    "..",
    "..",
    "target",
    "idl",
    "stablecoin.json"
  );

  let idl: any;
  if (fs.existsSync(idlPath)) {
    idl = JSON.parse(fs.readFileSync(idlPath, "utf-8"));
  } else {
    throw new Error(
      `IDL not found at ${idlPath}. Run 'anchor build' first.`
    );
  }

  return new anchor.Program(idl, provider);
}

export function success(msg: string): void {
  console.log(chalk.green("✓"), msg);
}

export function error(msg: string): void {
  console.error(chalk.red("✗"), msg);
}

export function warn(msg: string): void {
  console.log(chalk.yellow("⚠"), msg);
}

export function explorerLink(
  signature: string,
  cluster: string = "devnet"
): string {
  const clusterParam =
    cluster === "mainnet" ? "" : `?cluster=${cluster}`;
  return `https://explorer.solana.com/tx/${signature}${clusterParam}`;
}

export function printTx(signature: string, cluster: string): void {
  success(`Transaction: ${signature}`);
  console.log(`  Explorer: ${explorerLink(signature, cluster)}`);
}

export { STABLECOIN_PROGRAM_ID, TRANSFER_HOOK_PROGRAM_ID };
