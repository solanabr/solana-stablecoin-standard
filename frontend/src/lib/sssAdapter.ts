import {
  TOKEN_2022_PROGRAM_ID,
  getTokenMetadata,
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token';
import {
  Connection,
  Keypair,
  ParsedAccountData,
  PublicKey,
  TransactionSignature,
  Transaction,
  VersionedTransaction,
  clusterApiUrl,
} from '@solana/web3.js';
import { Presets, SolanaStablecoin } from '@stbr/sss-token';
import type {
  CreateStablecoinFormValues,
  Environment,
  HolderRecord,
  Lockfile,
  LogEntry,
  MinterRecord,
  Preset,
  StablecoinSummary,
} from '../app/types';
import { DEFAULT_RPC_URL } from '../app/constants';

type WalletAuthority = {
  publicKey: PublicKey;
  signTransaction: <T extends Transaction | VersionedTransaction>(tx: T) => Promise<T>;
  signAllTransactions: <T extends Transaction | VersionedTransaction>(txs: T[]) => Promise<T[]>;
  payer: Keypair;
};

type TransactionAuthority = Keypair | WalletAuthority;

interface RuntimeContext {
  environment: Environment;
  rpcUrl: string;
  authority?: TransactionAuthority | null;
}

export interface ActiveSession {
  connection: Connection;
  authority: TransactionAuthority;
  client: SolanaStablecoin;
  lockfile: Lockfile;
}

function rpcUrlForEnvironment(environment: Environment, rpcUrl?: string): string {
  if (rpcUrl && rpcUrl.trim().length > 0) {
    return rpcUrl.trim();
  }
  if (environment === 'devnet') {
    return DEFAULT_RPC_URL;
  }
  if (environment === 'localnet') {
    return 'http://127.0.0.1:8899';
  }
  return clusterApiUrl(environment);
}

function asPreset(preset: Preset): Presets | null {
  switch (preset) {
    case 'SSS-1':
      return Presets.SSS_1;
    case 'SSS-2':
      return Presets.SSS_2;
    default:
      return null;
  }
}

function requireAuthority(authority?: TransactionAuthority | null): TransactionAuthority {
  if (authority) {
    return authority;
  }
  throw new Error('Connect a wallet or import an operator keypair to execute transactions.');
}

function createConnection(runtime: RuntimeContext): Connection {
  return new Connection(rpcUrlForEnvironment(runtime.environment, runtime.rpcUrl), 'confirmed');
}

function presetLabelFromConfig(compliance: boolean, transferHook: boolean): Preset {
  if (!compliance && !transferHook) {
    return 'SSS-1';
  }
  if (compliance && transferHook) {
    return 'SSS-2';
  }
  return 'Custom';
}

function readU64LE(data: Buffer | Uint8Array, offset: number): bigint {
  let value = 0n;
  for (let index = 7; index >= 0; index -= 1) {
    value = (value << 8n) | BigInt(data[offset + index] ?? 0);
  }
  return value;
}

function readI64LE(data: Buffer | Uint8Array, offset: number): bigint {
  const value = readU64LE(data, offset);
  return value > 0x7fff_ffff_ffff_ffffn ? value - 0x1_0000_0000_0000_0000n : value;
}

function compareBigintsDesc(left: bigint, right: bigint): number {
  if (left === right) {
    return 0;
  }
  return left > right ? -1 : 1;
}

function metadataFromLockfile(lockfile: Lockfile, fallbackPreset: Preset) {
  return {
    preset: lockfile.preset ?? fallbackPreset,
    name: lockfile.name ?? 'Stablecoin',
    symbol: lockfile.symbol ?? 'SSS',
    uri: lockfile.uri ?? 'Unavailable on-chain',
    decimals: lockfile.decimals,
    treasury: lockfile.treasury,
    complianceEnabled: lockfile.complianceEnabled,
    transferHookEnabled: lockfile.transferHookEnabled,
  };
}

function isRpcIndexingError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes('excluded from account secondary indexes') ||
    message.includes('429') ||
    message.toLowerCase().includes('too many requests')
  );
}

