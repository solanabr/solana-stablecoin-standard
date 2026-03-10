"use client";

import { useQuery } from "@tanstack/react-query";
import { useConnection } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import {
  findConfigPda,
  SSS_CORE_PROGRAM_ID,
  SSS_HOOK_PROGRAM_ID,
} from "@/lib/constants";

// ---------- Types matching on-chain state ----------

export interface StablecoinConfig {
  mint: string;
  preset: number;
  authority: string;
  pendingAuthority: string;
  masterMinter: string;
  pauser: string;
  blacklister: string;
  paused: boolean;
  totalMinted: BN;
  totalBurned: BN;
  totalSeized: BN;
  bump: number;
  mintAuthorityBump: number;
}

export interface MinterState {
  config: string;
  minter: string;
  quota: BN;
  mintedAmount: BN;
  enabled: boolean;
  bump: number;
}

export interface TokenMetadata {
  name: string;
  symbol: string;
  decimals: number;
}

export interface BlacklistEntry {
  mint: string;
  wallet: string;
  blacklisted: boolean;
  reason: string;
  blacklistedAt: BN;
  blacklistedBy: string;
}

// ---------- Account deserialization ----------

// Config account layout (after 8-byte discriminator):
//   mint: Pubkey (32)
//   preset: u8 (1)
//   authority: Pubkey (32)
//   pending_authority: Pubkey (32)
//   master_minter: Pubkey (32)
//   pauser: Pubkey (32)
//   blacklister: Pubkey (32)
//   paused: bool (1)
//   total_minted: u64 (8)
//   total_burned: u64 (8)
//   total_seized: u64 (8)
//   bump: u8 (1)
//   mint_authority_bump: u8 (1)

function deserializeConfig(data: Buffer): StablecoinConfig {
  let offset = 8; // skip discriminator

  const mint = new PublicKey(data.subarray(offset, offset + 32)).toBase58();
  offset += 32;

  const preset = data[offset];
  offset += 1;

  const authority = new PublicKey(
    data.subarray(offset, offset + 32)
  ).toBase58();
  offset += 32;

  const pendingAuthority = new PublicKey(
    data.subarray(offset, offset + 32)
  ).toBase58();
  offset += 32;

  const masterMinter = new PublicKey(
    data.subarray(offset, offset + 32)
  ).toBase58();
  offset += 32;

  const pauser = new PublicKey(data.subarray(offset, offset + 32)).toBase58();
  offset += 32;

  const blacklister = new PublicKey(
    data.subarray(offset, offset + 32)
  ).toBase58();
  offset += 32;

  const paused = data[offset] !== 0;
  offset += 1;

  const totalMinted = new BN(data.subarray(offset, offset + 8), "le");
  offset += 8;

  const totalBurned = new BN(data.subarray(offset, offset + 8), "le");
  offset += 8;

  const totalSeized = new BN(data.subarray(offset, offset + 8), "le");
  offset += 8;

  const bump = data[offset];
  offset += 1;

  const mintAuthorityBump = data[offset];

  return {
    mint,
    preset,
    authority,
    pendingAuthority,
    masterMinter,
    pauser,
    blacklister,
    paused,
    totalMinted,
    totalBurned,
    totalSeized,
    bump,
    mintAuthorityBump,
  };
}

// MinterState layout (after 8-byte discriminator):
//   config: Pubkey (32)
//   minter: Pubkey (32)
//   quota: u64 (8)
//   minted_amount: u64 (8)
//   enabled: bool (1)
//   bump: u8 (1)
// Total = 8 + 82 = 90

function deserializeMinterState(data: Buffer): MinterState {
  let offset = 8; // skip discriminator

  const config = new PublicKey(data.subarray(offset, offset + 32)).toBase58();
  offset += 32;

  const minter = new PublicKey(data.subarray(offset, offset + 32)).toBase58();
  offset += 32;

  const quota = new BN(data.subarray(offset, offset + 8), "le");
  offset += 8;

  const mintedAmount = new BN(data.subarray(offset, offset + 8), "le");
  offset += 8;

  const enabled = data[offset] !== 0;
  offset += 1;

  const bump = data[offset];

  return { config, minter, quota, mintedAmount, enabled, bump };
}

// BlacklistEntry layout (after 8-byte discriminator):
//   mint: Pubkey (32)
//   wallet: Pubkey (32)
//   blacklisted: bool (1)
//   reason: String (4 + len)
//   blacklisted_at: i64 (8)
//   blacklisted_by: Pubkey (32)
//   bump: u8 (1)

