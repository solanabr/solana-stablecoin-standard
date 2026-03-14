import { BorshCoder, EventParser, Idl, Program, AnchorProvider } from '@coral-xyz/anchor';
import { Connection, Keypair, Logs, PublicKey, SystemProgram, Transaction } from '@solana/web3.js';
import {
  TOKEN_2022_PROGRAM_ID,
  getMintLen,
  ExtensionType,
  createInitializeMintInstruction,
  createInitializeMetadataPointerInstruction,
  createInitializePermanentDelegateInstruction,
  createInitializeTransferHookInstruction,
  createInitializeMintCloseAuthorityInstruction,
} from '@solana/spl-token';
import * as sdkPkg from 'solana-stablecoin-sdk';
import type { SolanaStablecoin as SolanaStablecoinType, Preset as PresetType } from 'solana-stablecoin-sdk';
import SSS_TOKEN_IDL from 'solana-stablecoin-sdk/dist/idl/sss_token.json';
import {
  getIDL,
  TRANSFER_HOOK_PROGRAM_ID,
  findStatePDA,
  findMintAuthorityPDA,
  findFreezeAuthorityPDA,
  findPermanentDelegatePDA,
} from './program';

type ParsedEvent = {
  name: string;
  signature: string;
  slot?: number;
  timestamp?: number;
  summary: string;
};

type IdlWithAddress = Idl & { address: string };

const sdkCache = new Map<string, SolanaStablecoinType>();
const SolanaStablecoin = (sdkPkg as any).SolanaStablecoin as typeof SolanaStablecoinType;
const Preset = (sdkPkg as any).Preset as typeof PresetType;

type CreatePresetChoice = 'SSS_1' | 'SSS_2';

type CreateStablecoinInput = {
  connection: Connection;
  wallet: {
    publicKey: PublicKey | null;
    signTransaction?: (tx: Transaction) => Promise<Transaction>;
    payer?: Keypair;
  };
  preset: CreatePresetChoice;
  name: string;
  symbol: string;
  uri?: string;
  decimals: number;
};

type CreateStablecoinResult = {
  mint: string;
  txSig: string;
  enablePD: boolean;
  enableTH: boolean;
};

function idlParser() {
  const idl = SSS_TOKEN_IDL as IdlWithAddress;
  const coder = new BorshCoder(idl);
  const programId = new PublicKey(idl.address);
  const parser = new EventParser(programId, coder);
  return { idl, parser, programId };
}

function summarize(name: string, data: Record<string, unknown>): string {
  const readPk = (key: string) => {
    const value = data[key] as { toBase58?: () => string } | undefined;
    const raw = value?.toBase58?.();
    return raw ? `${raw.slice(0, 6)}...${raw.slice(-6)}` : '—';
  };
  const amount = (key: string) => String(data[key] ?? '0');

  switch (name) {
    case 'TokensMinted':
      return `Minted ${amount('amount')} to ${readPk('recipient')}`;
    case 'TokensBurned':
      return `Burned ${amount('amount')} from ${readPk('from')}`;
    case 'ProtocolPaused':
      return 'Protocol paused';
    case 'ProtocolUnpaused':
      return 'Protocol unpaused';
    case 'MinterUpdated':
      return `${data.active ? 'Enabled' : 'Disabled'} minter ${readPk('minter')}`;
    case 'AddressBlacklisted':
      return `Blacklisted ${readPk('address')}`;
    case 'AddressUnblacklisted':
      return `Unblacklisted ${readPk('address')}`;
    case 'TokensSeized':
      return `Seized ${amount('amount')} from ${readPk('from')}`;
    default:
      return name;
  }
}

function mintMatches(data: Record<string, unknown>, mint: PublicKey): boolean {
  const eventMint = (data.mint as { toBase58?: () => string } | undefined)?.toBase58?.();
  return eventMint === mint.toBase58();
}

export async function getReadonlyStablecoin(connection: Connection, mint: PublicKey): Promise<SolanaStablecoinType> {
  const key = `${connection.rpcEndpoint}:${mint.toBase58()}`;
  const cached = sdkCache.get(key);
  if (cached) return cached;

  const sdk = await SolanaStablecoin.load(connection, mint, Keypair.generate());
  sdkCache.set(key, sdk);
  return sdk;
}

