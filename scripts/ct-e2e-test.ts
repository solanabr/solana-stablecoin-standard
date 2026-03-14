#!/usr/bin/env npx ts-node
/**
 * REAL SSS-3 Confidential Transfer E2E
 *
 * This script executes real Token-2022 confidential transfer instructions via
 * `spl-token` CLI (which performs proof generation/verification internally).
 *
 * Flow:
 * 1) Create Token-2022 mint with confidential transfers enabled
 * 2) Create Alice/Bob token accounts
 * 3) Mint to Alice (public)
 * 4) Configure confidential transfer accounts
 * 5) Deposit Alice public -> confidential
 * 6) Confidential transfer Alice -> Bob (`--confidential`)
 * 7) Apply Bob pending balance
 * 8) Withdraw Bob confidential -> public
 * 9) Write proof artifacts (signatures + command evidence) to JSON
 *
 * Usage:
 *   npx ts-node scripts/ct-e2e-test.ts --cluster localhost
 *   npx ts-node scripts/ct-e2e-test.ts --cluster devnet
 */

import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";

type Cluster = "localhost" | "devnet";

interface CtRunArtifact {
  status?: "success" | "blocked" | "failed";
  blockedReason?: string;
  error?: string;
  cluster: Cluster;
  mint: string;
  accounts: {
    authority: string;
    aliceWallet: string;
    bobWallet: string;
    aliceTokenAccount: string;
    bobTokenAccount: string;
  };
  amounts: {
    mintToAlice: number;
    depositToConfidential: number;
    confidentialTransfer: number;
    withdrawToPublic: number;
  };
  signatures: Record<string, string>;
  explorerLinks: Record<string, string>;
  commandLog: Array<{ step: string; command: string; output: string }>;
  generatedAt: string;
}

const DECIMALS = 6;
const MINT_TO_ALICE = 10_000;
const DEPOSIT_TO_CONFIDENTIAL = 5_000;
const CONFIDENTIAL_TRANSFER = 2_000;
const WITHDRAW_TO_PUBLIC = 1_000;

const args = process.argv.slice(2);
const clusterArgIndex = args.findIndex((value) => value === "--cluster");
const cluster: Cluster =
  clusterArgIndex >= 0 && args[clusterArgIndex + 1] === "devnet" ? "devnet" : "localhost";
const skipAirdrop = args.includes("--skip-airdrop");
const authorityKeyArgIndex = args.findIndex((value) => value === "--authority-keypair");
const authorityKeyOverride = authorityKeyArgIndex >= 0 ? args[authorityKeyArgIndex + 1] : "";

const runRoot = process.cwd();
const outputDir = path.join(runRoot, "artifacts", "ct-e2e");
const keyDir = path.join(outputDir, "keys");
const cfgDir = path.join(outputDir, "configs");

const commandLog: Array<{ step: string; command: string; output: string }> = [];

const runState = {
  cluster,
  mint: "",
  authority: "",
  aliceWallet: "",
  bobWallet: "",
  aliceTokenAccount: "",
  bobTokenAccount: "",
};

function ensureTool(tool: string): void {
  try {
    execSync(`command -v ${tool}`, { stdio: "pipe" });
  } catch {
    throw new Error(`Required tool not found in PATH: ${tool}`);
  }
}

function run(step: string, command: string): string {
  try {
    const output = execSync(command, {
      stdio: ["ignore", "pipe", "pipe"],
      encoding: "utf8",
    }).trim();

    commandLog.push({ step, command, output });
    console.log(`✅ ${step}`);
    return output;
  } catch (error: any) {
    const stdout = error?.stdout ? String(error.stdout).trim() : "";
    const stderr = error?.stderr ? String(error.stderr).trim() : "";
    const mergedOutput = [stdout, stderr].filter(Boolean).join("\n");
    commandLog.push({ step, command, output: mergedOutput || String(error?.message || "Unknown command error") });
    throw error;
  }
}

function isZkProgramTemporarilyDisabled(message: string): boolean {
  const lower = message.toLowerCase();
  return lower.includes("zk-elgamal-proof program is temporarily disabled") ||
    lower.includes("zke1gama1proof11111111111111111111111111111") && lower.includes("invalid instruction data");
}