export class SssAdapter {
  async loadFromLockfile(lockfile: Lockfile, runtime: RuntimeContext): Promise<{
    session: ActiveSession;
    summary: StablecoinSummary;
  }> {
    const connection = createConnection(runtime);
    const authority = runtime.authority ?? Keypair.generate();
    const client = SolanaStablecoin.fromExisting({
      connection,
      payer: authority,
      mint: new PublicKey(lockfile.mint),
      stablecoinProgramId: new PublicKey(lockfile.stablecoinProgramId),
      transferHookProgramId: new PublicKey(lockfile.transferHookProgramId),
    });

    const session = { connection, authority, client, lockfile };
    const summary = await this.getStatus(session);
    return { session, summary };
  }

  async createStablecoin(
    input: CreateStablecoinFormValues,
    runtime: RuntimeContext,
  ): Promise<{ session: ActiveSession; summary: StablecoinSummary }> {
    const authority = requireAuthority(runtime.authority);
    const connection = createConnection(runtime);
    const preset = asPreset(input.preset);
    const treasuryAddress =
      input.treasury.trim().length > 0 ? input.treasury.trim() : authority.publicKey.toBase58();

    const client =
      preset !== null
        ? await SolanaStablecoin.create(connection, {
            payer: authority,
            preset,
            name: input.name,
            symbol: input.symbol,
            uri: input.uri,
            decimals: input.decimals,
            treasury: new PublicKey(treasuryAddress),
            initialMinterQuota: BigInt(input.initialMinterQuota),
            initialMinterWindowSeconds: Number(input.initialMinterWindowSeconds),
          })
        : await SolanaStablecoin.create(connection, {
            payer: authority,
            name: input.name,
            symbol: input.symbol,
            uri: input.uri,
            decimals: input.decimals,
            extensions: {
              enableCompliance: input.enableCompliance,
              enablePermanentDelegate: input.enablePermanentDelegate,
              enableTransferHook: input.enableTransferHook,
              defaultAccountFrozen: input.defaultAccountFrozen,
              seizeRequiresBlacklist: input.seizeRequiresBlacklist,
            },
            roles: {
              treasury: new PublicKey(treasuryAddress),
            },
            initialMinterQuota: BigInt(input.initialMinterQuota),
            initialMinterWindowSeconds: Number(input.initialMinterWindowSeconds),
          });

    const config = await client.getConfig();
    const lockfile: Lockfile = {
      version: 1,
      rpcUrl: rpcUrlForEnvironment(runtime.environment, runtime.rpcUrl),
      stablecoinProgramId: client.stablecoinProgramId.toBase58(),
      transferHookProgramId: client.transferHookProgramId.toBase58(),
      mint: client.addresses.mint.toBase58(),
      config: client.addresses.config.toBase58(),
      masterMinterRole: client.addresses.masterMinterRole.toBase58(),
      transferHookConfig: client.addresses.transferHookConfig?.toBase58(),
      extraAccountMetaList: client.addresses.extraAccountMetaList?.toBase58(),
      createdAt: new Date().toISOString(),
      preset: input.preset,
      name: input.name,
      symbol: input.symbol,
      uri: input.uri,
      decimals: input.decimals,
      treasury: config.treasury.toBase58(),
      complianceEnabled: config.complianceEnabled,
      transferHookEnabled: config.transferHookEnabled,
    };

    const session = { connection, authority, client, lockfile };
    const summary = await this.getStatus(session);
    return { session, summary };
  }

  async getStatus(session: ActiveSession): Promise<StablecoinSummary> {
    const config = await session.client.getConfig();
    const supply = await session.client.getSupply();
    const onchainMetadata = await getTokenMetadata(
      session.connection,
      session.client.addresses.mint,
      'confirmed',
      TOKEN_2022_PROGRAM_ID,
    );
    const metadata = metadataFromLockfile(
      session.lockfile,
      presetLabelFromConfig(config.complianceEnabled, config.transferHookEnabled),
    );

    return {
      address: session.client.addresses.mint.toBase58(),
      configAddress: session.client.addresses.config.toBase58(),
      masterAuthority: config.masterAuthority.toBase58(),
      preset: metadata.preset,
      name: onchainMetadata?.name ?? metadata.name,
      symbol: onchainMetadata?.symbol ?? metadata.symbol,
      uri: onchainMetadata?.uri ?? metadata.uri,
      decimals: metadata.decimals ?? config.decimals,
      treasury: metadata.treasury ?? config.treasury.toBase58(),
      complianceEnabled: metadata.complianceEnabled ?? config.complianceEnabled,
      transferHookEnabled: metadata.transferHookEnabled ?? config.transferHookEnabled,
      paused: config.paused,
      supply,
      minterQuota: 0n,
      minterWindow: 0,
      transferHookConfig: session.client.addresses.transferHookConfig?.toBase58(),
      extraAccountMetaList: session.client.addresses.extraAccountMetaList?.toBase58(),
    };
  }

