import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL, SendTransactionError } from "@solana/web3.js";
import { getAssociatedTokenAddressSync, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import { Presets, StablecoinSDK } from "../sdk/src/index";
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

async function ensurePayerBalance(connection: Connection, payer: Keypair, minimumSol = 4) {
  const lamports = await connection.getBalance(payer.publicKey, "confirmed");
  if (lamports >= minimumSol * LAMPORTS_PER_SOL) return;

  const airdropSig = await connection.requestAirdrop(payer.publicKey, minimumSol * LAMPORTS_PER_SOL - lamports);
  await connection.confirmTransaction(airdropSig, "confirmed");
}

async function main() {
  const rpcUrl = process.env.DEVNET_RPC || process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
  const connection = new Connection(rpcUrl, "confirmed");
  const adminKeypair = loadAdminKeypair();

  const programId = process.env.SSS_PROGRAM_ID || "451UiDzutoMvqZkEj94PSNQTZELV4JqWRdiSoiJB9bxp";
  const hookProgramId = new PublicKey(process.env.HOOK_PROGRAM_ID || "5cs7VzZny1XMj4TAJy2xVqo2tCHM8Vwe9bNbL6uRmbxk");

  const sdk = new StablecoinSDK(connection, adminKeypair, programId, hookProgramId.toBase58());

  await ensurePayerBalance(connection, adminKeypair);

  console.log(`Running stress test on ${rpcUrl} ...`);
  const mint = await sdk.create("Stress USD", "sUSD", "https://example.com/stress.json", 6, Presets.SSS_2, hookProgramId);
  await sdk.initializeExtraAccountMetaList(mint);

  const senders = Array.from({ length: 50 }, () => Keypair.generate());
  const receiver = Keypair.generate();

  for (const sender of [...senders, receiver]) {
    const sig = await connection.requestAirdrop(sender.publicKey, LAMPORTS_PER_SOL);
    await connection.confirmTransaction(sig, "confirmed");
    await sdk.mint(mint, sender.publicKey, 10);
  }

  const blacklisted = new Set<string>();
  for (let i = 0; i < senders.length; i += 5) {
    await sdk.compliance.blacklistAdd(senders[i].publicKey, hookProgramId);
    blacklisted.add(senders[i].publicKey.toBase58());
  }

  const transferJobs = senders.map(async (sender) => {
    try {
      await sdk.transfer(mint, sender, receiver.publicKey, 1, 6, hookProgramId);
      return { success: true, blocked: false };
    } catch (error: any) {
      if (error instanceof SendTransactionError) {
        const logs = await error.getLogs(connection);
        const blocked = (logs || []).some((l) => l.includes("WalletBlacklisted") || l.includes("TRANSFER BLOCKED"));
        return { success: false, blocked };
      }

      const blocked = String(error?.message || "").includes("WalletBlacklisted");
      return { success: false, blocked };
    }
  });

  const results = await Promise.all(transferJobs);
  const successful = results.filter((r) => r.success).length;
  const blocked = results.filter((r) => !r.success && r.blocked).length;

  console.log(`Successful transfers: ${successful}, Blocked by Hook: ${blocked}`);

  const receiverAta = getAssociatedTokenAddressSync(mint, receiver.publicKey, false, TOKEN_2022_PROGRAM_ID);
  const receiverBalance = await connection.getTokenAccountBalance(receiverAta).catch(() => null);
  console.log(`Receiver ATA balance: ${receiverBalance?.value?.uiAmountString ?? "unavailable"}`);
}

main().catch((e) => {
  console.error("Stress test failed:", e);
  process.exit(1);
});
