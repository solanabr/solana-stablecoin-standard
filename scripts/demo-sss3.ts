import { Keypair } from "@solana/web3.js";
import {
  deriveConfigPda,
  deriveRoleRegistryPda,
  ixInitialize,
  loadProvider,
  sendInstructions,
} from "./demo-utils";

async function main(): Promise<void> {
  const relayUrl = process.env.CLOAK_RELAY_URL ?? "http://localhost:5500";
  const { provider, walletKeypair } = loadProvider();
  const authority = provider.wallet.publicKey;

  console.log("=== SSS-3 Demo: Private Stablecoin (Cloak Integration) ===\n");

  const mint = Keypair.generate();
  const symbol = `P${Date.now().toString().slice(-3)}`;
  const [configPda] = deriveConfigPda(authority, symbol);
  const [roleRegistryPda] = deriveRoleRegistryPda(configPda);

  console.log(`1. Initializing SSS-3 'PrivateUSD' (${symbol}) with privacy enabled...`);
  const initTx = await sendInstructions(provider.connection, walletKeypair, [
    ixInitialize({
      config: configPda,
      roleRegistry: roleRegistryPda,
      mint: mint.publicKey,
      authority,
      name: "PrivateUSD",
      symbol,
      decimals: 6,
      enablePermanentDelegate: false,
      enableTransferHook: false,
      defaultAccountFrozen: false,
      enablePrivacy: true,
    }),
  ], [mint]);
  console.log("   TX:", initTx);

  console.log("\n2. Privacy module connecting to Cloak relay...");
  console.log("   Relay URL:", relayUrl);
  try {
    const health = await fetch(`${relayUrl}/health`);
    console.log("   Relay health:", health.ok ? "OK" : `FAILED (${health.status})`);
  } catch {
    console.log("   Relay health: FAILED (unreachable)");
  }

  try {
    const rootResp = await fetch(`${relayUrl}/merkle-root`);
    const rootData = await rootResp.text();
    console.log("   Current Merkle root:", rootData || "<empty>");
  } catch {
    console.log("   Current Merkle root: unavailable");
  }

  console.log("\n3. Viewing Key Hierarchy:");
  console.log("   - Issuer Master Key: can decrypt ALL stablecoin transactions");
  console.log("   - Compliance Officer: scoped to specific addresses");
  console.log("   - Auditor: read-only, time-bounded access");
  console.log("   Registration endpoint:", `${relayUrl}/viewing-key/register`);

  console.log("\n4. SSS-3 Privacy Module API:");
  console.log("   stable.privacy.shieldDeposit(amount, wallet)");
  console.log("   stable.privacy.privateTransfer(recipient, amount, wallet)");
  console.log("   stable.privacy.unshieldWithdraw(amount, recipient, wallet)");
  console.log("   stable.privacy.registerViewingKey(authority, scope)");
  console.log("   stable.privacy.exportAuditTrail(viewingKey)");

  console.log("\n5. Cloak Relay Endpoint Mapping:");
  console.log("   shieldDeposit      -> POST /transact (externalAmount > 0)");
  console.log("   privateTransfer    -> POST /transact (externalAmount = 0)");
  console.log("   unshieldWithdraw   -> POST /transact (externalAmount < 0)");
  console.log("   registerViewingKey -> POST /viewing-key/register");
  console.log("   exportAuditTrail   -> GET /commitments + scanner decrypt");

  console.log("\n6. Demonstrating Cloak deposit pipeline endpoint availability...");
  try {
    const resp = await fetch(`${relayUrl}/transact`, { method: "OPTIONS" });
    console.log("   POST /transact endpoint available:", resp.ok ? "YES" : `NO (${resp.status})`);
  } catch {
    console.log("   POST /transact endpoint available: NO (unreachable)");
  }

  console.log("\n=== SSS-3 Demo Complete ===");
  console.log("The SSS-3 privacy module connects a Token-2022 stablecoin to Cloak relay endpoints.");
  console.log("Both systems can run on the same Surfpool localnet validator/RPC.");
  console.log("Current limitation: Cloak production flow is SOL-centric; full SPL stablecoin privacy is the next integration step.");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
