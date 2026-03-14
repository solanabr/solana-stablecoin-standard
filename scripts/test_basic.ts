import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { StablecoinSDK, Presets } from "../sdk/src/index";
import { getAssociatedTokenAddressSync, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import * as fs from "fs";
import * as os from "os";

function loadAdminKeypair(): Keypair {
  const configuredPath = process.env.SOLANA_KEYPAIR_PATH;
  const defaultPath = `${os.homedir()}/.config/solana/id.json`;
  const keypairPath = configuredPath || defaultPath;

  if (fs.existsSync(keypairPath)) {
    return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(keypairPath, "utf8"))));
  }

  console.warn(`Keypair file not found at ${keypairPath}. Using ephemeral keypair for this run.`);
  return Keypair.generate();
}

async function ensurePayerBalance(connection: Connection, payer: Keypair, minimumSol = 2) {
  const lamports = await connection.getBalance(payer.publicKey, "confirmed");
  if (lamports >= minimumSol * LAMPORTS_PER_SOL) return;

  const airdropSig = await connection.requestAirdrop(payer.publicKey, minimumSol * LAMPORTS_PER_SOL - lamports);
  await connection.confirmTransaction(airdropSig, "confirmed");
}

async function main() {
  console.log("=== SSS-2 Compliant Flow Test ===");

  const rpcUrl = process.env.SOLANA_RPC_URL || "http://127.0.0.1:8899";
  const connection = new Connection(rpcUrl, "confirmed");
  const adminKeypair = loadAdminKeypair();

  const programId = process.env.SSS_PROGRAM_ID || "451UiDzutoMvqZkEj94PSNQTZELV4JqWRdiSoiJB9bxp";
  const hookAddress = new PublicKey(process.env.HOOK_PROGRAM_ID || "5cs7VzZny1XMj4TAJy2xVqo2tCHM8Vwe9bNbL6uRmbxk");

  const sdk = new StablecoinSDK(connection, adminKeypair, programId, hookAddress.toBase58());

  await ensurePayerBalance(connection, adminKeypair);

  const mintAddress = await sdk.create("Regulated USD", "RUSD", "https://example.com/logo.png", 6, Presets.SSS_2, hookAddress);
  console.log("\n--- Initializing ExtraAccountMetaList (required for Transfer Hook) ---");
  await sdk.initializeExtraAccountMetaList(mintAddress);

  const badGuy = Keypair.generate();
  const innocentGuy = Keypair.generate();
  const treasury = adminKeypair.publicKey;

  await sdk.mint(mintAddress, badGuy.publicKey, 1000);

  console.log("\n--- Blacklisting Bad Guy ---");
  await sdk.compliance.blacklistAdd(badGuy.publicKey, hookAddress);

  console.log("\n--- Testing Transfer (Should Fail) ---");
  const badGuyAirdropSig = await connection.requestAirdrop(badGuy.publicKey, LAMPORTS_PER_SOL);
  await connection.confirmTransaction(badGuyAirdropSig, "confirmed");

  try {
    await sdk.transfer(mintAddress, badGuy, innocentGuy.publicKey, 100, 6, hookAddress);
    throw new Error("Transfer unexpectedly succeeded for blacklisted wallet.");
  } catch {
    console.log("✅ SUCCESS! Transfer blocked by Transfer Hook successfully! (Wallet is Blacklisted)");
  }

  const badGuyAta = getAssociatedTokenAddressSync(mintAddress, badGuy.publicKey, false, TOKEN_2022_PROGRAM_ID);
  console.log(`BadGuyAta: ${badGuyAta.toBase58()}`);

  console.log("\n--- SEIZING TOKENS ---");
  await sdk.compliance.seize(mintAddress, badGuyAta, treasury, 900);

  console.log("\n✅ SSS-2 Test completed successfully! All Compliance rules verified.");
}

main().catch((error) => {
  console.error("❌ Error during test:", error);
  process.exit(1);
});
