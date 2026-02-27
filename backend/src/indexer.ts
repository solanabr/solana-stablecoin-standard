/**
 * Event Indexer Service
 *
 * Listens to on-chain events and persists to database
 * Background worker for real-time indexing
 */

import { Connection, PublicKey } from "@solana/web3.js";
import { createClient } from "@supabase/supabase-js";
import { SSS_TOKEN_PROGRAM_ID, SSS_TRANSFER_HOOK_PROGRAM_ID } from "@stbr/sss-token";

// Configuration
const RPC_URL = process.env.RPC_URL || "https://api.devnet.solana.com";
const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL || "5000"); // 5 seconds

// Initialize
const connection = new Connection(RPC_URL, "confirmed");
const supabase = createClient(
  process.env.SUPABASE_URL || "",
  process.env.SUPABASE_KEY || ""
);

// Event signatures (program logs)
const EVENT_SIGNATURES = {
  STABLECOIN_INITIALIZED: "StablecoinInitialized",
  TOKENS_MINTED: "TokensMinted",
  TOKENS_BURNED: "TokensBurned",
  ACCOUNT_FROZEN: "AccountFrozen",
  ACCOUNT_THAWED: "AccountThawed",
  STABLECOIN_PAUSED: "StablecoinPaused",
  STABLECOIN_UNPAUSED: "StablecoinUnpaused",
  ROLES_UPDATED: "RolesUpdated",
  MINTER_QUOTA_UPDATED: "MinterQuotaUpdated",
  AUTHORITY_TRANSFERRED: "AuthorityTransferred",
  BATCH_MINTED: "BatchMinted",
  MULTISIG_PROPOSAL_CREATED: "MultisigProposalCreated",
  MULTISIG_PROPOSAL_APPROVED: "MultisigProposalApproved",
  MULTISIG_PROPOSAL_EXECUTED: "MultisigProposalExecuted",
  TRANSFER_EXECUTED: "TransferExecuted",
  BLACKLIST_ADDED: "BlacklistAdded",
  BLACKLIST_REMOVED: "BlacklistRemoved",
  TOKENS_SEIZED: "TokensSeized",
  CONFIG_UPDATED: "ConfigUpdated",
  BATCH_BLACKLIST_ADDED: "BatchBlacklistAdded",
};

/**
 * Parse event from transaction logs
 */
function parseEvent(logs: string[], signature: string): any[] {
  const events: any[] = [];

  for (const log of logs) {
    // Check for program events
    if (log.includes("Program log:")) {
      const eventData = log.replace("Program log:", "").trim();

      try {
        const event = JSON.parse(eventData);
        event.signature = signature;
        events.push(event);
      } catch {
        // Not JSON, might be raw log
      }
    }
  }

  return events;
}

/**
 * Process a single event
 */
async function processEvent(event: any) {
  try {
    const eventType = Object.keys(event)[0];
    const eventData = event[eventType];

    switch (eventType) {
      case EVENT_SIGNATURES.STABLECOIN_INITIALIZED:
        await processStablecoinInitialized(eventData);
        break;

      case EVENT_SIGNATURES.TOKENS_MINTED:
        await processTokensMinted(eventData);
        break;

      case EVENT_SIGNATURES.TOKENS_BURNED:
        await processTokensBurned(eventData);
        break;

      case EVENT_SIGNATURES.ACCOUNT_FROZEN:
        await processAccountFrozen(eventData);
        break;

      case EVENT_SIGNATURES.ACCOUNT_THAWED:
        await processAccountThawed(eventData);
        break;

      case EVENT_SIGNATURES.STABLECOIN_PAUSED:
        await processStablecoinPaused(eventData);
        break;

      case EVENT_SIGNATURES.STABLECOIN_UNPAUSED:
        await processStablecoinUnpaused(eventData);
        break;

      case EVENT_SIGNATURES.ROLES_UPDATED:
        await processRolesUpdated(eventData);
        break;

      case EVENT_SIGNATURES.MINTER_QUOTA_UPDATED:
        await processMinterQuotaUpdated(eventData);
        break;

      case EVENT_SIGNATURES.AUTHORITY_TRANSFERRED:
        await processAuthorityTransferred(eventData);
        break;

      case EVENT_SIGNATURES.BATCH_MINTED:
        await processBatchMinted(eventData);
        break;

      case EVENT_SIGNATURES.TRANSFER_EXECUTED:
        await processTransferExecuted(eventData);
        break;

      case EVENT_SIGNATURES.BLACKLIST_ADDED:
        await processBlacklistAdded(eventData);
        break;

      case EVENT_SIGNATURES.BLACKLIST_REMOVED:
        await processBlacklistRemoved(eventData);
        break;

      case EVENT_SIGNATURES.TOKENS_SEIZED:
        await processTokensSeized(eventData);
        break;

      case EVENT_SIGNATURES.CONFIG_UPDATED:
        await processConfigUpdated(eventData);
        break;

      default:
        console.log("Unknown event type:", eventType);
    }
  } catch (error) {
    console.error("Error processing event:", error);
  }
}

