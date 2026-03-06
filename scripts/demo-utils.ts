import { createHash } from "crypto";
import { readFileSync } from "fs";
import * as borsh from "@coral-xyz/borsh";
import { AnchorProvider, Wallet } from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  PublicKey,
  Signer,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";

export const SSS_STABLECOIN_PROGRAM_ID = new PublicKey(
  process.env.SSS_STABLECOIN_PROGRAM_ID ?? "AmBgA4sV1xFrT4BwbqUU3P3cFqLa6yNJmHyX98k4eW1j",
);
export const SSS_TRANSFER_HOOK_PROGRAM_ID = new PublicKey(
  process.env.SSS_TRANSFER_HOOK_PROGRAM_ID ?? "GRx8C8nakzmZpHXi3cHbq2X3n8uCX56V6SSNRFY6EJ97",
);

const initializeLayout = borsh.struct([
  borsh.str("name"),
  borsh.str("symbol"),
  borsh.u8("decimals"),
  borsh.bool("enablePermanentDelegate"),
  borsh.bool("enableTransferHook"),
  borsh.bool("defaultAccountFrozen"),
  borsh.bool("enablePrivacy"),
]);

const updateMinterLayout = borsh.struct([borsh.publicKey("address")]);
const updateRolesLayout = borsh.struct([borsh.u8("roleType"), borsh.publicKey("address"), borsh.u8("action")]);
const addToBlacklistLayout = borsh.struct([borsh.publicKey("address"), borsh.str("reason")]);

function discriminator(name: string): Buffer {
  return createHash("sha256").update(`global:${name}`).digest().subarray(0, 8);
}

function encodeWithLayout(layout: borsh.Layout<unknown>, payload: object): Buffer {
  const buffer = Buffer.alloc(1024);
  const size = layout.encode(payload, buffer);
  return buffer.subarray(0, size);
}

export function loadProvider(): { provider: AnchorProvider; walletKeypair: Keypair } {
  const rpcUrl = process.env.SOLANA_RPC_URL ?? "http://localhost:8899";
  const walletPath = process.env.ANCHOR_WALLET ?? `${process.env.HOME}/.config/solana/id.json`;
  const secret = JSON.parse(readFileSync(walletPath, "utf-8")) as number[];
  const walletKeypair = Keypair.fromSecretKey(Uint8Array.from(secret));
  const provider = new AnchorProvider(
    new Connection(rpcUrl, "confirmed"),
    new Wallet(walletKeypair),
    { commitment: "confirmed" },
  );
  return { provider, walletKeypair };
}

export function deriveConfigPda(authority: PublicKey, symbol: string): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("stablecoin"), authority.toBuffer(), Buffer.from(symbol)],
    SSS_STABLECOIN_PROGRAM_ID,
  );
}

export function deriveRoleRegistryPda(configPda: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("role_registry"), configPda.toBuffer()],
    SSS_STABLECOIN_PROGRAM_ID,
  );
}

export function deriveBlacklistPda(configPda: PublicKey, address: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("blacklist"), configPda.toBuffer(), address.toBuffer()],
    SSS_STABLECOIN_PROGRAM_ID,
  );
}

export function deriveExtraAccountMetaListPda(mint: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("extra-account-metas"), mint.toBuffer()],
    SSS_TRANSFER_HOOK_PROGRAM_ID,
  );
}

export async function sendInstructions(
  connection: Connection,
  payer: Keypair,
  instructions: TransactionInstruction[],
  signers: Signer[] = [],
): Promise<string> {
  const tx = new Transaction();
  tx.add(...instructions);
  return sendAndConfirmTransaction(connection, tx, [payer, ...signers], {
    commitment: "confirmed",
  });
}