function writeArtifact(status: "success" | "blocked" | "failed", details?: { blockedReason?: string; error?: string }): string {
  fs.mkdirSync(outputDir, { recursive: true });

  const artifact: CtRunArtifact = {
    status,
    blockedReason: details?.blockedReason,
    error: details?.error,
    cluster,
    mint: runState.mint,
    accounts: {
      authority: runState.authority,
      aliceWallet: runState.aliceWallet,
      bobWallet: runState.bobWallet,
      aliceTokenAccount: runState.aliceTokenAccount,
      bobTokenAccount: runState.bobTokenAccount,
    },
    amounts: {
      mintToAlice: MINT_TO_ALICE,
      depositToConfidential: DEPOSIT_TO_CONFIDENTIAL,
      confidentialTransfer: CONFIDENTIAL_TRANSFER,
      withdrawToPublic: WITHDRAW_TO_PUBLIC,
    },
    signatures: {},
    explorerLinks: {},
    commandLog,
    generatedAt: new Date().toISOString(),
  };

  const artifactPath = path.join(outputDir, `ct-e2e-proof-${status}-${Date.now()}.json`);
  fs.writeFileSync(artifactPath, JSON.stringify(artifact, null, 2));
  return artifactPath;
}

function ensureClusterReachable(targetCluster: Cluster): void {
  const urlFlag = targetCluster === "localhost" ? "localhost" : "devnet";

  try {
    execSync(`solana cluster-version -u ${urlFlag}`, {
      stdio: "pipe",
      encoding: "utf8",
    });
  } catch {
    if (targetCluster === "localhost") {
      throw new Error(
        "Local validator is not reachable at http://localhost:8899. Start it with: solana-test-validator --reset"
      );
    }
    throw new Error("Unable to reach Solana devnet RPC. Check network connectivity and try again.");
  }
}