function deserializeBlacklistEntry(data: Buffer): BlacklistEntry {
  let offset = 8; // skip discriminator

  const mint = new PublicKey(data.subarray(offset, offset + 32)).toBase58();
  offset += 32;

  const wallet = new PublicKey(data.subarray(offset, offset + 32)).toBase58();
  offset += 32;

  const blacklisted = data[offset] !== 0;
  offset += 1;

  // reason is a string with 4-byte length prefix
  const reasonLen = data.readUInt32LE(offset);
  offset += 4;
  const reason = data.subarray(offset, offset + reasonLen).toString("utf-8");
  offset += reasonLen;

  const blacklistedAt = new BN(data.subarray(offset, offset + 8), "le");
  offset += 8;

  const blacklistedBy = new PublicKey(
    data.subarray(offset, offset + 32)
  ).toBase58();

  return { mint, wallet, blacklisted, reason, blacklistedAt, blacklistedBy };
}

// ---------- Hooks ----------

export function useStablecoinConfig(mintAddress: string | null) {
  const { connection } = useConnection();

  return useQuery<StablecoinConfig | null>({
    queryKey: ["stablecoin-config", mintAddress],
    enabled: !!mintAddress,
    queryFn: async () => {
      if (!mintAddress) return null;
      const mint = new PublicKey(mintAddress);
      const [configPda] = findConfigPda(mint);

      const info = await connection.getAccountInfo(configPda);
      if (!info || !info.data) return null;

      return deserializeConfig(Buffer.from(info.data));
    },
  });
}

export function useTokenMetadata(mintAddress: string | null) {
  const { connection } = useConnection();

  return useQuery<TokenMetadata | null>({
    queryKey: ["token-metadata", mintAddress],
    enabled: !!mintAddress,
    queryFn: async () => {
      if (!mintAddress) return null;
      const mint = new PublicKey(mintAddress);

      const info = await connection.getParsedAccountInfo(mint);
      if (!info.value) return null;

      const data = info.value.data;
      if (!("parsed" in data)) return null;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const parsed = data.parsed as any;
      const decimals = parsed?.info?.decimals ?? 6;
      const extensions = parsed?.info?.extensions ?? [];

      for (const ext of extensions) {
        if (ext.extension === "tokenMetadata") {
          return {
            name: ext.state?.name ?? "Unknown",
            symbol: ext.state?.symbol ?? "???",
            decimals,
          };
        }
      }

      return { name: "Unknown Token", symbol: "???", decimals };
    },
  });
}

export function useMinters(mintAddress: string | null) {
  const { connection } = useConnection();

  return useQuery<MinterState[]>({
    queryKey: ["minters", mintAddress],
    enabled: !!mintAddress,
    queryFn: async () => {
      if (!mintAddress) return [];
      const mint = new PublicKey(mintAddress);
      const [configPda] = findConfigPda(mint);

      // MinterState accounts: discriminator check via memcmp on config pubkey at offset 8
      // dataSize = 90 bytes (8 discriminator + 32 + 32 + 8 + 8 + 1 + 1)
      const accounts = await connection.getProgramAccounts(
        SSS_CORE_PROGRAM_ID,
        {
          filters: [
            { memcmp: { offset: 8, bytes: configPda.toBase58() } },
            { dataSize: 90 },
          ],
        }
      );

      return accounts
        .map((a) => deserializeMinterState(Buffer.from(a.account.data)))
        .sort((a, b) => (a.enabled === b.enabled ? 0 : a.enabled ? -1 : 1));
    },
  });
}

export function useBlacklistEntries(
  mintAddress: string | null,
  preset: number | undefined
) {
  const { connection } = useConnection();

  return useQuery<BlacklistEntry[]>({
    queryKey: ["blacklist", mintAddress],
    enabled: !!mintAddress && preset === 2,
    queryFn: async () => {
      if (!mintAddress) return [];
      const mint = new PublicKey(mintAddress);

      // BlacklistEntry accounts: check mint pubkey at offset 8
      const accounts = await connection.getProgramAccounts(
        SSS_HOOK_PROGRAM_ID,
        {
          filters: [{ memcmp: { offset: 8, bytes: mint.toBase58() } }],
        }
      );

      return accounts
        .map((a) => {
          try {
            return deserializeBlacklistEntry(Buffer.from(a.account.data));
          } catch {
            return null;
          }
        })
        .filter(
          (entry): entry is BlacklistEntry =>
            entry !== null && entry.blacklisted
        );
    },
  });
}

export function useBlacklistCheck(
  mintAddress: string | null,
  walletAddress: string | null
) {
  const { connection } = useConnection();

  return useQuery<BlacklistEntry | null>({
    queryKey: ["blacklist-check", mintAddress, walletAddress],
    enabled: !!mintAddress && !!walletAddress,
    queryFn: async () => {
      if (!mintAddress || !walletAddress) return null;
      const mint = new PublicKey(mintAddress);
      const wallet = new PublicKey(walletAddress);
      const [blacklistPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("blacklist"),
          mint.toBuffer(),
          wallet.toBuffer(),
        ],
        SSS_HOOK_PROGRAM_ID
      );

      const info = await connection.getAccountInfo(blacklistPda);
      if (!info || !info.data) return null;

      try {
        return deserializeBlacklistEntry(Buffer.from(info.data));
      } catch {
        return null;
      }
    },
  });
}
