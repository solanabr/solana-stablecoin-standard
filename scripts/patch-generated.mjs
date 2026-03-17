#!/usr/bin/env node
/**
 * Patches Codama-generated SDK code for known renderer issues.
 * Run after scripts/generate-sdks.mjs.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

function loadProgramIds() {
  const path = resolve(ROOT, "tests/devnet/fixtures/program-ids.json");
  return JSON.parse(readFileSync(path, "utf8"));
}

// --- generated-kit: transfer-hook naming conflicts ---
const kitTransferHookInstructions = resolve(
  ROOT,
  "sdk/generated-kit/src/transfer-hook/instructions/transferHook.ts",
);
const kitTransferHookPrograms = resolve(
  ROOT,
  "sdk/generated-kit/src/transfer-hook/programs/transferHook.ts",
);

function patchKitTransferHook() {
  let content = readFileSync(kitTransferHookInstructions, "utf8");

  // Rename to avoid conflict with programs' union type and enum
  content = content.replace(
    /export type TransferHookInstruction</g,
    "export type TransferHookInstructionItem<",
  );
  content = content.replace(
    /: TransferHookInstruction</g,
    ": TransferHookInstructionItem<",
  );
  content = content.replace(
    /as TransferHookInstruction</g,
    "as TransferHookInstructionItem<",
  );
  content = content.replace(
    /export type ParsedTransferHookInstruction</g,
    "export type ParsedTransferHookInstructionItem<",
  );
  content = content.replace(
    /export function parseTransferHookInstruction</g,
    "export function parseTransferHookInstructionItem<",
  );
  content = content.replace(
    /: ParsedTransferHookInstruction</g,
    ": ParsedTransferHookInstructionItem<",
  );
  content = content.replace(
    /Promise<\s*TransferHookInstruction</g,
    "Promise<\n  TransferHookInstructionItem<",
  );

  writeFileSync(kitTransferHookInstructions, content);

  content = readFileSync(kitTransferHookPrograms, "utf8");

  // Use renamed imports (instructions exports *Item to avoid conflict)
  content = content.replace(
    /parseTransferHookInstruction,\s*\n\s*type/,
    "parseTransferHookInstructionItem,\n  type",
  );
  content = content.replace(
    /type ParsedTransferHookInstruction,\s*\n\s*type TransferHookAsyncInput/,
    "type ParsedTransferHookInstructionItem,\n  type TransferHookAsyncInput",
  );

  content = content.replace(
    `  | ({
      instructionType: TransferHookInstruction.TransferHook;
    } & ParsedTransferHookInstruction<TProgram>);`,
    `  | ({
      instructionType: TransferHookInstruction.TransferHook;
    } & ParsedTransferHookInstructionItem<TProgram>);`,
  );

  content = content.replace(
    `    case TransferHookInstruction.TransferHook: {
      assertIsInstructionWithAccounts(instruction);
      return {
        instructionType: TransferHookInstruction.TransferHook,
        ...parseTransferHookInstruction(instruction),
      };
    }`,
    `    case TransferHookInstruction.TransferHook: {
      assertIsInstructionWithAccounts(instruction);
      return {
        instructionType: TransferHookInstruction.TransferHook,
        ...parseTransferHookInstructionItem(instruction),
      };
    }`,
  );

  writeFileSync(kitTransferHookPrograms, content);
}

// --- generated-web3js: minterQuota PDA seeds (authority vs minter) ---
const web3jsMinterQuotaPda = resolve(
  ROOT,
  "sdk/generated-web3js/src/stablecoin/pdas/minterQuota.ts",
);
const web3jsUpdateMinter = resolve(
  ROOT,
  "sdk/generated-web3js/src/stablecoin/instructions/updateMinter.ts",
);
const web3jsMint = resolve(
  ROOT,
  "sdk/generated-web3js/src/stablecoin/instructions/mint.ts",
);

function patchWeb3jsMinterQuota() {
  // MinterQuotaPdaSeeds: use 'minter' (update_minter uses minter account)
  // mint instruction passes authority (which is the minter)
  let content = readFileSync(web3jsMinterQuotaPda, "utf8");
  content = content.replace(
    "export interface MinterQuotaPdaSeeds {\n  mint: PublicKey;\n  authority: PublicKey;\n}",
    "export interface MinterQuotaPdaSeeds {\n  mint: PublicKey;\n  minter: PublicKey;\n}",
  );
  content = content.replace(
    "seeds.authority.toBuffer()",
    "seeds.minter.toBuffer()",
  );
  writeFileSync(web3jsMinterQuotaPda, content);

  // updateMinter already passes minter - no change needed

  // mint passes authority as the minter
  content = readFileSync(web3jsMint, "utf8");
  content = content.replace(
    `findMinterQuotaPda(
      {
        mint: accounts.mint,
        authority: accounts.authority,
      },
      programId,
    )`,
    `findMinterQuotaPda(
      {
        mint: accounts.mint,
        minter: accounts.authority,
      },
      programId,
    )`,
  );
  writeFileSync(web3jsMint, content);
}

function patchWeb3jsInitializeAccountOrder() {
  const web3jsInitialize = resolve(
    ROOT,
    "sdk/generated-web3js/src/stablecoin/instructions/initialize.ts",
  );
  let content = readFileSync(web3jsInitialize, "utf8");

  const oldOrder = `  const keys: AccountMeta[] = [
    { pubkey: accounts.authority, isSigner: true, isWritable: true },
    { pubkey: accounts.mint, isSigner: true, isWritable: true },
    { pubkey: config, isSigner: false, isWritable: true },
    { pubkey: roleConfig, isSigner: false, isWritable: true },
    { pubkey: accounts.tokenProgram, isSigner: false, isWritable: false },
    { pubkey: accounts.systemProgram, isSigner: false, isWritable: false },
    { pubkey: accounts.rent, isSigner: false, isWritable: false },
    { pubkey: eventAuthority, isSigner: false, isWritable: false },
    { pubkey: accounts.program, isSigner: false, isWritable: false },
    ...(accounts.extraAccountMetaList
      ? [
          {
            pubkey: accounts.extraAccountMetaList,
            isSigner: false,
            isWritable: true,
          },
        ]
      : []),
    ...(accounts.transferHookProgram
      ? [
          {
            pubkey: accounts.transferHookProgram,
            isSigner: false,
            isWritable: false,
          },
        ]
      : []),
  ];`;

  const newOrder = `  const keys: AccountMeta[] = [
    { pubkey: accounts.authority, isSigner: true, isWritable: true },
    { pubkey: accounts.mint, isSigner: true, isWritable: true },
    { pubkey: config, isSigner: false, isWritable: true },
    { pubkey: roleConfig, isSigner: false, isWritable: true },
    ...(accounts.extraAccountMetaList
      ? [
          {
            pubkey: accounts.extraAccountMetaList,
            isSigner: false,
            isWritable: true,
          },
        ]
      : []),
    ...(accounts.transferHookProgram
      ? [
          {
            pubkey: accounts.transferHookProgram,
            isSigner: false,
            isWritable: false,
          },
        ]
      : []),
    { pubkey: accounts.tokenProgram, isSigner: false, isWritable: false },
    { pubkey: accounts.systemProgram, isSigner: false, isWritable: false },
    { pubkey: accounts.rent, isSigner: false, isWritable: false },
    { pubkey: eventAuthority, isSigner: false, isWritable: false },
    { pubkey: accounts.program, isSigner: false, isWritable: false },
  ];`;

  content = content.replace(oldOrder, newOrder);
  writeFileSync(web3jsInitialize, content);
}

function patchProgramIds() {
  const ids = loadProgramIds();

  // --- generated-web3js ---
  const stablecoinIndex = resolve(
    ROOT,
    "sdk/generated-web3js/src/stablecoin/index.ts",
  );
  const transferHookIndex = resolve(
    ROOT,
    "sdk/generated-web3js/src/transfer-hook/index.ts",
  );

  let content = readFileSync(stablecoinIndex, "utf8");
  content = content.replace(
    /(STABLECOIN_PROGRAM_ID = new PublicKey\(\s*\n\s*)"[^"]+"/,
    `$1"${ids.stablecoinProgramId}"`,
  );
  writeFileSync(stablecoinIndex, content);

  content = readFileSync(transferHookIndex, "utf8");
  content = content.replace(
    /(TRANSFERHOOK_PROGRAM_ID = new PublicKey\(\s*\n\s*)"[^"]+"/,
    `$1"${ids.transferHookProgramId}"`,
  );
  writeFileSync(transferHookIndex, content);

  // --- generated-kit ---
  const kitStablecoinPrograms = resolve(
    ROOT,
    "sdk/generated-kit/src/stablecoin/programs/stablecoin.ts",
  );
  const kitTransferHookPrograms = resolve(
    ROOT,
    "sdk/generated-kit/src/transfer-hook/programs/transferHook.ts",
  );

  content = readFileSync(kitStablecoinPrograms, "utf8");
  content = content.replace(
    /"2MKyZ3ugkGyfConZAsqm3hwRoY6c2k7zwZaX1XCSHsJH"/g,
    `"${ids.stablecoinProgramId}"`,
  );
  writeFileSync(kitStablecoinPrograms, content);

  content = readFileSync(kitTransferHookPrograms, "utf8");
  content = content.replace(
    /"6mjTtZjRFK8FWA24f2KNEfMVcAvpYLWcpMzLvKiVXyd2"/g,
    `"${ids.transferHookProgramId}"`,
  );
  writeFileSync(kitTransferHookPrograms, content);

  // --- generated-kit seize.ts (hardcoded stablecoin default) ---
  const kitSeize = resolve(
    ROOT,
    "sdk/generated-kit/src/stablecoin/instructions/seize.ts",
  );
  content = readFileSync(kitSeize, "utf8");
  content = content.replace(
    /"2MKyZ3ugkGyfConZAsqm3hwRoY6c2k7zwZaX1XCSHsJH"/g,
    `"${ids.stablecoinProgramId}"`,
  );
  writeFileSync(kitSeize, content);

  // --- Rust: stablecoin_client, stablecoin_decoder ---
  const stablecoinClientPrograms = resolve(
    ROOT,
    "backend/crates/stablecoin_client/src/generated/programs.rs",
  );
  const stablecoinDecoder = resolve(
    ROOT,
    "backend/crates/stablecoin_decoder/src/lib.rs",
  );

  content = readFileSync(stablecoinClientPrograms, "utf8");
  content = content.replace(
    /address!\("2MKyZ3ugkGyfConZAsqm3hwRoY6c2k7zwZaX1XCSHsJH"\)/,
    `address!("${ids.stablecoinProgramId}")`,
  );
  writeFileSync(stablecoinClientPrograms, content);

  content = readFileSync(stablecoinDecoder, "utf8");
  content = content.replace(
    /from_str_const\("2MKyZ3ugkGyfConZAsqm3hwRoY6c2k7zwZaX1XCSHsJH"\)/,
    `from_str_const("${ids.stablecoinProgramId}")`,
  );
  writeFileSync(stablecoinDecoder, content);

  // --- Rust: stablecoin_client seize instruction default ---
  const seizeRs = resolve(
    ROOT,
    "backend/crates/stablecoin_client/src/generated/instructions/seize.rs",
  );
  content = readFileSync(seizeRs, "utf8");
  content = content.replace(
    /"2MKyZ3ugkGyfConZAsqm3hwRoY6c2k7zwZaX1XCSHsJH"/g,
    `"${ids.stablecoinProgramId}"`,
  );
  writeFileSync(seizeRs, content);
}

patchKitTransferHook();
patchWeb3jsMinterQuota();
patchWeb3jsInitializeAccountOrder();
patchProgramIds();
console.log("Patches applied.");
