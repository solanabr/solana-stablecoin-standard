#!/usr/bin/env node
import {
  Connection,
  PublicKey,
  type Keypair,
  sendAndConfirmTransaction
} from "@solana/web3.js";
import {
  buildDeprecateReleaseInstruction,
  buildInitializeRegistryInstruction,
  buildInstruction,
  buildRegisterReleaseInstruction,
  buildRegisterStablecoinInstruction,
  buildTransaction,
  DEFAULT_RPC_URL,
  encodeStablecoinInstruction,
  Presets,
  readU32LE,
  readU64LE,
  sha256Bytes,
  SolanaStablecoin,
  TOKEN_2022_PROGRAM_ID,
  utf8String,
  writable
} from "@stbr/sss-token";
import type { RoleType } from "@stbr/sss-token";

import { flagValue, hasFlag, parseArgs } from "./args.js";
import { loadCliConfig, normalizeCliConfig } from "./config.js";
import { loadKeypair } from "./keypair.js";
import { writeError, writeJson } from "./output.js";
import { parseRequiredBigInt, parseRequiredPublicKey, requirePositional } from "./validate.js";

function resolveBooleanFlag(
  parsed: ReturnType<typeof parseArgs>,
  enabledFlag: string,
  disabledFlag: string,
  fallback: boolean | undefined
): boolean | undefined {
  if (hasFlag(parsed, enabledFlag)) {
    return true;
  }
  if (hasFlag(parsed, disabledFlag)) {
    return false;
  }
  return fallback;
}

const ROLE_ASSIGNMENT_ACCOUNT_DISCRIMINATOR = sha256Bytes("account:RoleAssignment").slice(0, 8);
const BLACKLIST_ENTRY_ACCOUNT_DISCRIMINATOR = sha256Bytes("account:BlacklistEntry").slice(0, 8);
const PROOF_RECEIPT_ACCOUNT_DISCRIMINATOR = sha256Bytes("account:ProofReceipt").slice(0, 8);

function roleFromString(value: string | undefined): RoleType {
  switch ((value ?? "").toLowerCase()) {
    case "minter":
      return "minter";
    case "burner":
      return "burner";
    case "blacklister":
      return "blacklister";
    case "pauser":
      return "pauser";
    case "seizer":
      return "seizer";
    default:
      throw new Error(`InvalidRole:${value ?? ""}`);
  }
}

function roleToString(value: number): RoleType {
  switch (value) {
    case 0:
      return "minter";
    case 1:
      return "burner";
    case 2:
      return "blacklister";
    case 3:
      return "pauser";
    case 4:
      return "seizer";
    default:
      throw new Error(`UnknownRoleDiscriminator:${value}`);
  }
}

function parseOptionalBigInt(
  value: string | undefined,
  label: string,
  { allowZero = true }: { allowZero?: boolean } = {}
): bigint | null {
  if (!value) {
    return null;
  }
  const parsed = BigInt(value);
  if (parsed < 0n || (!allowZero && parsed === 0n)) {
    throw new Error(`Invalid${label}`);
  }
  return parsed;
}

