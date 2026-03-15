import { Connection, PublicKey } from "@solana/web3.js";
import { StablecoinClient } from "@stbr/sss-client";
import { transferHook } from "@stbr/sss-generated-web3js";

export interface MintStatus {
  preset: string;
  paused: boolean;
  supply: string;
  totalMinted: string;
  totalBurned: string;
  holderCount: number;
  metadata: {
    mint: string;
    name: string;
    symbol: string;
    decimals: number;
    uri: string;
  };
  features: {
    permanentDelegate: boolean;
    transferHook: boolean;
    defaultFrozen: boolean;
  };
  roles: {
    masterAuthority: string;
    pauser: string;
    burner: string;
    blacklister: string;
    seizer: string;
  };
  holders: HolderRecord[];
}

export interface HolderRecord {
  owner: string;
  tokenAccount: string;
  balance: string;
  percentOfSupply: string;
}

function formatPercent(amount: bigint, supply: bigint): string {
  if (supply === BigInt(0)) return "0.00%";
  return `${((Number(amount) / Number(supply)) * 100).toFixed(2)}%`;
}

function inferPreset(
  enablePermanentDelegate: boolean,
  enableTransferHook: boolean
): string {
  return enablePermanentDelegate && enableTransferHook ? "sss-2" : "sss-1";
}

function parseOwnerFromTokenAccountData(data: Uint8Array): PublicKey {
  if (data.length < 64) return new PublicKey(0);
  return new PublicKey(data.slice(32, 64));
}

export async function fetchMintStatus(
  mintAddress: string,
  rpcUrl: string
): Promise<MintStatus> {
  const connection = new Connection(rpcUrl, "confirmed");
  const mint = new PublicKey(mintAddress);

  const client = new StablecoinClient({
    connection,
    wallet: null,
    transferHookProgramId: transferHook.TRANSFERHOOK_PROGRAM_ID,
  });
  const stablecoinInstance = client.getStablecoin(mint);

  const [config, roleConfig, mintInfo] = await Promise.all([
    stablecoinInstance.getConfig(),
    stablecoinInstance.getRoleConfig(),
    stablecoinInstance.getMintInfo(),
  ]);

  const supply = mintInfo.supply;
  const totalMinted = config.data.totalMinted;
  const totalBurned = config.data.totalBurned;

  const largest = await connection.getTokenLargestAccounts(mint);
  const value = largest.value ?? [];
  const addresses = value
    .filter((a) => BigInt(a.amount) > BigInt(0))
    .map((a) => new PublicKey(a.address));

  let holders: HolderRecord[] = [];
  if (addresses.length > 0) {
    const accounts = await connection.getMultipleAccountsInfo(addresses);
    holders = value
      .filter((a) => BigInt(a.amount) > BigInt(0))
      .slice(0, 12)
      .map((item, i) => {
        const account = accounts[i];
        const owner = account
          ? parseOwnerFromTokenAccountData(account.data)
          : new PublicKey(0);
        const amount = BigInt(item.amount);
        return {
          owner: owner.toBase58(),
          tokenAccount: String(item.address),
          balance: item.amount,
          percentOfSupply: formatPercent(amount, supply),
        };
      });
  }

  return {
    preset: inferPreset(
      config.data.enablePermanentDelegate,
      config.data.enableTransferHook
    ),
    paused: config.data.paused,
    supply: supply.toString(),
    totalMinted: totalMinted.toString(),
    totalBurned: totalBurned.toString(),
    holderCount: holders.length,
    metadata: {
      mint: mint.toBase58(),
      name: config.data.name,
      symbol: config.data.symbol,
      decimals: config.data.decimals,
      uri: config.data.uri,
    },
    features: {
      permanentDelegate: config.data.enablePermanentDelegate,
      transferHook: config.data.enableTransferHook,
      defaultFrozen: config.data.defaultAccountFrozen,
    },
    roles: {
      masterAuthority: roleConfig.data.masterAuthority.toBase58(),
      pauser: roleConfig.data.pauser.toBase58(),
      burner: roleConfig.data.burner.toBase58(),
      blacklister: roleConfig.data.blacklister.toBase58(),
      seizer: roleConfig.data.seizer.toBase58(),
    },
    holders,
  };
}