export function ixInitialize(params: {
  config: PublicKey;
  roleRegistry: PublicKey;
  mint: PublicKey;
  authority: PublicKey;
  name: string;
  symbol: string;
  decimals: number;
  enablePermanentDelegate: boolean;
  enableTransferHook: boolean;
  defaultAccountFrozen: boolean;
  enablePrivacy: boolean;
}): TransactionInstruction {
  const args = encodeWithLayout(initializeLayout, {
    name: params.name,
    symbol: params.symbol,
    decimals: params.decimals,
    enablePermanentDelegate: params.enablePermanentDelegate,
    enableTransferHook: params.enableTransferHook,
    defaultAccountFrozen: params.defaultAccountFrozen,
    enablePrivacy: params.enablePrivacy,
  });

  const keys = [
    { pubkey: params.config, isSigner: false, isWritable: true },
    { pubkey: params.roleRegistry, isSigner: false, isWritable: true },
    { pubkey: params.mint, isSigner: true, isWritable: true },
    { pubkey: params.authority, isSigner: true, isWritable: true },
    { pubkey: SSS_TRANSFER_HOOK_PROGRAM_ID, isSigner: false, isWritable: false },
  ];

  keys.push(
    { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  );

  return new TransactionInstruction({
    programId: SSS_STABLECOIN_PROGRAM_ID,
    keys,
    data: Buffer.concat([discriminator("initialize"), args]),
  });
}

export function ixInitializeExtraAccountMetaList(params: {
  extraAccountMetaList: PublicKey;
  mint: PublicKey;
  payer: PublicKey;
}): TransactionInstruction {
  const initExtraDiscriminator = Buffer.from([43, 34, 13, 49, 167, 88, 235, 235]);
  return new TransactionInstruction({
    programId: SSS_TRANSFER_HOOK_PROGRAM_ID,
    keys: [
      { pubkey: params.extraAccountMetaList, isSigner: false, isWritable: true },
      { pubkey: params.mint, isSigner: false, isWritable: false },
      { pubkey: params.payer, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([initExtraDiscriminator, Buffer.from([0, 0, 0, 0])]),
  });
}

export function ixUpdateMinterAdd(params: {
  config: PublicKey;
  roleRegistry: PublicKey;
  authority: PublicKey;
  address: PublicKey;
  quota: bigint;
}): TransactionInstruction {
  const header = encodeWithLayout(updateMinterLayout, { address: params.address });
  const action = Buffer.alloc(1 + 8);
  action.writeUInt8(0, 0);
  action.writeBigUInt64LE(params.quota, 1);
  return new TransactionInstruction({
    programId: SSS_STABLECOIN_PROGRAM_ID,
    keys: [
      { pubkey: params.config, isSigner: false, isWritable: false },
      { pubkey: params.roleRegistry, isSigner: false, isWritable: true },
      { pubkey: params.authority, isSigner: true, isWritable: true },
    ],
    data: Buffer.concat([discriminator("update_minter"), header, action]),
  });
}

export function ixMint(params: {
  config: PublicKey;
  roleRegistry: PublicKey;
  mint: PublicKey;
  recipientAta: PublicKey;
  minter: PublicKey;
  amount: bigint;
}): TransactionInstruction {
  const args = Buffer.alloc(8);
  args.writeBigUInt64LE(params.amount, 0);
  return new TransactionInstruction({
    programId: SSS_STABLECOIN_PROGRAM_ID,
    keys: [
      { pubkey: params.config, isSigner: false, isWritable: true },
      { pubkey: params.roleRegistry, isSigner: false, isWritable: true },
      { pubkey: params.mint, isSigner: false, isWritable: true },
      { pubkey: params.recipientAta, isSigner: false, isWritable: true },
      { pubkey: params.minter, isSigner: true, isWritable: true },
      { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([discriminator("mint"), args]),
  });
}

export function ixFreeze(params: {
  config: PublicKey;
  roleRegistry: PublicKey;
  mint: PublicKey;
  targetAta: PublicKey;
  authority: PublicKey;
}): TransactionInstruction {
  return new TransactionInstruction({
    programId: SSS_STABLECOIN_PROGRAM_ID,
    keys: [
      { pubkey: params.config, isSigner: false, isWritable: false },
      { pubkey: params.roleRegistry, isSigner: false, isWritable: false },
      { pubkey: params.mint, isSigner: false, isWritable: true },
      { pubkey: params.targetAta, isSigner: false, isWritable: true },
      { pubkey: params.authority, isSigner: true, isWritable: true },
      { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: discriminator("freeze_account"),
  });
}

export function ixThaw(params: {
  config: PublicKey;
  roleRegistry: PublicKey;
  mint: PublicKey;
  targetAta: PublicKey;
  authority: PublicKey;
}): TransactionInstruction {
  return new TransactionInstruction({
    programId: SSS_STABLECOIN_PROGRAM_ID,
    keys: [
      { pubkey: params.config, isSigner: false, isWritable: false },
      { pubkey: params.roleRegistry, isSigner: false, isWritable: false },
      { pubkey: params.mint, isSigner: false, isWritable: true },
      { pubkey: params.targetAta, isSigner: false, isWritable: true },
      { pubkey: params.authority, isSigner: true, isWritable: true },
      { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: discriminator("thaw_account"),
  });
}

export function ixPause(config: PublicKey, roleRegistry: PublicKey, authority: PublicKey): TransactionInstruction {
  return new TransactionInstruction({
    programId: SSS_STABLECOIN_PROGRAM_ID,
    keys: [
      { pubkey: config, isSigner: false, isWritable: true },
      { pubkey: roleRegistry, isSigner: false, isWritable: false },
      { pubkey: authority, isSigner: true, isWritable: true },
    ],
    data: discriminator("pause"),
  });
}

export function ixUnpause(config: PublicKey, roleRegistry: PublicKey, authority: PublicKey): TransactionInstruction {
  return new TransactionInstruction({
    programId: SSS_STABLECOIN_PROGRAM_ID,
    keys: [
      { pubkey: config, isSigner: false, isWritable: true },
      { pubkey: roleRegistry, isSigner: false, isWritable: false },
      { pubkey: authority, isSigner: true, isWritable: true },
    ],
    data: discriminator("unpause"),
  });
}

export function ixUpdateRoleAdd(params: {
  config: PublicKey;
  roleRegistry: PublicKey;
  authority: PublicKey;
  roleType: number;
  address: PublicKey;
}): TransactionInstruction {
  const args = encodeWithLayout(updateRolesLayout, {
    roleType: params.roleType,
    address: params.address,
    action: 0,
  });
  return new TransactionInstruction({
    programId: SSS_STABLECOIN_PROGRAM_ID,
    keys: [
      { pubkey: params.config, isSigner: false, isWritable: false },
      { pubkey: params.roleRegistry, isSigner: false, isWritable: true },
      { pubkey: params.authority, isSigner: true, isWritable: true },
    ],
    data: Buffer.concat([discriminator("update_roles"), args]),
  });
}

export function ixAddToBlacklist(params: {
  config: PublicKey;
  roleRegistry: PublicKey;
  blacklistEntry: PublicKey;
  blacklister: PublicKey;
  address: PublicKey;
  reason: string;
}): TransactionInstruction {
  const args = encodeWithLayout(addToBlacklistLayout, {
    address: params.address,
    reason: params.reason,
  });
  return new TransactionInstruction({
    programId: SSS_STABLECOIN_PROGRAM_ID,
    keys: [
      { pubkey: params.config, isSigner: false, isWritable: false },
      { pubkey: params.roleRegistry, isSigner: false, isWritable: false },
      { pubkey: params.blacklistEntry, isSigner: false, isWritable: true },
      { pubkey: params.blacklister, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([discriminator("add_to_blacklist"), args]),
  });
}

export function ixSeize(params: {
  config: PublicKey;
  roleRegistry: PublicKey;
  mint: PublicKey;
  targetAta: PublicKey;
  treasuryAta: PublicKey;
  transferHookProgram: PublicKey;
  extraAccountMetaList: PublicKey;
  stablecoinProgram: PublicKey;
  senderBlacklist: PublicKey;
  receiverBlacklist: PublicKey;
  seizer: PublicKey;
}): TransactionInstruction {
  return new TransactionInstruction({
    programId: SSS_STABLECOIN_PROGRAM_ID,
    keys: [
      { pubkey: params.config, isSigner: false, isWritable: false },
      { pubkey: params.roleRegistry, isSigner: false, isWritable: false },
      { pubkey: params.mint, isSigner: false, isWritable: true },
      { pubkey: params.targetAta, isSigner: false, isWritable: true },
      { pubkey: params.treasuryAta, isSigner: false, isWritable: true },
      { pubkey: params.transferHookProgram, isSigner: false, isWritable: false },
      { pubkey: params.extraAccountMetaList, isSigner: false, isWritable: false },
      { pubkey: params.stablecoinProgram, isSigner: false, isWritable: false },
      { pubkey: params.senderBlacklist, isSigner: false, isWritable: false },
      { pubkey: params.receiverBlacklist, isSigner: false, isWritable: false },
      { pubkey: params.seizer, isSigner: true, isWritable: true },
      { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: discriminator("seize"),
  });
}