export async function fetchStablecoinSnapshot(connection: Connection, mint: PublicKey) {
  const sdk = await getReadonlyStablecoin(connection, mint);
  const [stateRes, mintInfoRes, mintersRes, holdersRes] = await Promise.allSettled([
    sdk.getState(),
    sdk.getMintInfo(),
    sdk.listMinters(),
    fetchHoldersSafe(connection, sdk, mint, 1n),
  ]);

  if (stateRes.status !== 'fulfilled') {
    throw stateRes.reason;
  }

  const state = normalizeState(stateRes.value);
  const mintInfo =
    mintInfoRes.status === 'fulfilled'
      ? mintInfoRes.value
      : ({ decimals: Number(state.decimals || 6), supply: 0n } as any);
  const minters = mintersRes.status === 'fulfilled' ? mintersRes.value : [];
  const holders = holdersRes.status === 'fulfilled' ? holdersRes.value : [];

  return {
    sdk,
    state,
    mintInfo,
    minters,
    holders,
  };
}

function toBigIntSafe(value: unknown): bigint {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number') return BigInt(Math.trunc(value));
  if (typeof value === 'string') {
    try {
      return BigInt(value);
    } catch {
      return 0n;
    }
  }
  if (value && typeof value === 'object' && 'toString' in (value as Record<string, unknown>)) {
    try {
      return BigInt((value as { toString: () => string }).toString());
    } catch {
      return 0n;
    }
  }
  return 0n;
}

function normalizeState(state: any) {
  const masterAuthorityRaw = state?.masterAuthority;
  const masterAuthority =
    masterAuthorityRaw && typeof masterAuthorityRaw.toBase58 === 'function'
      ? masterAuthorityRaw
      : new PublicKey('11111111111111111111111111111111');

  return {
    ...state,
    name: state?.name ?? '',
    symbol: state?.symbol ?? '',
    decimals: Number(state?.decimals ?? 6),
    paused: !!state?.paused,
    totalMinted: toBigIntSafe(state?.totalMinted),
    totalBurned: toBigIntSafe(state?.totalBurned),
    permanentDelegateEnabled: !!state?.permanentDelegateEnabled,
    transferHookEnabled: !!state?.transferHookEnabled,
    defaultAccountFrozen: !!state?.defaultAccountFrozen,
    masterAuthority,
  };
}

async function fetchHoldersSafe(
  connection: Connection,
  sdk: SolanaStablecoinType,
  mint: PublicKey,
  minBalance: bigint,
): Promise<Array<{ owner: PublicKey; balance: bigint }>> {
  try {
    return await sdk.getHolders(minBalance);
  } catch {
    try {
      const largest = await connection.getTokenLargestAccounts(mint, 'confirmed');
      const fallback = largest.value.slice(0, 100);

      const holders: Array<{ owner: PublicKey; balance: bigint }> = [];

      for (const tokenAcc of fallback) {
        const parsedInfo = await connection.getParsedAccountInfo(tokenAcc.address, 'confirmed');
        const parsed = (parsedInfo.value?.data as any)?.parsed?.info;

        const ownerRaw: string | undefined = parsed?.owner;
        const amountRaw: string | undefined = parsed?.tokenAmount?.amount ?? tokenAcc.amount;

        const owner = new PublicKey(ownerRaw ?? tokenAcc.address.toBase58());
        const balance = BigInt(amountRaw ?? '0');

        if (balance >= minBalance) {
          holders.push({ owner, balance });
        }
      }

      return holders.sort((a, b) => (b.balance > a.balance ? 1 : b.balance < a.balance ? -1 : 0));
    } catch {
      return [];
    }
  }
}

