import { PublicKey } from "@solana/web3.js";
import { getProvider, loadStablecoin } from "./utils";

export async function blacklistCommand(opts: any) {
  const parent = opts.parent?.parent || opts;
  const cluster = parent.cluster || opts.cluster || "http://localhost:8899";
  const keypair = parent.keypair || opts.keypair || "~/.config/solana/id.json";

  try {
    const provider = await getProvider(cluster, keypair);
    const stablecoin = await loadStablecoin(provider, opts.mint);

    if (!stablecoin.isComplianceEnabled()) {
      console.error("❌ Compliance features require SSS-2 preset");
      process.exit(1);
    }

    switch (opts.action) {
      case "add": {
        const address = new PublicKey(opts.address);
        const reason = opts.reason || "";
        console.log(`\n🚫 Blacklisting ${address.toBase58()}...`);
        if (reason) console.log(`   Reason: ${reason}`);
        const sig = await stablecoin.compliance.addToBlacklist(address, reason);
        console.log(`✅ Address blacklisted`);
        console.log(`   Signature: ${sig}`);
        break;
      }

      case "remove": {
        const address = new PublicKey(opts.address);
        console.log(`\n🔓 Removing ${address.toBase58()} from blacklist...`);
        const sig = await stablecoin.compliance.removeFromBlacklist(address);
        console.log(`✅ Address removed from blacklist`);
        console.log(`   Signature: ${sig}`);
        break;
      }

      case "check": {
        const address = new PublicKey(opts.address);
        console.log(`\n🔍 Checking blacklist status for ${address.toBase58()}...`);
        const entry = await stablecoin.compliance.getBlacklistEntry(address);
        if (entry) {
          console.log(`   Status:  🚫 BLACKLISTED`);
          console.log(`   Added by: ${entry.addedBy.toBase58()}`);
          console.log(`   Reason:   ${entry.reason || "(none)"}`);
          console.log(`   Slot:     ${entry.createdAt}`);
        } else {
          console.log(`   Status:  ✅ Not blacklisted`);
        }
        break;
      }

      case "seize": {
        const source = new PublicKey(opts.from);
        const destination = new PublicKey(opts.to);
        const owner = new PublicKey(opts.owner);
        const amount = BigInt(opts.amount);

        console.log(`\n⚠️  Seizing ${amount} tokens...`);
        console.log(`   From (ATA):   ${source.toBase58()}`);
        console.log(`   Owner:        ${owner.toBase58()}`);
        console.log(`   To:           ${destination.toBase58()}`);

        const sig = await stablecoin.compliance.seize(
          source,
          destination,
          amount,
          owner
        );
        console.log(`✅ Tokens seized`);
        console.log(`   Signature: ${sig}`);
        break;
      }

      default:
        console.error(`Unknown action: ${opts.action}`);
        process.exit(1);
    }
  } catch (err: any) {
    console.error(`\n❌ Blacklist operation failed: ${err.message}`);
    process.exit(1);
  }
}
