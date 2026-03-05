async function fetchText(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${url} -> ${response.status} ${response.statusText}`);
  }
  return response.text();
}

async function main(): Promise<void> {
  console.log("=== Cloak Privacy Demo (same Surfpool localnet) ===\n");

  const relayUrl = process.env.CLOAK_RELAY_URL ?? "http://localhost:8080";
  console.log("Relay URL:", relayUrl);

  console.log("\n1. Checking Cloak relay health...");
  try {
    const health = await fetchText(`${relayUrl}/health`);
    console.log("   Relay status:", health || "OK");
  } catch (error) {
    console.log("   Relay health check failed:", error instanceof Error ? error.message : String(error));
  }

  console.log("\n2. Fetching Merkle root...");
  try {
    const root = await fetchText(`${relayUrl}/merkle-root`);
    console.log("   Merkle root:", root);
  } catch (error) {
    console.log("   Merkle root endpoint unavailable:", error instanceof Error ? error.message : String(error));
  }

  console.log("\n3. Fetching commitment index...");
  try {
    const commitments = await fetchText(`${relayUrl}/commitments`);
    console.log("   Commitments:", commitments);
  } catch (error) {
    console.log("   Commitments endpoint unavailable:", error instanceof Error ? error.message : String(error));
  }

  console.log("\n4. Viewing key endpoint check...");
  try {
    const response = await fetch(`${relayUrl}/viewing-key/register`, { method: "OPTIONS" });
    console.log("   Viewing-key endpoint reachable:", response.ok ? "YES" : `NO (${response.status})`);
  } catch (error) {
    console.log("   Viewing-key endpoint unavailable:", error instanceof Error ? error.message : String(error));
  }

  console.log("\n=== Cloak check complete ===");
  console.log("SSS and Cloak can share the same Surfpool localnet RPC when relay/programs are live.");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