// ==================== EVENT HANDLERS ====================

async function processStablecoinInitialized(data: any) {
  await supabase.from("events").insert({
    event_type: "stablecoin_initialized",
    signature: data.signature,
    stablecoin: data.mint,
    authority: data.authority,
    name: data.name,
    symbol: data.symbol,
    timestamp: new Date(data.timestamp * 1000).toISOString(),
    data: data,
  });

  // Also update state table
  await supabase.from("stablecoin_states").upsert({
    stablecoin: data.mint,
    authority: data.authority,
    name: data.name,
    symbol: data.symbol,
    total_supply: 0,
    is_paused: false,
    updated_at: new Date().toISOString(),
  });

  console.log("✅ Stablecoin initialized:", data.name);
}

async function processTokensMinted(data: any) {
  await supabase.from("events").insert({
    event_type: "tokens_minted",
    signature: data.signature,
    stablecoin: data.mint,
    minter: data.minter,
    recipient: data.recipient,
    amount: data.amount,
    timestamp: new Date(data.timestamp * 1000).toISOString(),
    data: data,
  });

  // Update transaction records
  await supabase.from("transactions").insert({
    signature: data.signature,
    stablecoin: data.mint,
    type: "mint",
    from: null,
    to: data.recipient,
    amount: data.amount,
    timestamp: new Date(data.timestamp * 1000).toISOString(),
  });

  // Update holder balance
  await updateHolderBalance(data.recipient, data.mint, data.amount, "add");

  console.log("✅ Tokens minted:", data.amount);
}

async function processTokensBurned(data: any) {
  await supabase.from("events").insert({
    event_type: "tokens_burned",
    signature: data.signature,
    stablecoin: data.mint,
    burner: data.burner,
    owner: data.owner,
    amount: data.amount,
    timestamp: new Date(data.timestamp * 1000).toISOString(),
    data: data,
  });

  await supabase.from("transactions").insert({
    signature: data.signature,
    stablecoin: data.mint,
    type: "burn",
    from: data.owner,
    to: null,
    amount: data.amount,
    timestamp: new Date(data.timestamp * 1000).toISOString(),
  });

  await updateHolderBalance(data.owner, data.mint, data.amount, "subtract");

  console.log("✅ Tokens burned:", data.amount);
}

async function processAccountFrozen(data: any) {
  await supabase.from("events").insert({
    event_type: "account_frozen",
    signature: data.signature,
    stablecoin: data.mint,
    account: data.account,
    timestamp: new Date(data.timestamp * 1000).toISOString(),
    data: data,
  });

  console.log("✅ Account frozen:", data.account);
}

async function processAccountThawed(data: any) {
  await supabase.from("events").insert({
    event_type: "account_thawed",
    signature: data.signature,
    stablecoin: data.mint,
    account: data.account,
    timestamp: new Date(data.timestamp * 1000).toISOString(),
    data: data,
  });

  console.log("✅ Account thawed:", data.account);
}

async function processStablecoinPaused(data: any) {
  await supabase.from("events").insert({
    event_type: "stablecoin_paused",
    signature: data.signature,
    stablecoin: data.mint,
    pauser: data.pauser,
    timestamp: new Date(data.timestamp * 1000).toISOString(),
    data: data,
  });

  await supabase
    .from("stablecoin_states")
    .update({ is_paused: true })
    .eq("stablecoin", data.mint);

  console.log("✅ Contract paused");
}

