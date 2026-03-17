import { Connection, PublicKey } from "@solana/web3.js";
import {
  fixCodecSize,
  getBytesCodec,
  getStructCodec,
  transformCodec,
} from "@solana/codecs";

export interface HookConfigAccountData {
  stablecoinProgramId: PublicKey;
}

export interface HookConfigAccount {
  address: PublicKey;
  data: HookConfigAccountData;
}

const HookConfigAccountDataCodec = getStructCodec([
  ["discriminator", fixCodecSize(getBytesCodec(), 8)],
  [
    "stablecoinProgramId",
    transformCodec(
      fixCodecSize(getBytesCodec(), 32),
      (value: PublicKey) => value.toBytes(),
      (value) => new PublicKey(value),
    ),
  ],
]);

export function deserializeHookConfigAccount(
  data: Uint8Array,
): HookConfigAccountData {
  const deserialized = HookConfigAccountDataCodec.decode(data);
  const { discriminator: _, ...accountData } = deserialized;
  return accountData as HookConfigAccountData;
}

export async function fetchHookConfigAccount(
  connection: Connection,
  address: PublicKey,
): Promise<HookConfigAccount> {
  const accountInfo = await connection.getAccountInfo(address);
  if (!accountInfo) {
    throw new Error(
      "HookConfig account not found at address: " + address.toBase58(),
    );
  }
  return {
    address,
    data: deserializeHookConfigAccount(accountInfo.data),
  };
}

export async function fetchAllMaybeHookConfigAccounts(
  connection: Connection,
  addresses: PublicKey[],
): Promise<(HookConfigAccount | null)[]> {
  const accountInfos = await connection.getMultipleAccountsInfo(addresses);
  return accountInfos.map((accountInfo, index) => {
    if (!accountInfo) {
      return null;
    }
    return {
      address: addresses[index],
      data: deserializeHookConfigAccount(accountInfo.data),
    };
  });
}

export async function fetchAllHookConfigAccounts(
  connection: Connection,
  addresses: PublicKey[],
): Promise<HookConfigAccount[]> {
  const maybeAccounts = await fetchAllMaybeHookConfigAccounts(
    connection,
    addresses,
  );
  const missingAddresses = maybeAccounts
    .flatMap((account, i) => (!account ? [addresses[i].toBase58()] : []))
    .join(", ");
  if (missingAddresses) {
    throw new Error(
      "HookConfig account(s) not found at address(es): " + missingAddresses,
    );
  }
  return maybeAccounts.filter((a): a is HookConfigAccount => a !== null);
}

export async function fetchProgramAccountsHookConfig(
  connection: Connection,
  programId: PublicKey,
  options?: { commitment?: "processed" | "confirmed" | "finalized" },
): Promise<HookConfigAccount[]> {
  const accounts = await connection.getProgramAccounts(programId, {
    commitment: options?.commitment,
    filters: [
      { memcmp: { offset: 0, bytes: "Q1xhsPGxNXo" } },
      { dataSize: 40 },
    ],
  });
  return accounts.map(({ pubkey, account }) => ({
    address: pubkey,
    data: deserializeHookConfigAccount(account.data),
  }));
}
