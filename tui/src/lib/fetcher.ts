import { Connection, PublicKey } from "@solana/web3.js";
import { AnchorProvider, Program, Wallet, BN } from "@coral-xyz/anchor";
import * as path from "path";
import * as fs from "fs";

// --- Types matching the on-chain accounts ---

export interface StablecoinConfigData {
  mint: PublicKey;
  preset: number;
  authority: PublicKey;
  pendingAuthority: PublicKey;
  masterMinter: PublicKey;
  pauser: PublicKey;
  blacklister: PublicKey;
  paused: boolean;
  totalMinted: BN;
  totalBurned: BN;
  totalSeized: BN;
  bump: number;
  mintAuthorityBump: number;
}

export interface MinterStateData {
  config: PublicKey;
  minter: PublicKey;
  quota: BN;
  mintedAmount: BN;
  enabled: boolean;
  bump: number;
}

export interface BlacklistEntryData {
  mint: PublicKey;
  wallet: PublicKey;
  blacklisted: boolean;
  reason: string;
  blacklistedAt: BN;
  blacklistedBy: PublicKey;
  bump: number;
}

export interface DashboardData {
  config: StablecoinConfigData | null;
  minters: MinterStateData[];
  blacklistEntries: BlacklistEntryData[];
  tokenName: string;
  tokenSymbol: string;
  decimals: number;
  error: string | null;
}

// PDA seeds
const CONFIG_SEED = "config";
const SSS_CORE_PROGRAM_ID = new PublicKey("CZzvCtyZC8KR37DNDeGYpwN46YEc7WEh6RyeSRdhjY4Y");
const SSS_HOOK_PROGRAM_ID = new PublicKey("9aw7Ac4aGMMfND3BvYgGEcASuvyJiBXnQizbhNBphcNM");

function findConfigPda(mint: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(CONFIG_SEED), mint.toBuffer()],
    SSS_CORE_PROGRAM_ID
  );
}

function loadIdl(name: string): any {
  // Try multiple locations for the IDL
  const candidates = [
    path.resolve(__dirname, `../../../backend/idl/${name}.json`),
    path.resolve(__dirname, `../../../target/idl/${name}.json`),
  ];

  for (const candidate of candidates) {
    try {
      const raw = fs.readFileSync(candidate, "utf-8");
      return JSON.parse(raw);
    } catch {
      // continue
    }
  }
  throw new Error(`Could not find IDL for ${name}. Searched: ${candidates.join(", ")}`);
}

/**
 * Creates a read-only AnchorProvider (no signing needed for fetches).
 */
function createReadOnlyProvider(connection: Connection): AnchorProvider {
  // Minimal wallet that satisfies the Wallet interface for read-only usage
  const dummyWallet: Wallet = {
    publicKey: PublicKey.default,
    signTransaction: async (tx: any) => tx,
    signAllTransactions: async (txs: any) => txs,
  } as Wallet;

  return new AnchorProvider(connection, dummyWallet, {
    commitment: "confirmed",
  });
}

/**
 * Try to read token metadata from the mint account (Token-2022 metadata extension).
 */
async function fetchTokenMetadata(
  connection: Connection,
  mint: PublicKey
): Promise<{ name: string; symbol: string; decimals: number }> {
  try {
    // Use getParsedAccountInfo to read mint data
    const info = await connection.getParsedAccountInfo(mint);
    if (info.value && "parsed" in (info.value.data as any)) {
      const parsed = (info.value.data as any).parsed;
      if (parsed?.info) {
        const decimals = parsed.info.decimals ?? 6;
        // Token-2022 metadata extension if available
        const extensions = parsed.info.extensions ?? [];
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
      }
    }
  } catch {
    // fall through
  }
  return { name: "Unknown Token", symbol: "???", decimals: 6 };
}

/**
 * Fetch all dashboard data from the chain.
 */
export async function fetchDashboardData(
  connection: Connection,
  mint: PublicKey
): Promise<DashboardData> {
  const result: DashboardData = {
    config: null,
    minters: [],
    blacklistEntries: [],
    tokenName: "Unknown",
    tokenSymbol: "???",
    decimals: 6,
    error: null,
  };

  try {
    const provider = createReadOnlyProvider(connection);

    // Load core IDL and create program
    const coreIdl = loadIdl("sss_core");
    const coreProgram = new Program(coreIdl, provider);

    // Derive config PDA
    const [configPda] = findConfigPda(mint);

    // Fetch config
    const configAccount = await (coreProgram.account as any).stablecoinConfig.fetch(configPda);
    result.config = configAccount as StablecoinConfigData;

    // Fetch token metadata
    const meta = await fetchTokenMetadata(connection, mint);
    result.tokenName = meta.name;
    result.tokenSymbol = meta.symbol;
    result.decimals = meta.decimals;

    // Fetch all minter states filtered by this config
    try {
      const allMinters = await (coreProgram.account as any).minterState.all([
        {
          memcmp: {
            offset: 8, // After discriminator
            bytes: configPda.toBase58(),
          },
        },
      ]);
      result.minters = allMinters.map((m: any) => m.account as MinterStateData);
    } catch {
      // Minters fetch may fail if none exist
    }

    // For SSS-2: fetch blacklist entries
    if (result.config.preset === 2) {
      try {
        const hookIdl = loadIdl("sss_hook");
        const hookProgram = new Program(hookIdl, provider);
        const allBlacklist = await (hookProgram.account as any).blacklistEntry.all([
          {
            memcmp: {
              offset: 8, // After discriminator
              bytes: mint.toBase58(),
            },
          },
        ]);
        result.blacklistEntries = allBlacklist
          .map((b: any) => b.account as BlacklistEntryData)
          .filter((b: BlacklistEntryData) => b.blacklisted);
      } catch {
        // Hook accounts may not exist
      }
    }
  } catch (err: any) {
    result.error = err.message || String(err);
  }

  return result;
}