async function processStablecoinUnpaused(data: any) {
  await supabase.from("events").insert({
    event_type: "stablecoin_unpaused",
    signature: data.signature,
    stablecoin: data.mint,
    pauser: data.pauser,
    timestamp: new Date(data.timestamp * 1000).toISOString(),
    data: data,
  });

  await supabase
    .from("stablecoin_states")
    .update({ is_paused: false })
    .eq("stablecoin", data.mint);

  console.log("✅ Contract unpaused");
}

async function processRolesUpdated(data: any) {
  await supabase.from("events").insert({
    event_type: "roles_updated",
    signature: data.signature,
    stablecoin: data.mint,
    authority: data.authority,
    target: data.target,
    new_roles: data.newRoles,
    timestamp: new Date(data.timestamp * 1000).toISOString(),
    data: data,
  });

  console.log("✅ Roles updated:", data.target);
}

async function processMinterQuotaUpdated(data: any) {
  await supabase.from("events").insert({
    event_type: "minter_quota_updated",
    signature: data.signature,
    stablecoin: data.mint,
    authority: data.authority,
    minter: data.minter,
    new_quota: data.newQuota,
    timestamp: new Date(data.timestamp * 1000).toISOString(),
    data: data,
  });

  console.log("✅ Minter quota updated:", data.minter);
}

async function processAuthorityTransferred(data: any) {
  await supabase.from("events").insert({
    event_type: "authority_transferred",
    signature: data.signature,
    stablecoin: data.mint,
    previous_authority: data.previousAuthority,
    new_authority: data.newAuthority,
    timestamp: new Date(data.timestamp * 1000).toISOString(),
    data: data,
  });

  await supabase
    .from("stablecoin_states")
    .update({ authority: data.newAuthority })
    .eq("stablecoin", data.mint);

  console.log("✅ Authority transferred");
}

async function processBatchMinted(data: any) {
  await supabase.from("events").insert({
    event_type: "batch_minted",
    signature: data.signature,
    stablecoin: data.mint,
    minter: data.minter,
    recipients: data.recipients,
    total_amount: data.totalAmount,
    timestamp: new Date(data.timestamp * 1000).toISOString(),
    data: data,
  });

  console.log("✅ Batch mint:", data.recipients, "recipients");
}

async function processTransferExecuted(data: any) {
  await supabase.from("events").insert({
    event_type: "transfer_executed",
    signature: data.signature,
    stablecoin: data.mint,
    source: data.source,
    destination: data.destination,
    amount: data.amount,
    fee: data.fee,
    net_amount: data.netAmount,
    timestamp: new Date(data.timestamp * 1000).toISOString(),
    data: data,
  });

  await supabase.from("transactions").insert({
    signature: data.signature,
    stablecoin: data.mint,
    type: "transfer",
    from: data.source,
    to: data.destination,
    amount: data.amount,
    fee: data.fee,
    timestamp: new Date(data.timestamp * 1000).toISOString(),
  });

  console.log(
    "✅ Transfer:",
    data.source.slice(0, 8),
    "->",
    data.destination.slice(0, 8)
  );
}

async function processBlacklistAdded(data: any) {
  await supabase.from("events").insert({
    event_type: "blacklist_added",
    signature: data.signature,
    stablecoin: data.mint,
    address: data.address,
    reason: data.reason,
    blacklisted_by: data.blacklistedBy,
    timestamp: new Date(data.timestamp * 1000).toISOString(),
    data: data,
  });

  await supabase.from("blacklist").insert({
    stablecoin: data.mint,
    address: data.address,
    reason: data.reason,
    blacklisted_by: data.blacklistedBy,
    is_active: true,
    created_at: new Date(data.timestamp * 1000).toISOString(),
  });

  console.log("✅ Blacklist added:", data.address.slice(0, 8));
}

async function processBlacklistRemoved(data: any) {
  await supabase.from("events").insert({
    event_type: "blacklist_removed",
    signature: data.signature,
    stablecoin: data.mint,
    address: data.address,
    removed_by: data.removedBy,
    timestamp: new Date(data.timestamp * 1000).toISOString(),
    data: data,
  });

  await supabase
    .from("blacklist")
    .update({ is_active: false })
    .eq("stablecoin", data.mint)
    .eq("address", data.address);

  console.log("✅ Blacklist removed:", data.address.slice(0, 8));
}

