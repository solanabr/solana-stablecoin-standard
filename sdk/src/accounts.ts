/**
 * Account fetching and deserialization for the Solana Stablecoin Standard.
 *
 * Provides standalone functions to fetch and deserialize on-chain accounts
 * without needing the full {@link SolanaStablecoin} client.
 *
 * @example
 * ```typescript
 * import { fetchStablecoinConfig, fetchRoleManager } from "@stbr/sss-token";
 *
 * const config = await fetchStablecoinConfig(connection, configPda);
 * const roles = await fetchRoleManager(connection, rolesPda);
 * ```
 *
 * @module accounts
 */

import { Connection, PublicKey } from "@solana/web3.js";
import type { StablecoinConfig, RoleManager, BlacklistEntry } from "./types";

// ─── Deserializers ──────────────────────────────────────────────────────

/**
 * Deserialize a {@link StablecoinConfig} from raw Anchor account data.
 *
 * @param data - Raw account data (including 8-byte Anchor discriminator)
 * @returns Parsed stablecoin configuration
 */
export function deserializeStablecoinConfig(data: Buffer): StablecoinConfig {
  let offset = 8; // Skip Anchor discriminator

  const authority = new PublicKey(data.subarray(offset, offset + 32));
  offset += 32;

  const mint = new PublicKey(data.subarray(offset, offset + 32));
  offset += 32;

  const nameLen = data.readUInt32LE(offset);
  offset += 4;
  const name = data.subarray(offset, offset + nameLen).toString("utf8");
  offset += nameLen;

  const symbolLen = data.readUInt32LE(offset);
  offset += 4;
  const symbol = data.subarray(offset, offset + symbolLen).toString("utf8");
  offset += symbolLen;

  const uriLen = data.readUInt32LE(offset);
  offset += 4;
  const uri = data.subarray(offset, offset + uriLen).toString("utf8");
  offset += uriLen;

  const decimals = data.readUInt8(offset);
  offset += 1;

  const isPaused = data.readUInt8(offset) === 1;
  offset += 1;

  const totalMinted = data.readBigUInt64LE(offset);
  offset += 8;

  const totalBurned = data.readBigUInt64LE(offset);
  offset += 8;

  const enablePermanentDelegate = data.readUInt8(offset) === 1;
  offset += 1;

  const enableTransferHook = data.readUInt8(offset) === 1;
  offset += 1;

  const enableConfidentialTransfers = data.readUInt8(offset) === 1;
  offset += 1;

  const defaultAccountFrozen = data.readUInt8(offset) === 1;
  offset += 1;

  // supply_cap: Option<u64> — 1 byte tag + 8 bytes value
  const hasSupplyCap = data.readUInt8(offset) === 1;
  offset += 1;
  let supplyCap: bigint | null = null;
  if (hasSupplyCap) {
    supplyCap = data.readBigUInt64LE(offset);
  }
  offset += 8;

  const bump = data.readUInt8(offset);

  return {
    authority,
    mint,
    name,
    symbol,
    uri,
    decimals,
    isPaused,
    totalMinted,
    totalBurned,
    enablePermanentDelegate,
    enableTransferHook,
    enableConfidentialTransfers,
    defaultAccountFrozen,
    supplyCap,
    bump,
  };
}

/**
 * Deserialize a {@link RoleManager} from raw Anchor account data.
 *
 * @param data - Raw account data (including 8-byte Anchor discriminator)
 * @returns Parsed role manager
 */
export function deserializeRoleManager(data: Buffer): RoleManager {
  let offset = 8; // Skip Anchor discriminator

  const config = new PublicKey(data.subarray(offset, offset + 32));
  offset += 32;

  const masterAuthority = new PublicKey(data.subarray(offset, offset + 32));
  offset += 32;

  const pauser = new PublicKey(data.subarray(offset, offset + 32));
  offset += 32;

  // Vec<MinterEntry>: 4-byte length + entries
  const mintersLen = data.readUInt32LE(offset);
  offset += 4;
  const minters = [];
  for (let i = 0; i < mintersLen; i++) {
    const address = new PublicKey(data.subarray(offset, offset + 32));
    offset += 32;
    const quota = data.readBigUInt64LE(offset);
    offset += 8;
    const minted = data.readBigUInt64LE(offset);
    offset += 8;
    minters.push({ address, quota, minted });
  }

  // Vec<Pubkey>: 4-byte length + pubkeys
  const burnersLen = data.readUInt32LE(offset);
  offset += 4;
  const burners = [];
  for (let i = 0; i < burnersLen; i++) {
    burners.push(new PublicKey(data.subarray(offset, offset + 32)));
    offset += 32;
  }

  const blacklister = new PublicKey(data.subarray(offset, offset + 32));
  offset += 32;

  const seizer = new PublicKey(data.subarray(offset, offset + 32));
  offset += 32;

  const bump = data.readUInt8(offset);

  return {
    config,
    masterAuthority,
    pauser,
    minters,
    burners,
    blacklister,
    seizer,
    bump,
  };
}