function parseOptionalInteger(value: string | undefined, label: string, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid${label}`);
  }
  return parsed;
}

function parseHexBytes(value: string | undefined, label: string, exactLength?: number): Uint8Array {
  const raw = requirePositional(value, label);
  const normalized = raw.startsWith("0x") ? raw.slice(2) : raw;
  if (normalized.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(normalized)) {
    throw new Error(`Invalid${label}`);
  }
  const bytes = Uint8Array.from(Buffer.from(normalized, "hex"));
  if (exactLength !== undefined && bytes.length !== exactLength) {
    throw new Error(`Invalid${label}`);
  }
  return bytes;
}

function parseCsvHexBytes(
  value: string | undefined,
  label: string,
  exactLength?: number
): Uint8Array[] {
  if (!value) {
    return [];
  }
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => parseHexBytes(item, label, exactLength));
}

function parseCsvIntegers(value: string | undefined, label: string): number[] {
  if (!value) {
    return [];
  }
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const parsed = Number(item);
      if (!Number.isInteger(parsed) || parsed < 0 || parsed > 255) {
        throw new Error(`Invalid${label}`);
      }
      return parsed;
    });
}

function matchesDiscriminator(data: Uint8Array, discriminator: Uint8Array): boolean {
  if (data.length < discriminator.length) {
    return false;
  }
  return discriminator.every((value, index) => data[index] === value);
}

function readPubkey(data: Uint8Array, offset: number): { value: string; offset: number } {
  return {
    value: new PublicKey(data.subarray(offset, offset + 32)).toBase58(),
    offset: offset + 32
  };
}

function readString(data: Uint8Array, offset: number): { value: string; offset: number } {
  const length = readU32LE(data, offset);
  const start = length.offset;
  const end = start + length.value;
  return {
    value: utf8String(data.subarray(start, end)),
    offset: end
  };
}

function readOptionalU64(data: Uint8Array, offset: number): { value: bigint | null; offset: number } {
  const flag = data[offset];
  if (flag === 0) {
    return { value: null, offset: offset + 1 };
  }
  if (flag !== 1) {
    throw new Error(`InvalidOptionalU64Flag:${flag}`);
  }
  const nested = readU64LE(data, offset + 1);
  return { value: nested.value, offset: nested.offset };
}

function decodeRoleAssignmentAccount(data: Uint8Array): {
  holder: string;
  role: RoleType;
  isActive: boolean;
  mintQuota: string | null;
  mintedSoFar: string;
} {
  let offset = 8 + 32;
  const holder = readPubkey(data, offset);
  offset = holder.offset;
  const role = roleToString(data[offset] ?? 0);
  offset += 1;

  if (data[offset] !== 0 && data[offset] !== 1 && (data[offset + 1] === 0 || data[offset + 1] === 1)) {
    offset += 1;
  }

  const isActive = data[offset] === 1;
  offset += 1;
  const mintQuota = readOptionalU64(data, offset);
  offset = mintQuota.offset;
  const mintedSoFar = readU64LE(data, offset);

  return {
    holder: holder.value,
    role,
    isActive,
    mintQuota: mintQuota.value?.toString() ?? null,
    mintedSoFar: mintedSoFar.value.toString()
  };
}

function decodeBlacklistEntryAccount(data: Uint8Array): {
  address: string;
  reason: string;
  addedBy: string;
  addedAt: string;
} {
  let offset = 8 + 32;
  const address = readPubkey(data, offset);
  offset = address.offset;
  const reason = readString(data, offset);
  offset = reason.offset;
  const addedBy = readPubkey(data, offset);
  offset = addedBy.offset;
  const addedAt = readU64LE(data, offset);

  return {
    address: address.value,
    reason: reason.value,
    addedBy: addedBy.value,
    addedAt: addedAt.value.toString()
  };
}

function decodeProofReceiptAccount(data: Uint8Array): {
  subject: string;
  nullifier: string;
  proofCommitment: string;
  complianceRoot: string;
  circuit: string;
  verifiedBy: string;
  verifiedAtSlot: string;
  expiresAtSlot: string;
} {
  let offset = 8 + 32;
  const subject = readPubkey(data, offset);
  offset = subject.offset;
  const nullifier = readString(data, offset);
  offset = nullifier.offset;
  const proofCommitment = readString(data, offset);
  offset = proofCommitment.offset;
  const complianceRoot = readString(data, offset);
  offset = complianceRoot.offset;
  const circuit = readString(data, offset);
  offset = circuit.offset;
  const verifiedBy = readPubkey(data, offset);
  offset = verifiedBy.offset;
  const verifiedAtSlot = readU64LE(data, offset);
  offset = verifiedAtSlot.offset;
  const expiresAtSlot = readU64LE(data, offset);

  return {
    subject: subject.value,
    nullifier: nullifier.value,
    proofCommitment: proofCommitment.value,
    complianceRoot: complianceRoot.value,
    circuit: circuit.value,
    verifiedBy: verifiedBy.value,
    verifiedAtSlot: verifiedAtSlot.value.toString(),
    expiresAtSlot: expiresAtSlot.value.toString()
  };
}

function requireRegistryProgramId(value: PublicKey | undefined): PublicKey {
  if (!value) {
    throw new Error("MissingRegistryProgramId");
  }
  return value;
}

async function sendInstruction(
  connection: Connection,
  authority: Keypair,
  instruction: Parameters<typeof buildTransaction>[0]
): Promise<string> {
  const tx = buildTransaction(instruction);
  tx.feePayer = authority.publicKey;
  const latestBlockhash = await connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = latestBlockhash.blockhash;
  return sendAndConfirmTransaction(connection, tx, [authority], {
    commitment: "confirmed"
  });
}

async function listStablecoinProgramAccounts(
  stable: SolanaStablecoin
): Promise<Array<{ pubkey: PublicKey; data: Buffer }>> {
  const accounts = await stable.getConnection().getProgramAccounts(stable.getProgramId(), {
    filters: [
      {
        memcmp: {
          offset: 8,
          bytes: stable.getMintAddress().toBase58()
        }
      }
    ]
  });
  return accounts.map(({ pubkey, account }) => ({
    pubkey,
    data: account.data
  }));
}

async function listRoleAssignments(
  stable: SolanaStablecoin,
  filters: { holder?: string; role?: RoleType } = {}
): Promise<Array<Record<string, string | boolean | null>>> {
  const accounts = await listStablecoinProgramAccounts(stable);
  return accounts
    .filter(({ data }) => matchesDiscriminator(data, ROLE_ASSIGNMENT_ACCOUNT_DISCRIMINATOR))
    .map(({ pubkey, data }) => ({
      account: pubkey.toBase58(),
      ...decodeRoleAssignmentAccount(data)
    }))
    .filter((entry) => (!filters.holder || entry.holder === filters.holder) && (!filters.role || entry.role === filters.role));
}

async function listBlacklistEntries(stable: SolanaStablecoin): Promise<Array<Record<string, string>>> {
  const accounts = await listStablecoinProgramAccounts(stable);
  return accounts
    .filter(({ data }) => matchesDiscriminator(data, BLACKLIST_ENTRY_ACCOUNT_DISCRIMINATOR))
    .map(({ pubkey, data }) => ({
      account: pubkey.toBase58(),
      ...decodeBlacklistEntryAccount(data)
    }));
}

async function listProofReceipts(
  stable: SolanaStablecoin,
  subjectFilter?: string
): Promise<Array<Record<string, string>>> {
  const accounts = await listStablecoinProgramAccounts(stable);
  return accounts
    .filter(({ data }) => matchesDiscriminator(data, PROOF_RECEIPT_ACCOUNT_DISCRIMINATOR))
    .map(({ pubkey, data }) => ({
      account: pubkey.toBase58(),
      ...decodeProofReceiptAccount(data)
    }))
    .filter((entry) => !subjectFilter || entry.subject === subjectFilter);
}

async function listHolders(
  connection: Connection,
  mint: PublicKey,
  minBalance: bigint | null
): Promise<Array<{ owner: string; amount: string; tokenAccounts: string[] }>> {
  const tokenAccounts = await connection.getProgramAccounts(TOKEN_2022_PROGRAM_ID, {
    filters: [
      {
        memcmp: {
          offset: 0,
          bytes: mint.toBase58()
        }
      }
    ]
  });
  const balances = new Map<string, { amount: bigint; tokenAccounts: string[] }>();

  for (const { pubkey, account } of tokenAccounts) {
    if (account.data.length < 72) {
      continue;
    }
    const owner = new PublicKey(account.data.subarray(32, 64)).toBase58();
    const amount = readU64LE(account.data, 64).value;
    const current = balances.get(owner) ?? { amount: 0n, tokenAccounts: [] };
    current.amount += amount;
    current.tokenAccounts.push(pubkey.toBase58());
    balances.set(owner, current);
  }

  return Array.from(balances.entries())
    .filter(([, value]) => minBalance === null || value.amount >= minBalance)
    .sort((left, right) => (left[1].amount === right[1].amount ? 0 : left[1].amount > right[1].amount ? -1 : 1))
    .map(([owner, value]) => ({
      owner,
      amount: value.amount.toString(),
      tokenAccounts: value.tokenAccounts
    }));
}

async function readAuditLog(
  stable: SolanaStablecoin,
  limit: number,
  actionFilter?: string
): Promise<Array<Record<string, string | number | null>>> {
  const connection = stable.getConnection();
  const [configEntries, mintEntries] = await Promise.all([
    connection.getSignaturesForAddress(stable.getConfigAddress(), { limit }, "confirmed"),
    connection.getSignaturesForAddress(stable.getMintAddress(), { limit }, "confirmed")
  ]);
  const merged = new Map<string, (typeof configEntries)[number]>();
  for (const entry of [...configEntries, ...mintEntries]) {
    if (!merged.has(entry.signature)) {
      merged.set(entry.signature, entry);
    }
  }
  const entries = Array.from(merged.values()).slice(0, limit);
  if (!actionFilter) {
    return entries.map((entry) => ({
      signature: entry.signature,
      slot: entry.slot,
      blockTime: entry.blockTime ?? null,
      err: entry.err ? JSON.stringify(entry.err) : null,
      memo: entry.memo
    }));
  }

  const transactions = await connection.getTransactions(
    entries.map((entry) => entry.signature),
    {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0
    }
  );
  const normalizedAction = actionFilter.toLowerCase();

  return entries
    .filter((entry, index) => {
      const logs = transactions[index]?.meta?.logMessages ?? [];
      return logs.some((log) => log.toLowerCase().includes(normalizedAction));
    })
    .map((entry) => ({
      signature: entry.signature,
      slot: entry.slot,
      blockTime: entry.blockTime ?? null,
      err: entry.err ? JSON.stringify(entry.err) : null,
      memo: entry.memo
    }));
}

function helpCommands(): string[] {
  return [
    "init",
    "init-hook",
    "mint",
    "burn",
    "pause",
    "unpause",
    "freeze",
    "thaw",
    "blacklist add|remove|list",
    "seize",
    "minters grant|revoke|list",
    "roles grant|revoke|list",
    "authority propose|accept",
    "compliance-root update",
    "proof submit|revoke|list",
    "holders",
    "audit-log",
    "registry",
    "registry-init",
    "registry-register",
    "registry-release",
    "registry-deprecate",
    "status"
  ];
}

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.command === "help" || hasFlag(parsed, "--help")) {
    writeJson({ commands: helpCommands() });
    return;
  }
  const customPath = flagValue(parsed, "--custom");
  const customConfig = customPath ? await loadCliConfig(customPath) : {};
  const normalized = normalizeCliConfig({
    ...customConfig,
    preset: (flagValue(parsed, "--preset") as "sss-1" | "sss-2" | "sss-3" | undefined) ?? customConfig.preset,
    name: flagValue(parsed, "--name") ?? customConfig.name,
    symbol: flagValue(parsed, "--symbol") ?? customConfig.symbol,
    uri: flagValue(parsed, "--uri") ?? customConfig.uri,
    decimals: flagValue(parsed, "--decimals")
      ? Number(flagValue(parsed, "--decimals"))
      : customConfig.decimals,
    standardVersion: flagValue(parsed, "--standard-version") ?? customConfig.standardVersion,
    transferHookProgramId:
      flagValue(parsed, "--transfer-hook-program-id") ?? customConfig.transferHookProgramId,
    proofVerifierProgramId:
      flagValue(parsed, "--proof-verifier-program-id") ?? customConfig.proofVerifierProgramId,
    compressedComplianceRoot:
      flagValue(parsed, "--compressed-compliance-root") ?? customConfig.compressedComplianceRoot,
    complianceCircuit:
      flagValue(parsed, "--compliance-circuit") ?? customConfig.complianceCircuit,
    enablePermanentDelegate: resolveBooleanFlag(
      parsed,
      "--enable-permanent-delegate",
      "--disable-permanent-delegate",
      customConfig.enablePermanentDelegate
    ),
    enableTransferHook: resolveBooleanFlag(
      parsed,
      "--enable-transfer-hook",
      "--disable-transfer-hook",
      customConfig.enableTransferHook
    ),
    enableConfidentialTransfers: resolveBooleanFlag(
      parsed,
      "--enable-confidential-transfers",
      "--disable-confidential-transfers",
      customConfig.enableConfidentialTransfers
    ),
    enableZkComplianceProofs: resolveBooleanFlag(
      parsed,
      "--enable-zk-compliance-proofs",
      "--disable-zk-compliance-proofs",
      customConfig.enableZkComplianceProofs
    ),
    enableCompressedComplianceState: resolveBooleanFlag(
      parsed,
      "--enable-compressed-compliance-state",
      "--disable-compressed-compliance-state",
      customConfig.enableCompressedComplianceState
    ),
    defaultAccountFrozen: resolveBooleanFlag(
      parsed,
      "--default-account-frozen",
      "--default-account-open",
      customConfig.defaultAccountFrozen
    ),
    registryMetadata: {
      ...customConfig.registryMetadata,
      ...(flagValue(parsed, "--homepage") ? { homepage: flagValue(parsed, "--homepage") } : {}),
      ...(flagValue(parsed, "--jurisdiction")
        ? { jurisdiction: flagValue(parsed, "--jurisdiction") }
        : {})
    }
  });

  const connection = new Connection(flagValue(parsed, "--rpc") ?? DEFAULT_RPC_URL, "confirmed");
  const authority = await loadKeypair(flagValue(parsed, "--keypair"));
  const mintFlag = flagValue(parsed, "--mint");
  const programId = (flagValue(parsed, "--program-id") ?? process.env.SSS_STABLECOIN_PROGRAM_ID)
    ? new PublicKey((flagValue(parsed, "--program-id") ?? process.env.SSS_STABLECOIN_PROGRAM_ID) as string)
    : undefined;
  const registryProgramId = (flagValue(parsed, "--registry-program-id") ?? process.env.SSS_REGISTRY_PROGRAM_ID)
    ? new PublicKey((flagValue(parsed, "--registry-program-id") ?? process.env.SSS_REGISTRY_PROGRAM_ID) as string)
    : undefined;
  const transferHookProgramIdValue =
    normalized.transferHookProgramId || process.env.SSS_TRANSFER_HOOK_PROGRAM_ID || undefined;
  const dryRun = hasFlag(parsed, "--dry-run");

  const createDraftStable = async (): Promise<SolanaStablecoin> =>
    SolanaStablecoin.create({
      connection,
      authority,
      programId,
      preset: normalized.preset ?? Presets.SSS_1,
      name: normalized.name,
      symbol: normalized.symbol,
      uri: normalized.uri,
      decimals: normalized.decimals,
      standardVersion: normalized.standardVersion,
      transferHookProgramId: transferHookProgramIdValue
        ? new PublicKey(transferHookProgramIdValue)
        : undefined,
      registryMetadata: normalized.registryMetadata,
      extensions: {
        permanentDelegate: normalized.enablePermanentDelegate,
        transferHook: normalized.enableTransferHook,
        defaultAccountFrozen: normalized.defaultAccountFrozen,
        confidentialTransfers: normalized.enableConfidentialTransfers,
        zkComplianceProofs: normalized.enableZkComplianceProofs,
        compressedComplianceState: normalized.enableCompressedComplianceState
      },
      compliance: {
        proofVerifierProgramId: normalized.proofVerifierProgramId
          ? new PublicKey(normalized.proofVerifierProgramId)
          : undefined,
        compressedComplianceRoot: normalized.compressedComplianceRoot || undefined,
        complianceCircuit: normalized.complianceCircuit || undefined
      }
    });

  const loadExistingStable = async (): Promise<SolanaStablecoin> => {
    if (!mintFlag) {
      throw new Error("MissingMint");
    }
    return SolanaStablecoin.connect({
      connection,
      authority,
      programId,
      mint: new PublicKey(mintFlag),
      registryMetadata: normalized.registryMetadata
    });
  };

  switch (parsed.command) {
    case "init": {
      const stable = await createDraftStable();
      if (dryRun) {
        const tx = await stable.buildInitializeTransaction();
        writeJson({
          action: "initialize",
          dryRun,
          instructionCount: tx.instructions.length,
          mint: stable.getMintAddress().toBase58(),
          preset: normalized.preset,
          configHash: (await stable.getConfig()).configHash
        });
      } else {
        const result = await SolanaStablecoin.createOnChain({
          connection,
          authority,
          programId,
          preset: normalized.preset ?? Presets.SSS_1,
          name: normalized.name,
          symbol: normalized.symbol,
          uri: normalized.uri,
          decimals: normalized.decimals,
          standardVersion: normalized.standardVersion,
          transferHookProgramId: transferHookProgramIdValue
            ? new PublicKey(transferHookProgramIdValue)
            : undefined,
          registryMetadata: normalized.registryMetadata,
          extensions: {
            permanentDelegate: normalized.enablePermanentDelegate,
            transferHook: normalized.enableTransferHook,
            defaultAccountFrozen: normalized.defaultAccountFrozen,
            confidentialTransfers: normalized.enableConfidentialTransfers,
            zkComplianceProofs: normalized.enableZkComplianceProofs,
            compressedComplianceState: normalized.enableCompressedComplianceState
          },
          compliance: {
            proofVerifierProgramId: normalized.proofVerifierProgramId
              ? new PublicKey(normalized.proofVerifierProgramId)
              : undefined,
            compressedComplianceRoot: normalized.compressedComplianceRoot || undefined,
            complianceCircuit: normalized.complianceCircuit || undefined
          }
        });
        writeJson({
          action: "initialize",
          dryRun: false,
          mint: result.stablecoin.getMintAddress().toBase58(),
          config: result.stablecoin.getConfigAddress().toBase58(),
          signature: result.signature,
          preset: normalized.preset
        });
      }
      return;
    }
    case "init-hook": {
      const stable = await loadExistingStable();
      if (dryRun) {
        const tx = await stable.buildInitializeTransferHookMetaListTransaction();
        writeJson({
          action: "init-hook",
          dryRun,
          mint: stable.getMintAddress().toBase58(),
          instructionCount: tx.instructions.length
        });
      } else {
        const signature = await stable.initializeTransferHookMetaListOnChain();
        writeJson({
          action: "init-hook",
          dryRun: false,
          mint: stable.getMintAddress().toBase58(),
          signature
        });
      }
      return;
    }
    case "mint": {
      const stable = await loadExistingStable();
      const destination = parseRequiredPublicKey(parsed.positionals[0], "DestinationTokenAccount");
      const amount = parseRequiredBigInt(parsed.positionals[1], "Amount");
      if (dryRun) {
        const tx = await stable.buildMintTransaction({ destination, amount, minter: authority });
        writeJson({
          action: "mint",
          dryRun,
          instructionCount: tx.instructions.length,
          amount: amount.toString(),
          destination: destination.toBase58()
        });
      } else {
        const signature = await stable.mintOnChain({ destination, amount, minter: authority });
        writeJson({
          action: "mint",
          dryRun: false,
          amount: amount.toString(),
          destination: destination.toBase58(),
          signature
        });
      }
      return;
    }
    case "burn": {
      const stable = await loadExistingStable();
      const source = parseRequiredPublicKey(parsed.positionals[0] ?? flagValue(parsed, "--from"), "SourceTokenAccount");
      const amount = parseRequiredBigInt(parsed.positionals[1] ?? flagValue(parsed, "--amount"), "Amount");
      if (dryRun) {
        const tx = await stable.buildBurnTransaction({ source, amount, burner: authority });
        writeJson({
          action: "burn",
          dryRun,
          instructionCount: tx.instructions.length,
          amount: amount.toString(),
          source: source.toBase58()
        });
      } else {
        const signature = await stable.burnOnChain({ source, amount, burner: authority });
        writeJson({
          action: "burn",
          dryRun: false,
          amount: amount.toString(),
          source: source.toBase58(),
          signature
        });
      }
      return;
    }
    case "pause":
    case "unpause": {
      const stable = await loadExistingStable();
      if (dryRun) {
        const tx = await stable.buildPauseTransaction(parsed.command === "pause");
        writeJson({
          action: parsed.command,
          dryRun,
          instructionCount: tx.instructions.length
        });
      } else {
        const signature = await stable.pauseOnChain(parsed.command === "pause");
        writeJson({
          action: parsed.command,
          dryRun: false,
          signature
        });
      }
      return;
    }
    case "freeze":
    case "thaw": {
      const stable = await loadExistingStable();
      const target = parseRequiredPublicKey(parsed.positionals[0], "Target");
      if (dryRun) {
        const tx = await stable.buildFreezeTransaction(target, parsed.command === "thaw");
        writeJson({
          action: parsed.command,
          dryRun,
          instructionCount: tx.instructions.length,
          target: target.toBase58()
        });
      } else {
        const signature = await stable.freezeOnChain(target, parsed.command === "thaw");
        writeJson({
          action: parsed.command,
          dryRun: false,
          target: target.toBase58(),
          signature
        });
      }
      return;
    }
    case "blacklist": {
      const stable = await loadExistingStable();
      const subcommand = parsed.positionals[0] ?? "list";
      const target = parsed.positionals[1];
      if (subcommand === "add" && target) {
        const address = parseRequiredPublicKey(target, "Target");
        const reason = flagValue(parsed, "--reason") ?? "";
        if (dryRun) {
          const tx = await stable.buildBlacklistAddTransaction({ address, reason });
          writeJson({
            action: "blacklist",
            subcommand,
            dryRun,
            instructionCount: tx.instructions.length,
            target,
            reason: reason || null
          });
        } else {
          const signature = await stable.blacklistAddOnChain({ address, reason });
          writeJson({
            action: "blacklist",
            subcommand,
            dryRun: false,
            target,
            reason: reason || null,
            signature
          });
        }
      } else if (subcommand === "remove") {
        const blacklistAddress = parseRequiredPublicKey(target, "Target");
        if (dryRun) {
          const tx = await stable.buildBlacklistRemoveTransaction(blacklistAddress);
          writeJson({
            action: "blacklist",
            subcommand,
            dryRun,
            instructionCount: tx.instructions.length,
            target: blacklistAddress.toBase58()
          });
        } else {
          const signature = await stable.blacklistRemoveOnChain(blacklistAddress);
          writeJson({
            action: "blacklist",
            subcommand,
            dryRun: false,
            target: blacklistAddress.toBase58(),
            signature
          });
        }
      } else if (subcommand === "list") {
        writeJson({
          action: "blacklist",
          subcommand,
          dryRun,
          entries: await listBlacklistEntries(stable)
        });
      } else {
        throw new Error(`UnknownBlacklistSubcommand:${subcommand}`);
      }
      return;
    }
    case "seize": {
      const stable = await loadExistingStable();
      const fromAccount = parseRequiredPublicKey(parsed.positionals[0], "FromAccount");
      const toFlag = flagValue(parsed, "--to");
      const toAccount = parseRequiredPublicKey(toFlag, "ToAccount");
      if (dryRun) {
        const tx = await stable.buildSeizeTransaction({ fromAccount, toAccount, seizer: authority });
        writeJson({
          action: "seize",
          dryRun,
          instructionCount: tx.instructions.length,
          fromAccount: fromAccount.toBase58(),
          toAccount: toAccount.toBase58()
        });
      } else {
        const signature = await stable.seizeOnChain({ fromAccount, toAccount, seizer: authority });
        writeJson({
          action: "seize",
          dryRun: false,
          fromAccount: fromAccount.toBase58(),
          toAccount: toAccount.toBase58(),
          signature
        });
      }
      return;
    }
    case "minters":
    case "roles": {
      const stable = await loadExistingStable();
      const subcommand = parsed.positionals[0] ?? "list";
      const fixedRole = parsed.command === "minters" ? "minter" : undefined;
      if (subcommand === "grant" || subcommand === "revoke") {
        const role = fixedRole ?? roleFromString(parsed.positionals[1]);
        const holderIndex = fixedRole ? 1 : 2;
        const holder = parseRequiredPublicKey(parsed.positionals[holderIndex], "Holder");
        const mintQuota = parseOptionalBigInt(flagValue(parsed, "--quota"), "Quota");
        if (role !== "minter" && mintQuota !== null) {
          throw new Error("QuotaOnlySupportedForMinters");
        }
        if (dryRun) {
          const tx = await stable.buildUpdateRoleTransaction({
            holder,
            role,
            isActive: subcommand === "grant",
            mintQuota
          });
          writeJson({
            action: parsed.command,
            subcommand,
            dryRun,
            role,
            holder: holder.toBase58(),
            quota: mintQuota?.toString() ?? null,
            instructionCount: tx.instructions.length
          });
        } else {
          const signature = await stable.updateRoleOnChain({
            holder,
            role,
            isActive: subcommand === "grant",
            mintQuota
          });
          writeJson({
            action: parsed.command,
            subcommand,
            dryRun: false,
            role,
            holder: holder.toBase58(),
            quota: mintQuota?.toString() ?? null,
            signature
          });
        }
      } else if (subcommand === "list") {
        const roleFilter = fixedRole ?? (flagValue(parsed, "--role") ? roleFromString(flagValue(parsed, "--role")) : undefined);
        const holderFilter = flagValue(parsed, "--holder");
        writeJson({
          action: parsed.command,
          subcommand,
          dryRun,
          entries: await listRoleAssignments(stable, {
            holder: holderFilter,
            role: roleFilter
          })
        });
      } else {
        throw new Error(`UnknownRoleSubcommand:${subcommand}`);
      }
      return;
    }
    case "authority": {
      const stable = await loadExistingStable();
      const subcommand = parsed.positionals[0] ?? "";
      if (subcommand === "propose") {
        const nextAuthority = parseRequiredPublicKey(parsed.positionals[1], "NextAuthority");
        if (dryRun) {
          const tx = await stable.buildAuthorityTransferTransaction(nextAuthority);
          writeJson({
            action: "authority",
            subcommand,
            dryRun,
            nextAuthority: nextAuthority.toBase58(),
            instructionCount: tx.instructions.length
          });
        } else {
          const signature = await sendInstruction(
            connection,
            authority,
            (await stable.buildAuthorityTransferTransaction(nextAuthority)).instructions[0]
          );
          writeJson({
            action: "authority",
            subcommand,
            dryRun: false,
            nextAuthority: nextAuthority.toBase58(),
            signature
          });
        }
      } else if (subcommand === "accept") {
        const instruction = buildInstruction(
          stable.getProgramId(),
          "accept_authority",
          encodeStablecoinInstruction("accept_authority", {}),
          [writable(stable.getConfigAddress()), writable(authority.publicKey, true)]
        );
        if (dryRun) {
          writeJson({
            action: "authority",
            subcommand,
            dryRun,
            acceptedBy: authority.publicKey.toBase58(),
            instructionCount: 1
          });
        } else {
          const signature = await sendInstruction(connection, authority, instruction);
          writeJson({
            action: "authority",
            subcommand,
            dryRun: false,
            acceptedBy: authority.publicKey.toBase58(),
            signature
          });
        }
      } else {
        throw new Error(`UnknownAuthoritySubcommand:${subcommand}`);
      }
      return;
    }
    case "compliance-root": {
      const stable = await loadExistingStable();
      const subcommand = parsed.positionals[0] ?? "";
      if (subcommand !== "update") {
        throw new Error(`UnknownComplianceRootSubcommand:${subcommand}`);
      }
      const root = requirePositional(parsed.positionals[1] ?? flagValue(parsed, "--root"), "ComplianceRoot");
      if (dryRun) {
        const tx = await stable.buildUpdateComplianceRootTransaction(root);
        writeJson({
          action: "compliance-root",
          subcommand,
          dryRun,
          root,
          instructionCount: tx.instructions.length
        });
      } else {
        const signature = await stable.updateComplianceRootOnChain(root);
        writeJson({
          action: "compliance-root",
          subcommand,
          dryRun: false,
          root,
          signature
        });
      }
      return;
    }
    case "proof": {
      const stable = await loadExistingStable();
      const subcommand = parsed.positionals[0] ?? "list";
      if (subcommand === "submit") {
        const subject = parseRequiredPublicKey(parsed.positionals[1] ?? flagValue(parsed, "--subject"), "Subject");
        const commitment = parseHexBytes(flagValue(parsed, "--commitment"), "Commitment", 32);
        const proofCommitment = parseHexBytes(flagValue(parsed, "--proof-commitment"), "ProofCommitment", 32);
        const response = parseHexBytes(flagValue(parsed, "--response"), "Response", 32);
        const circuit = requirePositional(flagValue(parsed, "--circuit"), "Circuit");
        const expiresAtSlot = parseRequiredBigInt(flagValue(parsed, "--expires-at-slot"), "ExpiresAtSlot");
        const merkleSiblings = parseCsvHexBytes(flagValue(parsed, "--merkle-siblings"), "MerkleSiblings", 32);
        const merkleDirections = parseCsvIntegers(flagValue(parsed, "--merkle-directions"), "MerkleDirections");
        if (merkleSiblings.length !== merkleDirections.length) {
          throw new Error("MerkleInputsLengthMismatch");
        }
        if (dryRun) {
          const tx = await stable.buildSubmitProofReceiptTransaction({
            subject,
            commitment,
            proofCommitment,
            response,
            merkleSiblings,
            merkleDirections,
            circuit,
            expiresAtSlot
          });
          writeJson({
            action: "proof",
            subcommand,
            dryRun,
            subject: subject.toBase58(),
            circuit,
            expiresAtSlot: expiresAtSlot.toString(),
            instructionCount: tx.instructions.length
          });
        } else {
          const signature = await stable.submitProofReceiptOnChain({
            subject,
            commitment,
            proofCommitment,
            response,
            merkleSiblings,
            merkleDirections,
            circuit,
            expiresAtSlot
          });
          writeJson({
            action: "proof",
            subcommand,
            dryRun: false,
            subject: subject.toBase58(),
            circuit,
            expiresAtSlot: expiresAtSlot.toString(),
            signature
          });
        }
      } else if (subcommand === "revoke") {
        const subject = parseRequiredPublicKey(parsed.positionals[1] ?? flagValue(parsed, "--subject"), "Subject");
        if (dryRun) {
          const tx = await stable.buildRevokeProofReceiptTransaction(subject);
          writeJson({
            action: "proof",
            subcommand,
            dryRun,
            subject: subject.toBase58(),
            instructionCount: tx.instructions.length
          });
        } else {
          const signature = await stable.revokeProofReceiptOnChain(subject);
          writeJson({
            action: "proof",
            subcommand,
            dryRun: false,
            subject: subject.toBase58(),
            signature
          });
        }
      } else if (subcommand === "list") {
        const subject = flagValue(parsed, "--subject");
        writeJson({
          action: "proof",
          subcommand,
          dryRun,
          entries: await listProofReceipts(stable, subject)
        });
      } else {
        throw new Error(`UnknownProofSubcommand:${subcommand}`);
      }
      return;
    }
    case "holders": {
      const stable = await loadExistingStable();
      const minBalance = parseOptionalBigInt(flagValue(parsed, "--min-balance"), "MinBalance");
      writeJson({
        action: "holders",
        dryRun,
        minBalance: minBalance?.toString() ?? null,
        holders: await listHolders(connection, stable.getMintAddress(), minBalance)
      });
      return;
    }
    case "audit-log": {
      const stable = await loadExistingStable();
      const limit = parseOptionalInteger(flagValue(parsed, "--limit"), "Limit", 20);
      const action = flagValue(parsed, "--action");
      writeJson({
        action: "audit-log",
        dryRun,
        filter: action ?? null,
        limit,
        entries: await readAuditLog(stable, limit, action)
      });
      return;
    }
    case "registry": {
      const stable = await loadExistingStable();
      writeJson(await stable.getRegistryEntry());
      return;
    }
    case "registry-init": {
      const instruction = buildInitializeRegistryInstruction(
        authority.publicKey,
        requireRegistryProgramId(registryProgramId)
      );
      if (dryRun) {
        writeJson({
          action: "registry-init",
          dryRun,
          authority: authority.publicKey.toBase58(),
          instructionCount: 1,
          keyCount: instruction.keys.length
        });
      } else {
        const signature = await sendInstruction(connection, authority, instruction);
        writeJson({
          action: "registry-init",
          dryRun: false,
          authority: authority.publicKey.toBase58(),
          signature
        });
      }
      return;
    }
    case "registry-register": {
      const stable = await loadExistingStable();
      const entry = await stable.getRegistryEntry();
      const instruction = buildRegisterStablecoinInstruction({
        stablecoinProgramId: stable.getProgramId(),
        entry
      }, requireRegistryProgramId(registryProgramId));
      if (dryRun) {
        writeJson({
          action: "registry-register",
          dryRun,
          mint: entry.mint,
          preset: entry.preset,
          standardVersion: entry.standardVersion,
          configHash: entry.configHash,
          instructionCount: 1,
          keyCount: instruction.keys.length
        });
      } else {
        const signature = await sendInstruction(connection, authority, instruction);
        writeJson({
          action: "registry-register",
          dryRun: false,
          mint: entry.mint,
          signature
        });
      }
      return;
    }
    case "registry-release": {
      const connectedConfig = mintFlag ? await (await loadExistingStable()).getConfig() : null;
      const standardVersion = flagValue(parsed, "--standard-version") ?? normalized.standardVersion;
      const notesUri = flagValue(parsed, "--notes-uri") ?? "";
      const replacementVersion = flagValue(parsed, "--replacement-version") ?? null;
      const schemaHash = flagValue(parsed, "--schema-hash")
        ?? connectedConfig?.configHash;
      const preset = connectedConfig?.preset ?? normalized.preset;
      if (!schemaHash) {
        throw new Error("MissingSchemaHash");
      }
      const instruction = buildRegisterReleaseInstruction({
        authority: authority.publicKey,
        standardVersion,
        preset,
        schemaHash,
        notesUri,
        replacementVersion,
        deprecated: hasFlag(parsed, "--deprecated")
      }, requireRegistryProgramId(registryProgramId));
      if (dryRun) {
        writeJson({
          action: "registry-release",
          dryRun,
          standardVersion,
          preset,
          schemaHash,
          replacementVersion,
          deprecated: hasFlag(parsed, "--deprecated"),
          instructionCount: 1,
          keyCount: instruction.keys.length
        });
      } else {
        const signature = await sendInstruction(connection, authority, instruction);
        writeJson({
          action: "registry-release",
          dryRun: false,
          standardVersion,
          preset,
          signature
        });
      }
      return;
    }
    case "registry-deprecate": {
      const standardVersion = requirePositional(
        parsed.positionals[0] ?? flagValue(parsed, "--standard-version"),
        "StandardVersion"
      );
      const replacementVersion = flagValue(parsed, "--replacement-version") ?? undefined;
      const instruction = buildDeprecateReleaseInstruction(
        authority.publicKey,
        standardVersion,
        replacementVersion,
        requireRegistryProgramId(registryProgramId)
      );
      if (dryRun) {
        writeJson({
          action: "registry-deprecate",
          dryRun,
          standardVersion,
          replacementVersion: replacementVersion ?? null,
          instructionCount: 1,
          keyCount: instruction.keys.length
        });
      } else {
        const signature = await sendInstruction(connection, authority, instruction);
        writeJson({
          action: "registry-deprecate",
          dryRun: false,
          standardVersion,
          replacementVersion: replacementVersion ?? null,
          signature
        });
      }
      return;
    }
    case "status": {
      const stable = await loadExistingStable();
      const config = await stable.getConfig();
      const supply = await connection.getTokenSupply(stable.getMintAddress(), "confirmed");
      writeJson({
        mint: stable.getMintAddress().toBase58(),
        config: stable.getConfigAddress().toBase58(),
        authority: config.authority,
        preset: config.preset,
        standardVersion: config.standardVersion,
        configHash: config.configHash,
        paused: config.isPaused,
        decimals: config.decimals,
        supply: supply.value.amount,
        uiSupply: supply.value.uiAmountString,
        transferHookProgramId: config.transferHookProgramId,
        proofVerifierProgramId: config.proofVerifierProgramId,
        enablePermanentDelegate: config.enablePermanentDelegate,
        enableTransferHook: config.enableTransferHook,
        defaultAccountFrozen: config.defaultAccountFrozen,
        enableConfidentialTransfers: config.enableConfidentialTransfers,
        enableZkComplianceProofs: config.enableZkComplianceProofs,
        enableCompressedComplianceState: config.enableCompressedComplianceState,
        complianceCircuit: config.complianceCircuit,
        compressedComplianceRoot: config.compressedComplianceRoot
      });
      return;
    }
    default:
      writeError(`Unknown command: ${parsed.command}`);
      process.exitCode = 1;
  }
}

void main().catch((error) => {
  writeError(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