async function processTokensSeized(data: any) {
  await supabase.from("events").insert({
    event_type: "tokens_seized",
    signature: data.signature,
    stablecoin: data.mint,
    from: data.from,
    to: data.to,
    amount: data.amount,
    seized_by: data.seizedBy,
    reason: data.reason,
    timestamp: new Date(data.timestamp * 1000).toISOString(),
    data: data,
  });

  await supabase.from("transactions").insert({
    signature: data.signature,
    stablecoin: data.mint,
    type: "seize",
    from: data.from,
    to: data.to,
    amount: data.amount,
    timestamp: new Date(data.timestamp * 1000).toISOString(),
  });

  console.log("✅ Tokens seized:", data.amount);
}

async function processConfigUpdated(data: any) {
  await supabase.from("events").insert({
    event_type: "config_updated",
    signature: data.signature,
    stablecoin: data.mint,
    authority: data.authority,
    field: data.field,
    value: data.value,
    timestamp: new Date(data.timestamp * 1000).toISOString(),
    data: data,
  });

  console.log("✅ Config updated:", data.field);
}

// ==================== HELPERS ====================

async function updateHolderBalance(
  owner: string,
  stablecoin: string,
  amount: string,
  operation: "add" | "subtract"
) {
  // Get existing balance
  const { data: existing } = await supabase
    .from("token_accounts")
    .select("balance")
    .eq("owner", owner)
    .eq("stablecoin", stablecoin)
    .single();

  const currentBalance = existing?.balance || "0";
  const newBalance =
    operation === "add"
      ? BigInt(currentBalance) + BigInt(amount)
      : BigInt(currentBalance) - BigInt(amount);

  await supabase.from("token_accounts").upsert({
    owner,
    stablecoin,
    balance: newBalance.toString(),
    updated_at: new Date().toISOString(),
  });

  // Update total supply in state
  const { data: state } = await supabase
    .from("stablecoin_states")
    .select("total_supply")
    .eq("stablecoin", stablecoin)
    .single();

  const currentSupply = state?.total_supply || "0";
  const newSupply =
    operation === "add"
      ? BigInt(currentSupply) + BigInt(amount)
      : BigInt(currentSupply) - BigInt(amount);

  await supabase
    .from("stablecoin_states")
    .update({ total_supply: newSupply.toString() })
    .eq("stablecoin", stablecoin);
}

// ==================== MAIN LOOP ====================

let lastProcessedSlot = 0;

async function indexEvents() {
  try {
    // Get recent signatures
    const signatures = await connection.getSignaturesForAddress(
      SSS_TOKEN_PROGRAM_ID,
      { limit: 10 },
      "confirmed"
    );

    for (const sigInfo of signatures) {
      if (sigInfo.slot <= lastProcessedSlot) continue;

      // Get transaction details
      const tx = await connection.getTransaction(sigInfo.signature, {
        commitment: "confirmed",
        maxSupportedTransactionVersion: 0,
      });

      if (!tx?.meta?.logMessages) continue;

      // Parse events
      const events = parseEvent(tx.meta.logMessages, sigInfo.signature);

      // Process each event
      for (const event of events) {
        await processEvent(event);
      }

      lastProcessedSlot = sigInfo.slot;
    }

    // Also check transfer hook program
    const hookSignatures = await connection.getSignaturesForAddress(
      SSS_TRANSFER_HOOK_PROGRAM_ID,
      { limit: 10 },
      "confirmed"
    );

    for (const sigInfo of hookSignatures) {
      if (sigInfo.slot <= lastProcessedSlot) continue;

      const tx = await connection.getTransaction(sigInfo.signature, {
        commitment: "confirmed",
        maxSupportedTransactionVersion: 0,
      });

      if (!tx?.meta?.logMessages) continue;

      const events = parseEvent(tx.meta.logMessages, sigInfo.signature);
      for (const event of events) {
        await processEvent(event);
      }

      lastProcessedSlot = sigInfo.slot;
    }
  } catch (error) {
    console.error("Indexing error:", error);
  }
}

// Start indexing
console.log("🚀 Starting event indexer...");
console.log(`🔗 RPC: ${RPC_URL}`);
console.log(`⏱️  Poll interval: ${POLL_INTERVAL}ms`);

setInterval(indexEvents, POLL_INTERVAL);

// Initial run
indexEvents();

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\n👋 Shutting down indexer...");
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("\n👋 Shutting down indexer...");
  process.exit(0);
});