  async mint(session: ActiveSession, recipient: string, amount: bigint): Promise<string> {
    const recipientTokenAccount = await this.resolveTokenAccount(
      session,
      recipient,
      session.client.addresses.mint,
    );

    return session.client.mint({
      authority: session.authority,
      recipientTokenAccount,
      amount,
    });
  }

  async burn(session: ActiveSession, fromTokenAccount: string, amount: bigint): Promise<string> {
    return session.client.burn({
      authority: session.authority,
      fromTokenAccount: new PublicKey(fromTokenAccount),
      amount,
    });
  }

  async freeze(session: ActiveSession, tokenAccount: string): Promise<string> {
    return session.client.freeze({
      authority: session.authority,
      tokenAccount: new PublicKey(tokenAccount),
    });
  }

  async thaw(session: ActiveSession, tokenAccount: string): Promise<string> {
    return session.client.thaw({
      authority: session.authority,
      tokenAccount: new PublicKey(tokenAccount),
    });
  }

  async pause(session: ActiveSession): Promise<string> {
    return session.client.pause(session.authority);
  }

  async unpause(session: ActiveSession): Promise<string> {
    return session.client.unpause(session.authority);
  }

  async addMinter(
    session: ActiveSession,
    minter: string,
    quotaAmount: bigint,
    windowSeconds: number,
  ): Promise<string> {
    return session.client.updateMinter(session.authority, {
      minter: new PublicKey(minter),
      active: true,
      quotaAmount,
      windowSeconds,
      resetWindow: true,
    });
  }

  async removeMinter(session: ActiveSession, minter: string): Promise<string> {
    return session.client.updateMinter(session.authority, {
      minter: new PublicKey(minter),
      active: false,
      quotaAmount: 0n,
      windowSeconds: 1,
      resetWindow: true,
    });
  }

  async blacklistAdd(session: ActiveSession, wallet: string, reason: string): Promise<string> {
    return session.client.compliance.blacklistAdd(session.authority, new PublicKey(wallet), reason);
  }

  async blacklistRemove(session: ActiveSession, wallet: string): Promise<string> {
    return session.client.compliance.blacklistRemove(session.authority, new PublicKey(wallet));
  }

  async seize(
    session: ActiveSession,
    sourceTokenAccount: string,
    sourceOwner: string,
    destinationTokenAccount: string,
    amount: bigint,
  ): Promise<string> {
    return session.client.compliance.seize({
      authority: session.authority,
      sourceTokenAccount: new PublicKey(sourceTokenAccount),
      destinationTokenAccount: new PublicKey(destinationTokenAccount),
      sourceOwner: new PublicKey(sourceOwner),
      amount,
    });
  }

  async listHolders(session: ActiveSession): Promise<HolderRecord[]> {
    try {
      const accounts = await session.connection.getParsedProgramAccounts(TOKEN_2022_PROGRAM_ID, {
        filters: [{ memcmp: { offset: 0, bytes: session.client.addresses.mint.toBase58() } }],
      });

      const holders = await Promise.all(
        accounts
          .filter((entry) => {
            const parsed = entry.account.data as ParsedAccountData;
            return parsed.program === 'spl-token' && parsed.parsed.type === 'account';
          })
          .slice(0, 50)
          .map(async (entry) => {
            const parsed = entry.account.data as ParsedAccountData;
            const info = parsed.parsed.info;
            const owner = new PublicKey(String(info.owner));
            const complianceRecord = SolanaStablecoin.deriveComplianceRecordPda(
              session.client.addresses.mint,
              owner,
              session.client.stablecoinProgramId,
            );
            const compliance = await session.connection.getAccountInfo(complianceRecord, 'confirmed');
            const isBlacklisted = Boolean(compliance?.data?.[73]);

            return {
              tokenAccount: entry.pubkey.toBase58(),
              owner: owner.toBase58(),
              balance: BigInt(info.tokenAmount.amount),
              isBlacklisted,
              isFrozen: info.state === 'frozen',
            } satisfies HolderRecord;
          }),
      );

      return holders.sort((left, right) => compareBigintsDesc(left.balance, right.balance));
    } catch (error) {
      if (isRpcIndexingError(error)) {
        return [];
      }
      throw error;
    }
  }