/**
 * Deserialize a {@link BlacklistEntry} from raw Anchor account data.
 *
 * @param data - Raw account data (including 8-byte Anchor discriminator)
 * @returns Parsed blacklist entry
 */
export function deserializeBlacklistEntry(data: Buffer): BlacklistEntry {
  let offset = 8; // Skip Anchor discriminator

  const config = new PublicKey(data.subarray(offset, offset + 32));
  offset += 32;

  const address = new PublicKey(data.subarray(offset, offset + 32));
  offset += 32;

  const reasonLen = data.readUInt32LE(offset);
  offset += 4;
  const reason = data.subarray(offset, offset + reasonLen).toString("utf8");
  offset += reasonLen;

  const blacklistedAt = data.readBigInt64LE(offset);
  offset += 8;

  const blacklistedBy = new PublicKey(data.subarray(offset, offset + 32));
  offset += 32;

  const bump = data.readUInt8(offset);

  return { config, address, reason, blacklistedAt, blacklistedBy, bump };
}

// ─── Fetch Functions ────────────────────────────────────────────────────

/**
 * Fetch and deserialize a stablecoin configuration from the network.
 *
 * @param connection - Solana RPC connection
 * @param configPda - The config PDA address
 * @returns The parsed stablecoin configuration
 * @throws Error if the account does not exist
 *
 * @example
 * ```typescript
 * const config = await fetchStablecoinConfig(connection, configPda);
 * console.log(config.name, config.symbol, config.decimals);
 * ```
 */
export async function fetchStablecoinConfig(
  connection: Connection,
  configPda: PublicKey
): Promise<StablecoinConfig> {
  const accountInfo = await connection.getAccountInfo(configPda);
  if (!accountInfo) {
    throw new Error(`StablecoinConfig not found at ${configPda.toBase58()}`);
  }
  return deserializeStablecoinConfig(accountInfo.data as Buffer);
}

/**
 * Fetch and deserialize a role manager from the network.
 *
 * @param connection - Solana RPC connection
 * @param rolesPda - The roles PDA address
 * @returns The parsed role manager
 * @throws Error if the account does not exist
 *
 * @example
 * ```typescript
 * const roles = await fetchRoleManager(connection, rolesPda);
 * console.log("Minters:", roles.minters.length);
 * ```
 */
export async function fetchRoleManager(
  connection: Connection,
  rolesPda: PublicKey
): Promise<RoleManager> {
  const accountInfo = await connection.getAccountInfo(rolesPda);
  if (!accountInfo) {
    throw new Error(`RoleManager not found at ${rolesPda.toBase58()}`);
  }
  return deserializeRoleManager(accountInfo.data as Buffer);
}

/**
 * Fetch and deserialize a blacklist entry from the network.
 *
 * @param connection - Solana RPC connection
 * @param blacklistPda - The blacklist entry PDA address
 * @returns The parsed blacklist entry, or `null` if the address is not blacklisted
 *
 * @example
 * ```typescript
 * const entry = await fetchBlacklistEntry(connection, blacklistPda);
 * if (entry) {
 *   console.log("Blacklisted:", entry.reason);
 * }
 * ```
 */
export async function fetchBlacklistEntry(
  connection: Connection,
  blacklistPda: PublicKey
): Promise<BlacklistEntry | null> {
  const accountInfo = await connection.getAccountInfo(blacklistPda);
  if (!accountInfo) return null;
  return deserializeBlacklistEntry(accountInfo.data as Buffer);
}