export async function createStablecoinWithSdkClient(input: CreateStablecoinInput): Promise<CreateStablecoinResult> {
  const { connection, wallet, preset, name, symbol, uri, decimals } = input;

  if (!wallet.publicKey || !wallet.signTransaction) {
    throw new Error('Connect your wallet first');
  }

  const enablePD = preset === 'SSS_2';
  const enableTH = preset === 'SSS_2';

  const presetForSdk = preset === 'SSS_1' ? Preset.SSS_1 : Preset.SSS_2;
  const authorityKeypair = wallet.payer;

  if (authorityKeypair) {
    const stable = await SolanaStablecoin.create({
      connection,
      authority: authorityKeypair,
      name: name.trim(),
      symbol: symbol.trim(),
      uri: uri?.trim() || '',
      decimals,
      preset: presetForSdk,
    });

    return {
      mint: stable.mint.toBase58(),
      txSig: '',
      enablePD,
      enableTH,
    };
  }

  const mintKeypair = Keypair.generate();
  const [statePDA] = findStatePDA(mintKeypair.publicKey);
  const [mintAuthority] = findMintAuthorityPDA(statePDA);
  const [freezeAuthority] = findFreezeAuthorityPDA(statePDA);
  const [permanentDelegate] = findPermanentDelegatePDA(statePDA);

  const extensions: ExtensionType[] = [ExtensionType.MetadataPointer, ExtensionType.MintCloseAuthority];
  if (enablePD) extensions.push(ExtensionType.PermanentDelegate);
  if (enableTH) extensions.push(ExtensionType.TransferHook);

  const mintLen = getMintLen(extensions);
  const lamports = await connection.getMinimumBalanceForRentExemption(mintLen);

  const tx = new Transaction();

  tx.add(
    SystemProgram.createAccount({
      fromPubkey: wallet.publicKey,
      newAccountPubkey: mintKeypair.publicKey,
      space: mintLen,
      lamports,
      programId: TOKEN_2022_PROGRAM_ID,
    })
  );

  tx.add(
    createInitializeMetadataPointerInstruction(
      mintKeypair.publicKey,
      wallet.publicKey,
      mintKeypair.publicKey,
      TOKEN_2022_PROGRAM_ID
    )
  );

  tx.add(
    createInitializeMintCloseAuthorityInstruction(
      mintKeypair.publicKey,
      wallet.publicKey,
      TOKEN_2022_PROGRAM_ID
    )
  );

  if (enablePD) {
    tx.add(
      createInitializePermanentDelegateInstruction(
        mintKeypair.publicKey,
        permanentDelegate,
        TOKEN_2022_PROGRAM_ID
      )
    );
  }

  if (enableTH) {
    tx.add(
      createInitializeTransferHookInstruction(
        mintKeypair.publicKey,
        wallet.publicKey,
        TRANSFER_HOOK_PROGRAM_ID,
        TOKEN_2022_PROGRAM_ID
      )
    );
  }

  tx.add(
    createInitializeMintInstruction(
      mintKeypair.publicKey,
      decimals,
      mintAuthority,
      freezeAuthority,
      TOKEN_2022_PROGRAM_ID
    )
  );

  tx.feePayer = wallet.publicKey;
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  tx.partialSign(mintKeypair);

  const signedTx = await wallet.signTransaction(tx);
  const mintTxSig = await connection.sendRawTransaction(signedTx.serialize());
  await connection.confirmTransaction(mintTxSig, 'confirmed');

  const provider = new AnchorProvider(connection, wallet as any, { commitment: 'confirmed' });
  const program = new Program(getIDL(), provider);

  const initTxSig = await program.methods
    .initialize({
      name: name.trim(),
      symbol: symbol.trim(),
      uri: uri?.trim() || '',
      decimals,
      enablePermanentDelegate: enablePD,
      enableTransferHook: enableTH,
      defaultAccountFrozen: false,
      transferHookProgramId: enableTH ? TRANSFER_HOOK_PROGRAM_ID : null,
    })
    .accounts({
      masterAuthority: wallet.publicKey,
      state: statePDA,
      mint: mintKeypair.publicKey,
      systemProgram: SystemProgram.programId,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
      rent: new PublicKey('SysvarRent111111111111111111111111111111111'),
    })
    .signers([mintKeypair])
    .rpc();

  return {
    mint: mintKeypair.publicKey.toBase58(),
    txSig: initTxSig,
    enablePD,
    enableTH,
  };
}

export function subscribeStablecoinEvents(
  connection: Connection,
  mint: PublicKey,
  onEvent: (event: ParsedEvent) => void,
  onError?: (error: Error) => void,
): number {
  const { programId, parser } = idlParser();

  return connection.onLogs(
    programId,
    (logs: Logs) => {
      try {
        for (const parsed of parser.parseLogs(logs.logs)) {
          const data = parsed.data as Record<string, unknown>;
          if (!mintMatches(data, mint)) continue;

          onEvent({
            name: parsed.name,
            signature: logs.signature,
            timestamp: Date.now(),
            summary: summarize(parsed.name, data),
          });
        }
      } catch (error) {
        onError?.(error as Error);
      }
    },
    'confirmed',
  );
}

export async function fetchRecentStablecoinEvents(
  connection: Connection,
  mint: PublicKey,
  limit = 30,
): Promise<ParsedEvent[]> {
  const signatures = await connection.getSignaturesForAddress(mint, { limit });
  const { parser } = idlParser();
  const events: ParsedEvent[] = [];

  for (const sigInfo of signatures) {
    const tx = await connection.getTransaction(sigInfo.signature, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0,
    });
    const logs = tx?.meta?.logMessages;
    if (!logs) continue;

    for (const parsed of parser.parseLogs(logs)) {
      const data = parsed.data as Record<string, unknown>;
      if (!mintMatches(data, mint)) continue;

      events.push({
        name: parsed.name,
        signature: sigInfo.signature,
        slot: sigInfo.slot,
        timestamp: sigInfo.blockTime ?? undefined,
        summary: summarize(parsed.name, data),
      });
    }
  }

  return events.slice(0, limit);
}

export type { ParsedEvent };
