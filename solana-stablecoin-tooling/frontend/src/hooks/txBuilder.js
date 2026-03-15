import {
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
} from '@solana/web3.js';
import {
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import { sha256 } from '@noble/hashes/sha256';
import { STABLECOIN_PROGRAM_ID, findConfigPDA, findRolePDA, findBlacklistPDA } from '../config';

// Anchor discriminator: sha256("global:<instruction_name>")[0..8]
function disc(name) {
  const data = new TextEncoder().encode(`global:${name}`);
  const hash = sha256(data);
  return Buffer.from(hash.slice(0, 8));
}

function encodeU64(value) {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(BigInt(value));
  return buf;
}

function encodeU8(value) {
  return Buffer.from([value]);
}

// ═══════════════════════════════════════════════════════════════
// mintTokens: minter(signer), config, roleAssignment, mint, destination, tokenProgram
// ═══════════════════════════════════════════════════════════════
export async function buildMintTx(connection, payer, mint, destination, amount, decimals) {
  const [configPDA] = findConfigPDA(mint);
  const [rolePDA] = findRolePDA(configPDA, payer);
  const ata = getAssociatedTokenAddressSync(mint, destination, false, TOKEN_2022_PROGRAM_ID);
  const ataInfo = await connection.getAccountInfo(ata);

  const instructions = [];
  if (!ataInfo) {
    instructions.push(
      createAssociatedTokenAccountInstruction(payer, ata, destination, mint, TOKEN_2022_PROGRAM_ID)
    );
  }

  const rawAmount = BigInt(Math.round(amount)) * BigInt(10) ** BigInt(decimals);
  const data = Buffer.concat([disc('mint_tokens'), encodeU64(rawAmount)]);

  instructions.push({
    programId: STABLECOIN_PROGRAM_ID,
    keys: [
      { pubkey: payer, isSigner: true, isWritable: true },             // minter
      { pubkey: configPDA, isSigner: false, isWritable: true },        // config
      { pubkey: rolePDA, isSigner: false, isWritable: true },          // roleAssignment
      { pubkey: mint, isSigner: false, isWritable: true },             // mint
      { pubkey: ata, isSigner: false, isWritable: true },              // destination
      { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false }, // tokenProgram
    ],
    data,
  });

  const blockhash = await connection.getLatestBlockhash();
  const msg = new TransactionMessage({
    payerKey: payer, recentBlockhash: blockhash.blockhash, instructions,
  }).compileToV0Message();

  return { tx: new VersionedTransaction(msg), blockhash };
}

// ═══════════════════════════════════════════════════════════════
// burnTokens: burner(signer), config, roleAssignment, mint, source, sourceAuthority, tokenProgram
// ═══════════════════════════════════════════════════════════════
export async function buildBurnTx(connection, payer, mint, amount, decimals) {
  const [configPDA] = findConfigPDA(mint);
  const [rolePDA] = findRolePDA(configPDA, payer);
  const ata = getAssociatedTokenAddressSync(mint, payer, false, TOKEN_2022_PROGRAM_ID);

  const rawAmount = BigInt(Math.round(amount)) * BigInt(10) ** BigInt(decimals);
  const data = Buffer.concat([disc('burn_tokens'), encodeU64(rawAmount)]);

  const instructions = [{
    programId: STABLECOIN_PROGRAM_ID,
    keys: [
      { pubkey: payer, isSigner: true, isWritable: true },             // burner
      { pubkey: configPDA, isSigner: false, isWritable: true },        // config
      { pubkey: rolePDA, isSigner: false, isWritable: false },         // roleAssignment
      { pubkey: mint, isSigner: false, isWritable: true },             // mint
      { pubkey: ata, isSigner: false, isWritable: true },              // source
      { pubkey: payer, isSigner: false, isWritable: false },           // sourceAuthority
      { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false }, // tokenProgram
    ],
    data,
  }];

  const blockhash = await connection.getLatestBlockhash();
  const msg = new TransactionMessage({
    payerKey: payer, recentBlockhash: blockhash.blockhash, instructions,
  }).compileToV0Message();

  return { tx: new VersionedTransaction(msg), blockhash };
}

// ═══════════════════════════════════════════════════════════════
// freezeAccount: authority(signer), config, roleAssignment, mint, tokenAccount, tokenProgram
// ═══════════════════════════════════════════════════════════════
export async function buildFreezeTx(connection, payer, mint, targetOwner) {
  const [configPDA] = findConfigPDA(mint);
  const [rolePDA] = findRolePDA(configPDA, payer);
  const targetAta = getAssociatedTokenAddressSync(mint, targetOwner, false, TOKEN_2022_PROGRAM_ID);

  const instructions = [{
    programId: STABLECOIN_PROGRAM_ID,
    keys: [
      { pubkey: payer, isSigner: true, isWritable: true },             // authority
      { pubkey: configPDA, isSigner: false, isWritable: false },       // config
      { pubkey: rolePDA, isSigner: false, isWritable: false },         // roleAssignment
      { pubkey: mint, isSigner: false, isWritable: false },            // mint
      { pubkey: targetAta, isSigner: false, isWritable: true },        // tokenAccount
      { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false }, // tokenProgram
    ],
    data: disc('freeze_account'),
  }];

  const blockhash = await connection.getLatestBlockhash();
  const msg = new TransactionMessage({
    payerKey: payer, recentBlockhash: blockhash.blockhash, instructions,
  }).compileToV0Message();

  return { tx: new VersionedTransaction(msg), blockhash };
}

// ═══════════════════════════════════════════════════════════════
// thawAccount: authority(signer), config, roleAssignment, mint, tokenAccount, tokenProgram
// ═══════════════════════════════════════════════════════════════
export async function buildThawTx(connection, payer, mint, targetOwner) {
  const [configPDA] = findConfigPDA(mint);
  const [rolePDA] = findRolePDA(configPDA, payer);
  const targetAta = getAssociatedTokenAddressSync(mint, targetOwner, false, TOKEN_2022_PROGRAM_ID);

  const instructions = [{
    programId: STABLECOIN_PROGRAM_ID,
    keys: [
      { pubkey: payer, isSigner: true, isWritable: true },             // authority
      { pubkey: configPDA, isSigner: false, isWritable: false },       // config
      { pubkey: rolePDA, isSigner: false, isWritable: false },         // roleAssignment
      { pubkey: mint, isSigner: false, isWritable: false },            // mint
      { pubkey: targetAta, isSigner: false, isWritable: true },        // tokenAccount
      { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false }, // tokenProgram
    ],
    data: disc('thaw_account'),
  }];

  const blockhash = await connection.getLatestBlockhash();
  const msg = new TransactionMessage({
    payerKey: payer, recentBlockhash: blockhash.blockhash, instructions,
  }).compileToV0Message();

  return { tx: new VersionedTransaction(msg), blockhash };
}

// ═══════════════════════════════════════════════════════════════
// pause: authority(signer), config, roleAssignment
// ═══════════════════════════════════════════════════════════════
export async function buildPauseTx(connection, payer, mint) {
  const [configPDA] = findConfigPDA(mint);
  const [rolePDA] = findRolePDA(configPDA, payer);

  const instructions = [{
    programId: STABLECOIN_PROGRAM_ID,
    keys: [
      { pubkey: payer, isSigner: true, isWritable: true },             // authority
      { pubkey: configPDA, isSigner: false, isWritable: true },        // config
      { pubkey: rolePDA, isSigner: false, isWritable: false },         // roleAssignment
    ],
    data: disc('pause'),
  }];

  const blockhash = await connection.getLatestBlockhash();
  const msg = new TransactionMessage({
    payerKey: payer, recentBlockhash: blockhash.blockhash, instructions,
  }).compileToV0Message();

  return { tx: new VersionedTransaction(msg), blockhash };
}

// ═══════════════════════════════════════════════════════════════
// unpause: authority(signer), config
// ═══════════════════════════════════════════════════════════════
export async function buildUnpauseTx(connection, payer, mint) {
  const [configPDA] = findConfigPDA(mint);

  const instructions = [{
    programId: STABLECOIN_PROGRAM_ID,
    keys: [
      { pubkey: payer, isSigner: true, isWritable: true },             // authority
      { pubkey: configPDA, isSigner: false, isWritable: true },        // config
    ],
    data: disc('unpause'),
  }];

  const blockhash = await connection.getLatestBlockhash();
  const msg = new TransactionMessage({
    payerKey: payer, recentBlockhash: blockhash.blockhash, instructions,
  }).compileToV0Message();

  return { tx: new VersionedTransaction(msg), blockhash };
}

// ═══════════════════════════════════════════════════════════════
// manageRole: authority(signer), config, roleHolder, roleAssignment, systemProgram
// IDL args: ManageRoleParams { role: Role(enum), action: RoleAction(enum), mintQuota: Option<u64> }
// Role enum: Minter=0, Burner=1, Pauser=2, Blacklister=3, Seizer=4
// RoleAction enum: Grant=0, Revoke=1
// ═══════════════════════════════════════════════════════════════

// Map bitmask values to Role enum indices
// ROLES config: Minter:1, Burner:2, Pauser:4, Blacklister:8, Seizer:16
const BITMASK_TO_ENUM = { 1: 0, 2: 1, 4: 2, 8: 3, 16: 4 };

export async function buildGrantRoleTx(connection, payer, mint, targetUser, roleMask, quota) {
  const [configPDA] = findConfigPDA(mint);
  const [rolePDA] = findRolePDA(configPDA, targetUser);

  const keys = [
    { pubkey: payer, isSigner: true, isWritable: true },             // authority
    { pubkey: configPDA, isSigner: false, isWritable: false },       // config
    { pubkey: targetUser, isSigner: false, isWritable: false },      // roleHolder
    { pubkey: rolePDA, isSigner: false, isWritable: true },          // roleAssignment
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // systemProgram
  ];

  // One instruction per selected role
  const instructions = [];
  for (const [bitVal, enumIdx] of Object.entries(BITMASK_TO_ENUM)) {
    if (!(roleMask & parseInt(bitVal))) continue;
    // ManageRoleParams: role(u8 enum), action(u8: 0=Grant), mintQuota(Option<u64>)
    const quotaParts = enumIdx === 0
      ? [Buffer.from([1]), encodeU64(quota)]   // Minter gets Some(quota)
      : [Buffer.from([0])];                    // Others get None
    const data = Buffer.concat([disc('manage_role'), encodeU8(enumIdx), encodeU8(0), ...quotaParts]);
    instructions.push({ programId: STABLECOIN_PROGRAM_ID, keys, data });
  }

  if (instructions.length === 0) throw new Error('No roles selected');

  const blockhash = await connection.getLatestBlockhash();
  const msg = new TransactionMessage({
    payerKey: payer, recentBlockhash: blockhash.blockhash, instructions,
  }).compileToV0Message();

  return { tx: new VersionedTransaction(msg), blockhash };
}

export async function buildRevokeRoleTx(connection, payer, mint, targetUser, roleMask) {
  const [configPDA] = findConfigPDA(mint);
  const [rolePDA] = findRolePDA(configPDA, targetUser);

  const keys = [
    { pubkey: payer, isSigner: true, isWritable: true },             // authority
    { pubkey: configPDA, isSigner: false, isWritable: false },       // config
    { pubkey: targetUser, isSigner: false, isWritable: false },      // roleHolder
    { pubkey: rolePDA, isSigner: false, isWritable: true },          // roleAssignment
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // systemProgram
  ];

  const instructions = [];
  for (const [bitVal, enumIdx] of Object.entries(BITMASK_TO_ENUM)) {
    if (!(roleMask & parseInt(bitVal))) continue;
    // ManageRoleParams: role(u8 enum), action(u8: 1=Revoke), mintQuota(None)
    const data = Buffer.concat([disc('manage_role'), encodeU8(enumIdx), encodeU8(1), Buffer.from([0])]);
    instructions.push({ programId: STABLECOIN_PROGRAM_ID, keys, data });
  }

  if (instructions.length === 0) throw new Error('No roles selected');

  const blockhash = await connection.getLatestBlockhash();
  const msg = new TransactionMessage({
    payerKey: payer, recentBlockhash: blockhash.blockhash, instructions,
  }).compileToV0Message();

  return { tx: new VersionedTransaction(msg), blockhash };
}

// ═══════════════════════════════════════════════════════════════
// addToBlacklist: blacklister(signer), config, roleAssignment, blacklistEntry, systemProgram
// ═══════════════════════════════════════════════════════════════
export async function buildBlacklistAddTx(connection, payer, mint, targetUser) {
  const [configPDA] = findConfigPDA(mint);
  const [rolePDA] = findRolePDA(configPDA, payer);
  const [blacklistPDA] = findBlacklistPDA(mint, targetUser);

  const instructions = [{
    programId: STABLECOIN_PROGRAM_ID,
    keys: [
      { pubkey: payer, isSigner: true, isWritable: true },             // blacklister
      { pubkey: configPDA, isSigner: false, isWritable: false },       // config
      { pubkey: rolePDA, isSigner: false, isWritable: false },         // roleAssignment
      { pubkey: blacklistPDA, isSigner: false, isWritable: true },     // blacklistEntry
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // systemProgram
    ],
    data: disc('add_to_blacklist'),
  }];

  const blockhash = await connection.getLatestBlockhash();
  const msg = new TransactionMessage({
    payerKey: payer, recentBlockhash: blockhash.blockhash, instructions,
  }).compileToV0Message();

  return { tx: new VersionedTransaction(msg), blockhash };
}

// ═══════════════════════════════════════════════════════════════
// removeFromBlacklist: blacklister(signer), config, roleAssignment, blacklistEntry
// ═══════════════════════════════════════════════════════════════
export async function buildBlacklistRemoveTx(connection, payer, mint, targetUser) {
  const [configPDA] = findConfigPDA(mint);
  const [rolePDA] = findRolePDA(configPDA, payer);
  const [blacklistPDA] = findBlacklistPDA(mint, targetUser);

  const instructions = [{
    programId: STABLECOIN_PROGRAM_ID,
    keys: [
      { pubkey: payer, isSigner: true, isWritable: true },             // blacklister
      { pubkey: configPDA, isSigner: false, isWritable: true },        // config
      { pubkey: rolePDA, isSigner: false, isWritable: false },         // roleAssignment
      { pubkey: blacklistPDA, isSigner: false, isWritable: true },     // blacklistEntry
    ],
    data: disc('remove_from_blacklist'),
  }];

  const blockhash = await connection.getLatestBlockhash();
  const msg = new TransactionMessage({
    payerKey: payer, recentBlockhash: blockhash.blockhash, instructions,
  }).compileToV0Message();

  return { tx: new VersionedTransaction(msg), blockhash };
}
