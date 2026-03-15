import { Connection, PublicKey } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID } from "@solana-stablecoin/sdk";
import { getProvider, loadStablecoin } from "./utils";

export async function statusCommand(opts: any) {
  const parent = opts.parent || opts;
  const cluster = parent.cluster || opts.cluster || "http://localhost:8899";
  const keypair = parent.keypair || opts.keypair || "~/.config/solana/id.json";

  try {
    const provider = await getProvider(cluster, keypair);
    const stablecoin = await loadStablecoin(provider, opts.mint);
    const config = await stablecoin.getConfig();

    // ─── Holders Command ─────────────────────────────────────────
    if (opts.holders) {
      console.log(`\n📊 Token holders for ${opts.mint}:`);
      const connection = new Connection(cluster, "confirmed");
      const minBalance = BigInt(opts.minBalance || "0");

      try {
        const accounts = await connection.getParsedProgramAccounts(
          new PublicKey(TOKEN_2022_PROGRAM_ID),
          {
            filters: [
              { dataSize: 165 },
              { memcmp: { offset: 0, bytes: opts.mint } },
            ],
          }
        );

        let holders = accounts
          .map((acc: any) => {
            const parsed = acc.account.data.parsed?.info;
            return {
              address: acc.pubkey.toBase58(),
              owner: parsed?.owner || "unknown",
              balance: BigInt(parsed?.tokenAmount?.amount || "0"),
              frozen: parsed?.state === "frozen",
            };
          })
          .filter((h: any) => h.balance >= minBalance);

        holders.sort((a: any, b: any) => (b.balance > a.balance ? 1 : -1));

        console.log(`   Total accounts: ${holders.length}`);
        if (minBalance > 0n) console.log(`   (filtered >= ${minBalance})`);
        console.log("");

        for (const h of holders.slice(0, 50)) {
          const frozenTag = h.frozen ? " [FROZEN]" : "";
          console.log(`   ${h.owner} — ${h.balance.toString()}${frozenTag}`);
        }
        if (holders.length > 50) {
          console.log(`   ... and ${holders.length - 50} more`);
        }
      } catch (err: any) {
        console.log(`   (Could not fetch holders: ${err.message})`);
      }
      return;
    }

    // ─── Audit Log Command ───────────────────────────────────────
    if (opts.auditLog) {
      console.log(`\n📜 Audit log for ${opts.mint}:`);
      const connection = new Connection(cluster, "confirmed");
      const limit = parseInt(opts.limit || "20");
      const actionFilter = opts.action;

      try {
        const sigs = await connection.getSignaturesForAddress(
          new PublicKey(opts.mint),
          { limit: limit * 2 },
          "confirmed"
        );

        console.log(`   Found ${sigs.length} transaction(s)\n`);

        for (const sig of sigs.slice(0, limit)) {
          const tx = await connection.getTransaction(sig.signature, {
            commitment: "confirmed",
            maxSupportedTransactionVersion: 0,
          });

          const logs = tx?.meta?.logMessages || [];
          const eventType = parseEventType(logs);
          if (actionFilter && eventType !== actionFilter) continue;

          const time = sig.blockTime
            ? new Date(sig.blockTime * 1000).toISOString()
            : "unknown";

          console.log(`   [${time}] ${eventType || "unknown"}`);
          console.log(`     Sig: ${sig.signature}`);
          console.log(`     Slot: ${sig.slot}`);
          if (sig.err) console.log(`     ❌ Error: ${JSON.stringify(sig.err)}`);
          console.log("");
        }
      } catch (err: any) {
        console.log(`   (Could not fetch audit log: ${err.message})`);
      }
      return;
    }

    // ─── Supply Only ─────────────────────────────────────────────
    if (opts.supplyOnly) {
      console.log(`\n💰 Supply for ${opts.mint}:`);
      console.log(`   Total minted:     ${config.totalMinted.toString()}`);
      console.log(`   Total burned:     ${config.totalBurned.toString()}`);
      console.log(`   Circulating:      ${(config.totalMinted - config.totalBurned).toString()}`);
      return;
    }

    // ─── Full Status ─────────────────────────────────────────────
    console.log(`\n📊 Stablecoin Status`);
    console.log(`   ─────────────────────────────────`);
    console.log(`   Name:               ${config.name}`);
    console.log(`   Symbol:             ${config.symbol}`);
    console.log(`   Mint:               ${config.mint.toBase58()}`);
    console.log(`   Authority:          ${config.authority.toBase58()}`);
    console.log(`   Preset:             ${config.preset}`);
    console.log(`   Decimals:           ${config.decimals}`);
    console.log(`   Paused:             ${config.paused ? "🔴 YES" : "🟢 No"}`);
    console.log(`   Default frozen:     ${config.defaultAccountFrozen ? "Yes" : "No"}`);
    console.log(`   ─────────────────────────────────`);
    console.log(`   Features:`);
    console.log(`     Freeze authority:     ${config.features.freezeAuthority ? "✅" : "❌"}`);
    console.log(`     Permanent delegate:   ${config.features.permanentDelegate ? "✅" : "❌"}`);
    console.log(`     Transfer hook:        ${config.features.transferHook ? "✅" : "❌"}`);
    console.log(`     Confidential xfers:   ${config.features.confidentialTransfers ? "✅" : "❌"}`);
    console.log(`   ─────────────────────────────────`);
    console.log(`   Supply:`);
    console.log(`     Total minted:   ${config.totalMinted.toString()}`);
    console.log(`     Total burned:   ${config.totalBurned.toString()}`);
    console.log(`     Circulating:    ${(config.totalMinted - config.totalBurned).toString()}`);

    if (config.features.transferHook) {
      console.log(`   ─────────────────────────────────`);
      console.log(`   Transfer hook:  ${config.transferHookProgram.toBase58()}`);
    }

  } catch (err: any) {
    console.error(`\n❌ Status check failed: ${err.message}`);
    process.exit(1);
  }
}

function parseEventType(logs: string[]): string | null {
  const joined = logs.join(" ");
  if (joined.includes("Minted")) return "mint";
  if (joined.includes("Burned")) return "burn";
  if (joined.includes("Froze")) return "freeze";
  if (joined.includes("Thawed")) return "thaw";
  if (joined.includes("paused")) return "pause";
  if (joined.includes("unpaused")) return "unpause";
  if (joined.includes("blacklist")) return "blacklist";
  if (joined.includes("Seized")) return "seize";
  if (joined.includes("Granted")) return "role_grant";
  if (joined.includes("Revoked")) return "role_revoke";
  if (joined.includes("initialized")) return "initialize";
  return null;
}