function jsonOrRaw<T = any>(value: string): T | null {
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function findSignature(value: string): string {
  const parsed = jsonOrRaw<any>(value);

  const deepSearch = (node: any): string | null => {
    if (!node || typeof node !== "object") return null;
    for (const key of Object.keys(node)) {
      const keyLower = key.toLowerCase();
      if (keyLower.includes("signature") || keyLower === "tx" || keyLower === "transaction") {
        const candidate = node[key];
        if (typeof candidate === "string" && candidate.length >= 32) return candidate;
      }
      const nested = deepSearch(node[key]);
      if (nested) return nested;
    }
    return null;
  };

  const fromJson = parsed ? deepSearch(parsed) : null;
  if (fromJson) return fromJson;

  const inline = value.match(/[1-9A-HJ-NP-Za-km-z]{64,88}/g);
  if (inline && inline.length > 0) return inline[0];

  return "";
}

function findAddress(value: string): string {
  const parsed = jsonOrRaw<any>(value);

  if (parsed && typeof parsed === "object") {
    const priorityKeys = ["address", "mint", "account", "associatedTokenAddress", "token"];

    const deepFind = (node: any): string | null => {
      if (!node || typeof node !== "object") return null;

      for (const key of priorityKeys) {
        if (typeof node[key] === "string") return node[key];
      }

      for (const childKey of Object.keys(node)) {
        const nested = deepFind(node[childKey]);
        if (nested) return nested;
      }

      return null;
    };

    const fromJson = deepFind(parsed);
    if (fromJson) return fromJson;
  }

  const candidates = value.match(/[1-9A-HJ-NP-Za-km-z]{32,44}/g);
  if (!candidates || candidates.length === 0) {
    throw new Error(`Failed to parse address from output: ${value}`);
  }
  return candidates[candidates.length - 1];
}

function explorer(clusterName: Cluster, signature: string): string {
  if (!signature) return "";
  const clusterParam = clusterName === "localhost" ? "custom" : "devnet";
  if (clusterName === "localhost") {
    return `http://localhost:8899/tx/${signature}`;
  }
  return `https://explorer.solana.com/tx/${signature}?cluster=${clusterParam}`;
}

function writeSolanaConfig(configPath: string, rpcUrl: string, wsUrl: string, keypairPath: string): void {
  const yaml = [
    `json_rpc_url: ${rpcUrl}`,
    `websocket_url: ${wsUrl}`,
    `keypair_path: ${keypairPath}`,
    `commitment: confirmed`,
  ].join("\n");

  fs.writeFileSync(configPath, `${yaml}\n`);
}

function main(): void {
  ensureTool("solana");
  ensureTool("spl-token");
  ensureTool("solana-keygen");
  ensureClusterReachable(cluster);

  fs.mkdirSync(keyDir, { recursive: true });
  fs.mkdirSync(cfgDir, { recursive: true });

  const authorityKey = authorityKeyOverride || path.join(keyDir, "authority.json");
  const aliceKey = path.join(keyDir, "alice.json");
  const bobKey = path.join(keyDir, "bob.json");
  const authorityCfg = path.join(cfgDir, "authority.yml");
  const aliceCfg = path.join(cfgDir, "alice.yml");
  const bobCfg = path.join(cfgDir, "bob.yml");

  if (!authorityKeyOverride) {
    run("Generate authority keypair", `solana-keygen new --no-bip39-passphrase --silent --force -o ${authorityKey}`);
  } else {
    console.log(`✅ Use provided authority keypair: ${authorityKey}`);
  }
  run("Generate alice keypair", `solana-keygen new --no-bip39-passphrase --silent --force -o ${aliceKey}`);
  run("Generate bob keypair", `solana-keygen new --no-bip39-passphrase --silent --force -o ${bobKey}`);

  const authorityWallet = run("Read authority pubkey", `solana-keygen pubkey ${authorityKey}`);
  const aliceWallet = run("Read alice pubkey", `solana-keygen pubkey ${aliceKey}`);
  const bobWallet = run("Read bob pubkey", `solana-keygen pubkey ${bobKey}`);
  runState.authority = authorityWallet;
  runState.aliceWallet = aliceWallet;
  runState.bobWallet = bobWallet;

  const urlFlag = cluster === "localhost" ? "localhost" : "devnet";
  const rpcUrl = cluster === "localhost" ? "http://127.0.0.1:8899" : "https://api.devnet.solana.com";
  const wsUrl = cluster === "localhost" ? "ws://127.0.0.1:8900" : "wss://api.devnet.solana.com/";

  writeSolanaConfig(authorityCfg, rpcUrl, wsUrl, authorityKey);
  writeSolanaConfig(aliceCfg, rpcUrl, wsUrl, aliceKey);
  writeSolanaConfig(bobCfg, rpcUrl, wsUrl, bobKey);

  if (!skipAirdrop) {
    try {
      run("Airdrop authority", `solana airdrop 5 ${authorityWallet} -u ${urlFlag}`);
    } catch (error) {
      if (cluster === "devnet") {
        throw new Error(
          "Devnet airdrop rate-limited. Re-run with --skip-airdrop --authority-keypair <FUNDED_KEYPAIR_PATH>"
        );
      }
      throw error;
    }
  } else {
    console.log("✅ Skip airdrop (using pre-funded authority keypair)");
  }

  const createMintOut = run(
    "Create Token-2022 mint with confidential transfers",
    `spl-token --config ${authorityCfg} --program-2022 -u ${urlFlag} create-token --decimals ${DECIMALS} --enable-confidential-transfers auto --enable-freeze --mint-authority ${authorityKey} --fee-payer ${authorityKey} --output json`
  );
  const mint = findAddress(createMintOut);
  runState.mint = mint;

  const createAliceAtaOut = run(
    "Create alice token account",
    `spl-token --config ${aliceCfg} --program-2022 -u ${urlFlag} create-account ${mint} --fee-payer ${authorityKey} --output json`
  );
  const aliceTokenAccount = getAssociatedTokenAddressSync(
    new PublicKey(mint),
    new PublicKey(aliceWallet),
    false,
    TOKEN_2022_PROGRAM_ID
  ).toBase58();
  runState.aliceTokenAccount = aliceTokenAccount;

  const createBobAtaOut = run(
    "Create bob token account",
    `spl-token --config ${bobCfg} --program-2022 -u ${urlFlag} create-account ${mint} --fee-payer ${authorityKey} --output json`
  );
  const bobTokenAccount = getAssociatedTokenAddressSync(
    new PublicKey(mint),
    new PublicKey(bobWallet),
    false,
    TOKEN_2022_PROGRAM_ID
  ).toBase58();
  runState.bobTokenAccount = bobTokenAccount;

  const mintOut = run(
    "Mint public tokens to alice",
    `spl-token --config ${authorityCfg} --program-2022 -u ${urlFlag} mint ${mint} ${MINT_TO_ALICE} ${aliceTokenAccount} --mint-authority ${authorityKey} --fee-payer ${authorityKey} --output json`
  );

  const configureAliceOut = run(
    "Configure alice confidential transfer account",
    `spl-token --config ${aliceCfg} --program-2022 -u ${urlFlag} configure-confidential-transfer-account ${mint} --fee-payer ${authorityKey} --output json`
  );

  const configureBobOut = run(
    "Configure bob confidential transfer account",
    `spl-token --config ${bobCfg} --program-2022 -u ${urlFlag} configure-confidential-transfer-account ${mint} --fee-payer ${authorityKey} --output json`
  );

  const depositOut = run(
    "Deposit alice public -> confidential",
    `spl-token --config ${aliceCfg} --program-2022 -u ${urlFlag} deposit-confidential-tokens ${mint} ${DEPOSIT_TO_CONFIDENTIAL} --fee-payer ${authorityKey} --output json`
  );

  const applyAliceOut = run(
    "Apply alice pending confidential balance",
    `spl-token --config ${aliceCfg} --program-2022 -u ${urlFlag} apply-pending-balance ${mint} --fee-payer ${authorityKey} --output json`
  );

  const ctTransferOut = run(
    "Confidential transfer alice -> bob",
    `spl-token --config ${aliceCfg} --program-2022 -u ${urlFlag} transfer ${mint} ${CONFIDENTIAL_TRANSFER} ${bobTokenAccount} --from ${aliceTokenAccount} --confidential --fee-payer ${authorityKey} --output json`
  );

  const applyBobOut = run(
    "Apply bob pending confidential balance",
    `spl-token --config ${bobCfg} --program-2022 -u ${urlFlag} apply-pending-balance ${mint} --fee-payer ${authorityKey} --output json`
  );

  const withdrawOut = run(
    "Withdraw bob confidential -> public",
    `spl-token --config ${bobCfg} --program-2022 -u ${urlFlag} withdraw-confidential-tokens ${mint} ${WITHDRAW_TO_PUBLIC} --fee-payer ${authorityKey} --output json`
  );

  const alicePublicBalance = run(
    "Read alice public balance",
    `spl-token --config ${aliceCfg} --program-2022 -u ${urlFlag} balance ${mint} --address ${aliceTokenAccount} --fee-payer ${authorityKey} --output json`
  );
  const bobPublicBalance = run(
    "Read bob public balance",
    `spl-token --config ${bobCfg} --program-2022 -u ${urlFlag} balance ${mint} --address ${bobTokenAccount} --fee-payer ${authorityKey} --output json`
  );

  const signatures: Record<string, string> = {
    mintToAlice: findSignature(mintOut),
    configureAlice: findSignature(configureAliceOut),
    configureBob: findSignature(configureBobOut),
    deposit: findSignature(depositOut),
    applyAlice: findSignature(applyAliceOut),
    confidentialTransfer: findSignature(ctTransferOut),
    applyBob: findSignature(applyBobOut),
    withdraw: findSignature(withdrawOut),
  };

  const explorerLinks = Object.fromEntries(
    Object.entries(signatures).map(([key, sig]) => [key, explorer(cluster, sig)])
  );

  const artifact: CtRunArtifact = {
    cluster,
    mint,
    accounts: {
      authority: authorityWallet,
      aliceWallet,
      bobWallet,
      aliceTokenAccount,
      bobTokenAccount,
    },
    amounts: {
      mintToAlice: MINT_TO_ALICE,
      depositToConfidential: DEPOSIT_TO_CONFIDENTIAL,
      confidentialTransfer: CONFIDENTIAL_TRANSFER,
      withdrawToPublic: WITHDRAW_TO_PUBLIC,
    },
    signatures,
    explorerLinks,
    commandLog,
    generatedAt: new Date().toISOString(),
  };

  const artifactPath = path.join(outputDir, `ct-e2e-proof-success-${Date.now()}.json`);
  artifact.status = "success";
  fs.writeFileSync(artifactPath, JSON.stringify(artifact, null, 2));

  console.log("\n============================================================");
  console.log("✅ REAL CT E2E COMPLETE (Token-2022 + confidential proofs)");
  console.log("============================================================");
  console.log(`Cluster:         ${cluster}`);
  console.log(`Mint:            ${mint}`);
  console.log(`Alice public:    ${alicePublicBalance}`);
  console.log(`Bob public:      ${bobPublicBalance}`);
  console.log(`Artifact:        ${artifactPath}`);
  console.log("\nProof transactions:");
  for (const [key, link] of Object.entries(explorerLinks)) {
    if (link) console.log(`- ${key}: ${link}`);
  }
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  const blocked = isZkProgramTemporarilyDisabled(message);
  const artifactPath = writeArtifact(blocked ? "blocked" : "failed", {
    blockedReason: blocked ? "Devnet zk-elgamal-proof program temporarily disabled" : undefined,
    error: message,
  });

  console.error("\n❌ Real CT E2E failed:");
  console.error(message);
  if (blocked) {
    console.error("\nℹ️ External blocker detected: zk-elgamal proof verifier is disabled on cluster.");
    console.error("ℹ️ This is a network-side availability issue, not a client-side simulation flow.");
  }
  console.error(`\n🧾 Failure artifact written: ${artifactPath}`);
  process.exit(1);
}