  async listMinters(session: ActiveSession): Promise<MinterRecord[]> {
    const accounts = await session.connection.getProgramAccounts(session.client.stablecoinProgramId, {
      filters: [
        { dataSize: 106 },
        { memcmp: { offset: 9, bytes: session.client.addresses.config.toBase58() } },
      ],
    });

    return accounts
      .map((entry) => {
        const data = entry.account.data;
        return {
          address: new PublicKey(data.slice(41, 73)).toBase58(),
          active: data[73] === 1,
          quota: readU64LE(data, 74),
          minted: readU64LE(data, 98),
          windowSeconds: Number(readI64LE(data, 82)),
        } satisfies MinterRecord;
      })
      .sort((left, right) => compareBigintsDesc(left.quota, right.quota));
  }

  async getAuditLog(session: ActiveSession, limit = 30): Promise<LogEntry[]> {
    try {
      const signatures = await session.connection.getSignaturesForAddress(
        session.client.stablecoinProgramId,
        { limit },
        'confirmed',
      );

      const rows = await Promise.all(
        signatures.map(async (item, index) => {
          const tx = await session.connection.getTransaction(item.signature, {
            maxSupportedTransactionVersion: 0,
          });
          const log =
            tx?.meta?.logMessages?.find((line) => line.includes('Program log:')) ?? 'Program event';

          return {
            id: `${item.signature}-${index}`,
            timestamp: new Date((item.blockTime ?? 0) * 1000),
            action: log.replace('Program log: ', ''),
            details: `Slot ${item.slot}`,
            actor: session.client.stablecoinProgramId.toBase58(),
            status: item.err ? 'failed' : 'success',
            signature: item.signature,
          } satisfies LogEntry;
        }),
      );

      return rows;
    } catch (error) {
      if (isRpcIndexingError(error)) {
        return [];
      }
      throw error;
    }
  }

  private async resolveTokenAccount(
    session: ActiveSession,
    input: string,
    mint: PublicKey,
  ): Promise<PublicKey> {
    const pubkey = new PublicKey(input);
    const accountInfo = await session.connection.getAccountInfo(pubkey, 'confirmed');

    if (accountInfo && accountInfo.owner.equals(TOKEN_2022_PROGRAM_ID)) {
      return pubkey;
    }

    const ata = getAssociatedTokenAddressSync(mint, pubkey, false, TOKEN_2022_PROGRAM_ID);
    const ix = createAssociatedTokenAccountIdempotentInstruction(
      session.authority.publicKey,
      ata,
      pubkey,
      mint,
      TOKEN_2022_PROGRAM_ID,
    );

    const transaction = new Transaction().add(ix);
    transaction.feePayer = session.authority.publicKey;
    const { blockhash, lastValidBlockHeight } = await session.connection.getLatestBlockhash('confirmed');
    transaction.recentBlockhash = blockhash;

    if ('secretKey' in session.authority) {
      transaction.partialSign(session.authority);
      const signature: TransactionSignature = await session.connection.sendRawTransaction(
        transaction.serialize(),
      );
      await session.connection.confirmTransaction(
        { signature, blockhash, lastValidBlockHeight },
        'confirmed',
      );
    } else {
      const signed = await session.authority.signTransaction(transaction);
      const signature: TransactionSignature = await session.connection.sendRawTransaction(
        signed.serialize(),
      );
      await session.connection.confirmTransaction(
        { signature, blockhash, lastValidBlockHeight },
        'confirmed',
      );
    }

    return ata;
  }
}

export const sssAdapter = new SssAdapter();
