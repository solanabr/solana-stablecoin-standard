#!/usr/bin/env node
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  getAccount,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token';
import { Presets, SolanaStablecoin } from '@stbr/sss-token';
import {
  Connection,
  Keypair,
  ParsedAccountData,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import { Command } from 'commander';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { stdin as input, stdout as output } from 'node:process';
import toml from 'toml';

const LOCKFILE_NAME = 'sss.lock.json';

interface Lockfile {
  version: number;
  rpcUrl: string;
  stablecoinProgramId: string;
  transferHookProgramId: string;
  mint: string;
  config: string;
  masterMinterRole: string;
  transferHookConfig?: string;
  extraAccountMetaList?: string;
  createdAt: string;
}

interface HolderRow {
  tokenAccount: string;
  owner: string;
  amount: string;
}

interface MinterRow {
  rolePda: string;
  authority: string;
  active: boolean;
  quotaAmount: string;
  windowSeconds: number;
  mintedInWindow: string;
}

interface AuditRow {
  signature: string;
  slot: string;
  when: string;
  log: string;
}

function settledError(result: PromiseSettledResult<unknown>): string {
  if (result.status !== 'rejected') {
    return 'unknown error';
  }

  return result.reason instanceof Error ? result.reason.message : String(result.reason);
}

function parsePubkey(value: string, fieldName: string): PublicKey {
  try {
    return new PublicKey(value);
  } catch {
    throw new Error(`Invalid ${fieldName}: ${value}`);
  }
}

function resolveKeypairPath(input?: string): string {
  if (input) {
    return input;
  }

  return path.join(os.homedir(), '.config/solana/id.json');
}

function loadKeypair(filePath: string): Keypair {
  const raw = fs.readFileSync(filePath, 'utf8');
  const secret = Uint8Array.from(JSON.parse(raw) as number[]);
  return Keypair.fromSecretKey(secret);
}

function loadLockfile(lockfilePath = path.join(process.cwd(), LOCKFILE_NAME)): Lockfile {
  const raw = fs.readFileSync(lockfilePath, 'utf8');
  return JSON.parse(raw) as Lockfile;
}

function writeLockfile(
  lockfile: Lockfile,
  lockfilePath = path.join(process.cwd(), LOCKFILE_NAME),
): void {
  fs.writeFileSync(lockfilePath, `${JSON.stringify(lockfile, null, 2)}\n`, 'utf8');
}

function parseAmount(amount: string): bigint {
  if (!/^\d+$/.test(amount)) {
    throw new Error(`Amount must be an integer in base units: ${amount}`);
  }
  return BigInt(amount);
}

function shorten(value: string, head = 4, tail = 4): string {
  if (value.length <= head + tail + 3) {
    return value;
  }

  return `${value.slice(0, head)}...${value.slice(-tail)}`;
}

function formatBigint(value: bigint | string | number): string {
  const normalized =
    typeof value === 'bigint' ? value : typeof value === 'number' ? BigInt(value) : BigInt(value);
  return normalized.toString();
}

async function fetchMinters(params: {
  connection: Connection;
  lockfile: Lockfile;
}): Promise<MinterRow[]> {
  const programId = new PublicKey(params.lockfile.stablecoinProgramId);
  const config = new PublicKey(params.lockfile.config);
  try {
    const accounts = await params.connection.getProgramAccounts(programId, {
      filters: [
        { dataSize: 106 },
        { memcmp: { offset: 9, bytes: config.toBase58() } },
      ],
    });

    return accounts
      .filter((entry) => entry.account.data.length >= 106)
      .map((entry) => {
        const data = entry.account.data;
        const authority = new PublicKey(data.subarray(41, 73));
        const active = data[73] === 1;
        const quotaAmount = data.readBigUInt64LE(74);
        const windowSeconds = Number(data.readBigInt64LE(82));
        const mintedInWindow = data.readBigUInt64LE(98);

        return {
          rolePda: entry.pubkey.toBase58(),
          authority: authority.toBase58(),
          active,
          quotaAmount: quotaAmount.toString(),
          windowSeconds,
          mintedInWindow: mintedInWindow.toString(),
        };
      });
  } catch {
    return [];
  }
}

async function fetchHolders(params: {
  connection: Connection;
  mint: PublicKey;
  minBalance?: bigint;
}): Promise<HolderRow[]> {
  const minBalance = params.minBalance ?? 0n;
  try {
    const parsedAccounts = await params.connection.getParsedProgramAccounts(TOKEN_2022_PROGRAM_ID, {
      filters: [{ memcmp: { offset: 0, bytes: params.mint.toBase58() } }],
    });

    return parsedAccounts
      .map((entry) => {
        if (!('parsed' in entry.account.data)) {
          return null;
        }

        const parsed = (entry.account.data as ParsedAccountData).parsed?.info as
          | { owner?: string; tokenAmount?: { amount?: string } }
          | undefined;
        if (!parsed?.tokenAmount?.amount) {
          return null;
        }

        const amount = BigInt(parsed.tokenAmount.amount as string);
        if (amount < minBalance) {
          return null;
        }

        return {
          tokenAccount: entry.pubkey.toBase58(),
          owner: parsed.owner as string,
          amount: amount.toString(),
        };
      })
      .filter((entry): entry is HolderRow => Boolean(entry))
      .sort((left, right) => {
        const leftAmount = BigInt(left.amount);
        const rightAmount = BigInt(right.amount);
        if (leftAmount === rightAmount) {
          return left.owner.localeCompare(right.owner);
        }
        return leftAmount > rightAmount ? -1 : 1;
      });
  } catch {
    const largest = await params.connection.getTokenLargestAccounts(params.mint, 'confirmed');
    const rows: HolderRow[] = [];

    for (const entry of largest.value) {
      const amount = BigInt(entry.amount);
      if (amount < minBalance) {
        continue;
      }

      try {
        const tokenAccount = await getAccount(
          params.connection,
          entry.address,
          'confirmed',
          TOKEN_2022_PROGRAM_ID,
        );
        rows.push({
          tokenAccount: entry.address.toBase58(),
          owner: tokenAccount.owner.toBase58(),
          amount: amount.toString(),
        });
      } catch {
        rows.push({
          tokenAccount: entry.address.toBase58(),
          owner: 'unknown',
          amount: amount.toString(),
        });
      }
    }

    return rows;
  }
}

async function fetchAuditRows(params: {
  connection: Connection;
  lockfile: Lockfile;
  limit?: number;
}): Promise<AuditRow[]> {
  const programId = new PublicKey(params.lockfile.stablecoinProgramId);
  const signatures = await params.connection.getSignaturesForAddress(programId, {
    limit: params.limit ?? 8,
  });

  const rows: AuditRow[] = [];

  for (const item of signatures) {
    const tx = await params.connection.getTransaction(item.signature, {
      maxSupportedTransactionVersion: 0,
    });
    const logs = tx?.meta?.logMessages ?? [];
    const hit = logs.find((line) => line.includes('Program log:'));

    if (!hit) {
      continue;
    }

    rows.push({
      signature: item.signature,
      slot: String(item.slot),
      when: item.blockTime ? new Date(item.blockTime * 1000).toISOString() : 'unknown',
      log: hit.replace('Program log: ', ''),
    });
  }

  return rows;
}

async function resolveTokenAccountForMint(
  connection: Connection,
  addressOrOwner: PublicKey,
  mint: PublicKey,
): Promise<PublicKey> {
  try {
    const token = await getAccount(connection, addressOrOwner, 'confirmed', TOKEN_2022_PROGRAM_ID);
    if (!token.mint.equals(mint)) {
      throw new Error('Token account mint mismatch');
    }
    return addressOrOwner;
  } catch {
    return getAssociatedTokenAddressSync(
      mint,
      addressOrOwner,
      false,
      TOKEN_2022_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID,
    );
  }
}

async function resolveOrCreateTokenAccount(
  connection: Connection,
  payer: Keypair,
  addressOrOwner: PublicKey,
  mint: PublicKey,
): Promise<PublicKey> {
  try {
    const token = await getAccount(connection, addressOrOwner, 'confirmed', TOKEN_2022_PROGRAM_ID);
    if (!token.mint.equals(mint)) {
      throw new Error('Token account mint mismatch');
    }
    return addressOrOwner;
  } catch {
    const ata = getAssociatedTokenAddressSync(
      mint,
      addressOrOwner,
      false,
      TOKEN_2022_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID,
    );
    const ix = createAssociatedTokenAccountIdempotentInstruction(
      payer.publicKey,
      ata,
      addressOrOwner,
      mint,
      TOKEN_2022_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID,
    );
    await sendAndConfirmTransaction(connection, new Transaction().add(ix), [payer]);
    return ata;
  }
}

async function buildClientFromLock(params: {
  rpcUrl: string;
  keypairPath?: string;
  lockfilePath?: string;
}): Promise<{
  client: SolanaStablecoin;
  payer: Keypair;
  lockfile: Lockfile;
  connection: Connection;
}> {
  const lockfile = loadLockfile(params.lockfilePath);
  const payer = loadKeypair(resolveKeypairPath(params.keypairPath));
  const connection = new Connection(params.rpcUrl || lockfile.rpcUrl, 'confirmed');
  const client = SolanaStablecoin.fromExisting({
    connection,
    payer,
    mint: new PublicKey(lockfile.mint),
    stablecoinProgramId: new PublicKey(lockfile.stablecoinProgramId),
    transferHookProgramId: new PublicKey(lockfile.transferHookProgramId),
  });

  return { client, payer, lockfile, connection };
}

async function launchTui(params: {
  rpcUrl: string;
  keypairPath?: string;
  lockfilePath?: string;
}): Promise<void> {
  const { client, payer, lockfile, connection } = await buildClientFromLock(params);
  const rl = readline.createInterface({ input, output });

  let isPrompting = false;
  let refreshing = false;
  let shouldExit = false;
  let lastMessage = 'Connected';
  let refreshTimer: NodeJS.Timeout | undefined;

  const stopRawMode = () => {
    if (input.isTTY) {
      input.setRawMode(false);
    }
  };

  const startRawMode = () => {
    if (input.isTTY) {
      input.setRawMode(true);
    }
  };

  const ask = async (question: string): Promise<string> => {
    isPrompting = true;
    stopRawMode();
    try {
      return await new Promise((resolve) => rl.question(question, resolve));
    } finally {
      startRawMode();
      isPrompting = false;
    }
  };

  const render = async () => {
    if (refreshing || shouldExit) {
      return;
    }

    refreshing = true;
    try {
      const [configResult, supplyResult, metadataResult, mintersResult, holdersResult, auditResult] =
        await Promise.allSettled([
          client.getConfig(),
          client.getSupply(),
          client.getMetadata(),
          fetchMinters({ connection, lockfile }),
          fetchHolders({ connection, mint: client.addresses.mint }),
          fetchAuditRows({ connection, lockfile, limit: 8 }),
        ]);

      if (configResult.status !== 'fulfilled' || supplyResult.status !== 'fulfilled') {
        throw new Error(
          configResult.status === 'rejected'
            ? settledError(configResult)
            : settledError(supplyResult),
        );
      }

      const config = configResult.value;
      const supply = supplyResult.value;
      const metadata = metadataResult.status === 'fulfilled' ? metadataResult.value : null;
      const minters = mintersResult.status === 'fulfilled' ? mintersResult.value : [];
      const holders = holdersResult.status === 'fulfilled' ? holdersResult.value : [];
      const audit = auditResult.status === 'fulfilled' ? auditResult.value : [];

      const lines: string[] = [];
      lines.push('\x1Bc');
      lines.push('SSS Admin TUI');
      lines.push('');
      lines.push(`RPC:        ${params.rpcUrl || lockfile.rpcUrl}`);
      lines.push(`Operator:   ${payer.publicKey.toBase58()}`);
      lines.push(`Mint:       ${client.addresses.mint.toBase58()}`);
      lines.push(`Config:     ${client.addresses.config.toBase58()}`);
      lines.push(`Preset:     ${config.preset === 0 ? 'SSS-1' : 'SSS-2'}`);
      lines.push(`Paused:     ${config.paused ? 'yes' : 'no'}`);
      lines.push(`Compliance: ${config.complianceEnabled ? 'enabled' : 'disabled'}`);
      lines.push(`Hook:       ${config.transferHookEnabled ? 'enabled' : 'disabled'}`);
      lines.push(`Supply:     ${formatBigint(supply)}`);
      if (metadata) {
        lines.push(`Metadata:   ${metadata.name} (${metadata.symbol})`);
        lines.push(`URI:        ${metadata.uri}`);
      }
      lines.push('');
      lines.push('Actions');
      lines.push('  r refresh   p pause/unpause   m mint   b burn   f freeze   t thaw');
      lines.push('  k blacklist add   u blacklist remove   s seize   a add minter   x remove minter   q quit');
      lines.push('');
      lines.push('Minters');
      for (const row of minters.slice(0, 6)) {
        lines.push(
          `  ${shorten(row.authority)}  active=${row.active ? 'yes' : 'no '}  quota=${row.quotaAmount}  minted=${row.mintedInWindow}`,
        );
      }
      if (minters.length === 0) {
        lines.push('  none');
      }
      lines.push('');
      lines.push('Top Holders');
      for (const row of holders.slice(0, 8)) {
        lines.push(`  ${shorten(row.owner)}  amount=${row.amount}  ata=${shorten(row.tokenAccount)}`);
      }
      if (holders.length === 0) {
        lines.push('  none');
      }
      lines.push('');
      lines.push('Recent Logs');
      for (const row of audit.slice(0, 8)) {
        lines.push(`  ${shorten(row.signature, 6, 6)}  ${row.log}`);
      }
      if (audit.length === 0) {
        lines.push('  none');
      }
      lines.push('');
      lines.push(`Status: ${lastMessage}`);

      output.write(`${lines.join('\n')}\n`);
    } catch (error) {
      lastMessage = error instanceof Error ? error.message : String(error);
      output.write(`\x1BcSSS Admin TUI\n\nStatus: ${lastMessage}\n`);
    } finally {
      refreshing = false;
    }
  };

  const withAction = async (label: string, fn: () => Promise<string | void>) => {
    try {
      lastMessage = `${label} running...`;
      await render();
      const result = await fn();
      lastMessage = result ? `${label}: ${result}` : `${label}: ok`;
    } catch (error) {
      lastMessage = `${label} failed: ${error instanceof Error ? error.message : String(error)}`;
    } finally {
      await render();
    }
  };

  const handleKey = async (chunk: Buffer) => {
    if (isPrompting) {
      return;
    }

    const key = chunk.toString('utf8');
    if (key === 'q' || key === '\u0003') {
      shouldExit = true;
      if (refreshTimer) {
        clearInterval(refreshTimer);
      }
      stopRawMode();
      rl.close();
      output.write('\n');
      process.exit(0);
    }

    if (key === 'r') {
      await render();
      return;
    }

    if (key === 'p') {
      await withAction('pause-toggle', async () => {
        const config = await client.getConfig();
        return config.paused ? client.unpause(payer) : client.pause(payer);
      });
      return;
    }

    if (key === 'm') {
      const recipient = await ask('Recipient wallet or token account: ');
      const amount = await ask('Mint amount (base units): ');
      await withAction('mint', async () => {
        const recipientKey = parsePubkey(recipient.trim(), 'recipient');
        const recipientTokenAccount = await resolveOrCreateTokenAccount(
          connection,
          payer,
          recipientKey,
          client.addresses.mint,
        );
        return client.mint({
          authority: payer,
          recipientTokenAccount,
          amount: parseAmount(amount.trim()),
        });
      });
      return;
    }

    if (key === 'b') {
      const from = await ask('Source wallet or token account (blank=signer ATA): ');
      const amount = await ask('Burn amount (base units): ');
      await withAction('burn', async () => {
        const fromTokenAccount = from.trim()
          ? await resolveTokenAccountForMint(
              connection,
              parsePubkey(from.trim(), 'from'),
              client.addresses.mint,
            )
          : await resolveTokenAccountForMint(connection, payer.publicKey, client.addresses.mint);
        return client.burn({
          authority: payer,
          fromTokenAccount,
          amount: parseAmount(amount.trim()),
        });
      });
      return;
    }

    if (key === 'f' || key === 't') {
      const target = await ask('Wallet or token account: ');
      await withAction(key === 'f' ? 'freeze' : 'thaw', async () => {
        const tokenAccount = await resolveTokenAccountForMint(
          connection,
          parsePubkey(target.trim(), 'target'),
          client.addresses.mint,
        );
        return key === 'f'
          ? client.freeze({ authority: payer, tokenAccount })
          : client.thaw({ authority: payer, tokenAccount });
      });
      return;
    }

    if (key === 'k' || key === 'u') {
      const address = await ask('Wallet address: ');
      const reason = key === 'k' ? await ask('Reason: ') : '';
      await withAction(key === 'k' ? 'blacklist-add' : 'blacklist-remove', async () => {
        const wallet = parsePubkey(address.trim(), 'wallet');
        return key === 'k'
          ? client.compliance.blacklistAdd(payer, wallet, reason.trim() || 'manual_review')
          : client.compliance.blacklistRemove(payer, wallet);
      });
      return;
    }

    if (key === 's') {
      const source = await ask('Source wallet or token account: ');
      const destination = await ask('Destination treasury token account: ');
      const amount = await ask('Seize amount (base units): ');
      await withAction('seize', async () => {
        const sourceTokenAccount = await resolveTokenAccountForMint(
          connection,
          parsePubkey(source.trim(), 'source'),
          client.addresses.mint,
        );
        const sourceAccount = await getAccount(
          connection,
          sourceTokenAccount,
          'confirmed',
          TOKEN_2022_PROGRAM_ID,
        );
        return client.compliance.seize({
          authority: payer,
          sourceTokenAccount,
          destinationTokenAccount: parsePubkey(destination.trim(), 'destination'),
          sourceOwner: sourceAccount.owner,
          amount: parseAmount(amount.trim()),
        });
      });
      return;
    }

    if (key === 'a' || key === 'x') {
      const address = await ask('Minter wallet: ');
      const quota = key === 'a' ? await ask('Quota (base units): ') : '0';
      const window = key === 'a' ? await ask('Window seconds: ') : '1';
      await withAction(key === 'a' ? 'add-minter' : 'remove-minter', async () =>
        client.updateMinter(payer, {
          minter: parsePubkey(address.trim(), 'minter'),
          active: key === 'a',
          quotaAmount: parseAmount(quota.trim()),
          windowSeconds: Number(window.trim()),
          resetWindow: true,
        }),
      );
    }
  };

  startRawMode();
  input.resume();
  input.on('data', (chunk) => {
    void handleKey(chunk as Buffer);
  });

  await render();
  refreshTimer = setInterval(() => {
    void render();
  }, 10_000);
}

function parseCustomConfig(filePath: string): Record<string, unknown> {
  const raw = fs.readFileSync(filePath, 'utf8');
  if (filePath.endsWith('.toml')) {
    return toml.parse(raw) as Record<string, unknown>;
  }

  return JSON.parse(raw) as Record<string, unknown>;
}

const program = new Command();

program
  .name('sss-token')
  .description('Admin CLI for Solana Stablecoin Standard')
  .option('--rpc <url>', 'RPC URL', process.env.SSS_RPC_URL ?? 'http://127.0.0.1:8899')
  .option('--keypair <path>', 'payer keypair path', process.env.SSS_KEYPAIR_PATH)
  .option('--lockfile <path>', 'lockfile path', path.join(process.cwd(), LOCKFILE_NAME));

program
  .command('init')
  .description('Initialize a new SSS stablecoin')
  .option('--preset <preset>', 'sss-1 or sss-2')
  .option('--custom <path>', 'custom config JSON/TOML file')
  .requiredOption('--name <name>', 'token name')
  .requiredOption('--symbol <symbol>', 'token symbol')
  .requiredOption('--treasury <tokenAccount>', 'treasury token account address')
  .option('--uri <uri>', 'metadata URI', 'https://example.org/metadata.json')
  .option('--decimals <decimals>', 'mint decimals', '6')
  .option('--quota <amount>', 'initial minter quota in base units', '1000000000')
  .option('--window <seconds>', 'quota window in seconds', '86400')
  .action(async (options, command) => {
    const root = command.parent?.optsWithGlobals() ?? {};
    const rpcUrl = root.rpc as string;
    const keypairPath = root.keypair as string | undefined;
    const lockfilePath = root.lockfile as string;

    const payer = loadKeypair(resolveKeypairPath(keypairPath));
    const connection = new Connection(rpcUrl, 'confirmed');

    let client: SolanaStablecoin;

    if (options.custom) {
      const parsed = parseCustomConfig(options.custom);
      const extensions = parsed.extensions as {
        enableCompliance: boolean;
        enablePermanentDelegate: boolean;
        enableTransferHook: boolean;
        defaultAccountFrozen: boolean;
        seizeRequiresBlacklist: boolean;
      };
      const roles = parsed.roles as {
        pauser?: string;
        burner?: string;
        blacklister?: string;
        seizer?: string;
      };

      client = await SolanaStablecoin.create(connection, {
        payer,
        name: options.name,
        symbol: options.symbol,
        uri: options.uri,
        decimals: Number(options.decimals),
        extensions,
        roles: {
          pauser: roles.pauser ? parsePubkey(roles.pauser, 'roles.pauser') : undefined,
          burner: roles.burner ? parsePubkey(roles.burner, 'roles.burner') : undefined,
          blacklister: roles.blacklister
            ? parsePubkey(roles.blacklister, 'roles.blacklister')
            : undefined,
          seizer: roles.seizer ? parsePubkey(roles.seizer, 'roles.seizer') : undefined,
          treasury: parsePubkey(options.treasury, 'treasury'),
        },
        initialMinterQuota: parseAmount(String(options.quota)),
        initialMinterWindowSeconds: Number(options.window),
      });
    } else {
      const preset = (options.preset ?? '').toLowerCase();
      if (!['sss-1', 'sss-2'].includes(preset)) {
        throw new Error('`--preset sss-1|sss-2` is required unless --custom is used');
      }

      client = await SolanaStablecoin.create(connection, {
        payer,
        preset: preset === 'sss-1' ? Presets.SSS_1 : Presets.SSS_2,
        name: options.name,
        symbol: options.symbol,
        uri: options.uri,
        decimals: Number(options.decimals),
        treasury: parsePubkey(options.treasury, 'treasury'),
        initialMinterQuota: parseAmount(String(options.quota)),
        initialMinterWindowSeconds: Number(options.window),
      });
    }

    writeLockfile(
      {
        version: 1,
        rpcUrl,
        stablecoinProgramId: client.stablecoinProgramId.toBase58(),
        transferHookProgramId: client.transferHookProgramId.toBase58(),
        mint: client.addresses.mint.toBase58(),
        config: client.addresses.config.toBase58(),
        masterMinterRole: client.addresses.masterMinterRole.toBase58(),
        transferHookConfig: client.addresses.transferHookConfig?.toBase58(),
        extraAccountMetaList: client.addresses.extraAccountMetaList?.toBase58(),
        createdAt: new Date().toISOString(),
      },
      lockfilePath,
    );

    console.log('Initialized stablecoin');
    console.log('mint:', client.addresses.mint.toBase58());
    console.log('config:', client.addresses.config.toBase58());
    console.log('lockfile:', lockfilePath);
  });

program
  .command('mint <recipient> <amount>')
  .description('Mint tokens to a wallet or token account')
  .action(async (recipient, amount, command) => {
    const root = command.parent?.optsWithGlobals() ?? {};
    const { client, payer, connection } = await buildClientFromLock({
      rpcUrl: root.rpc as string,
      keypairPath: root.keypair,
      lockfilePath: root.lockfile,
    });

    const recipientKey = parsePubkey(recipient, 'recipient');
    const recipientTokenAccount = await resolveOrCreateTokenAccount(
      connection,
      payer,
      recipientKey,
      client.addresses.mint,
    );

    const sig = await client.mint({
      authority: payer,
      recipientTokenAccount,
      amount: parseAmount(amount),
    });
    console.log(sig);
  });

program
  .command('burn <amountOrFrom> [maybeAmount]')
  .description(
    'Burn from signer ATA (burn <amount>) or a specific token account (burn <from> <amount>)',
  )
  .action(async (amountOrFrom, maybeAmount, command) => {
    const root = command.parent?.optsWithGlobals() ?? {};
    const { client, payer, connection } = await buildClientFromLock({
      rpcUrl: root.rpc as string,
      keypairPath: root.keypair,
      lockfilePath: root.lockfile,
    });

    let from: PublicKey;
    let amount: bigint;

    if (maybeAmount) {
      from = parsePubkey(amountOrFrom, 'from');
      amount = parseAmount(maybeAmount);
    } else {
      amount = parseAmount(amountOrFrom);
      from = await resolveTokenAccountForMint(connection, payer.publicKey, client.addresses.mint);
    }

    const sig = await client.burn({ authority: payer, fromTokenAccount: from, amount });
    console.log(sig);
  });

program
  .command('freeze <addressOrToken>')
  .description('Freeze a wallet ATA or specific token account')
  .action(async (addressOrToken, command) => {
    const root = command.parent?.optsWithGlobals() ?? {};
    const { client, payer, connection } = await buildClientFromLock({
      rpcUrl: root.rpc as string,
      keypairPath: root.keypair,
      lockfilePath: root.lockfile,
    });

    const target = await resolveTokenAccountForMint(
      connection,
      parsePubkey(addressOrToken, 'addressOrToken'),
      client.addresses.mint,
    );

    const sig = await client.freeze({ authority: payer, tokenAccount: target });
    console.log(sig);
  });

program
  .command('thaw <addressOrToken>')
  .description('Thaw a wallet ATA or specific token account')
  .action(async (addressOrToken, command) => {
    const root = command.parent?.optsWithGlobals() ?? {};
    const { client, payer, connection } = await buildClientFromLock({
      rpcUrl: root.rpc as string,
      keypairPath: root.keypair,
      lockfilePath: root.lockfile,
    });

    const target = await resolveTokenAccountForMint(
      connection,
      parsePubkey(addressOrToken, 'addressOrToken'),
      client.addresses.mint,
    );

    const sig = await client.thaw({ authority: payer, tokenAccount: target });
    console.log(sig);
  });

program
  .command('pause')
  .description('Pause all transfers/mints')
  .action(async (_opts, command) => {
    const root = command.parent?.optsWithGlobals() ?? {};
    const { client, payer } = await buildClientFromLock({
      rpcUrl: root.rpc as string,
      keypairPath: root.keypair,
      lockfilePath: root.lockfile,
    });
    console.log(await client.pause(payer));
  });

program
  .command('unpause')
  .description('Unpause operations')
  .action(async (_opts, command) => {
    const root = command.parent?.optsWithGlobals() ?? {};
    const { client, payer } = await buildClientFromLock({
      rpcUrl: root.rpc as string,
      keypairPath: root.keypair,
      lockfilePath: root.lockfile,
    });
    console.log(await client.unpause(payer));
  });

program
  .command('status')
  .description('Show configuration')
  .action(async (_opts, command) => {
    const root = command.parent?.optsWithGlobals() ?? {};
    const { client, lockfile } = await buildClientFromLock({
      rpcUrl: root.rpc as string,
      keypairPath: root.keypair,
      lockfilePath: root.lockfile,
    });
    const config = await client.getConfig();
    console.log(JSON.stringify({ lockfile, config }, null, 2));
  });

program
  .command('supply')
  .description('Show total supply')
  .action(async (_opts, command) => {
    const root = command.parent?.optsWithGlobals() ?? {};
    const { client } = await buildClientFromLock({
      rpcUrl: root.rpc as string,
      keypairPath: root.keypair,
      lockfilePath: root.lockfile,
    });
    const supply = await client.getSupply();
    console.log(supply.toString());
  });

const blacklist = program.command('blacklist').description('SSS-2 blacklist operations');

blacklist
  .command('add <address>')
  .requiredOption('--reason <text>', 'reason text')
  .action(async (address, options, command) => {
    const root = command.parent?.parent?.optsWithGlobals() ?? {};
    const { client, payer } = await buildClientFromLock({
      rpcUrl: root.rpc as string,
      keypairPath: root.keypair,
      lockfilePath: root.lockfile,
    });

    const sig = await client.compliance.blacklistAdd(
      payer,
      parsePubkey(address, 'address'),
      options.reason,
    );
    console.log(sig);
  });

blacklist.command('remove <address>').action(async (address, _options, command) => {
  const root = command.parent?.parent?.optsWithGlobals() ?? {};
  const { client, payer } = await buildClientFromLock({
    rpcUrl: root.rpc as string,
    keypairPath: root.keypair,
    lockfilePath: root.lockfile,
  });

  const sig = await client.compliance.blacklistRemove(payer, parsePubkey(address, 'address'));
  console.log(sig);
});

program
  .command('seize <addressOrToken>')
  .requiredOption('--to <treasuryTokenAccount>', 'destination treasury token account')
  .requiredOption('--amount <amount>', 'amount in base units')
  .option('--override-blacklist', 'bypass blacklist guard when configuration permits', false)
  .action(async (addressOrToken, options, command) => {
    const root = command.parent?.optsWithGlobals() ?? {};
    const { client, payer, connection } = await buildClientFromLock({
      rpcUrl: root.rpc as string,
      keypairPath: root.keypair,
      lockfilePath: root.lockfile,
    });

    const sourceToken = await resolveTokenAccountForMint(
      connection,
      parsePubkey(addressOrToken, 'addressOrToken'),
      client.addresses.mint,
    );
    const sourceAccount = await getAccount(
      connection,
      sourceToken,
      'confirmed',
      TOKEN_2022_PROGRAM_ID,
    );

    const sig = await client.compliance.seize({
      authority: payer,
      sourceTokenAccount: sourceToken,
      destinationTokenAccount: parsePubkey(options.to, 'to'),
      sourceOwner: sourceAccount.owner,
      amount: parseAmount(options.amount),
      overrideRequiresBlacklist: Boolean(options.overrideBlacklist),
    });

    console.log(sig);
  });

const minters = program.command('minters').description('Minter role management');

minters.command('list').action(async (_options, command) => {
  const root = command.parent?.parent?.optsWithGlobals() ?? {};
  const { lockfile, connection } = await buildClientFromLock({
    rpcUrl: root.rpc as string,
    keypairPath: root.keypair,
    lockfilePath: root.lockfile,
  });

  const programId = new PublicKey(lockfile.stablecoinProgramId);
  const config = new PublicKey(lockfile.config);
  const accounts = await connection.getProgramAccounts(programId, {
    filters: [
      { dataSize: 106 },
      { memcmp: { offset: 9, bytes: config.toBase58() } },
    ],
  });

  const decoded = accounts
    .filter((entry) => entry.account.data.length >= 106)
    .map((entry) => {
      const data = entry.account.data;
      const authority = new PublicKey(data.subarray(41, 73));
      const active = data[73] === 1;
      const quotaAmount = data.readBigUInt64LE(74);
      const windowSeconds = Number(data.readBigInt64LE(82));
      const mintedInWindow = data.readBigUInt64LE(98);

      return {
        rolePda: entry.pubkey.toBase58(),
        authority: authority.toBase58(),
        active,
        quotaAmount: quotaAmount.toString(),
        windowSeconds,
        mintedInWindow: mintedInWindow.toString(),
      };
    });

  console.log(JSON.stringify(decoded, null, 2));
});

minters
  .command('add <address>')
  .requiredOption('--quota <amount>', 'quota in base units')
  .requiredOption('--window <seconds>', 'window in seconds')
  .action(async (address, options, command) => {
    const root = command.parent?.parent?.optsWithGlobals() ?? {};
    const { client, payer } = await buildClientFromLock({
      rpcUrl: root.rpc as string,
      keypairPath: root.keypair,
      lockfilePath: root.lockfile,
    });

    const sig = await client.updateMinter(payer, {
      minter: parsePubkey(address, 'address'),
      active: true,
      quotaAmount: parseAmount(options.quota),
      windowSeconds: Number(options.window),
      resetWindow: true,
    });

    console.log(sig);
  });

minters.command('remove <address>').action(async (address, _options, command) => {
  const root = command.parent?.parent?.optsWithGlobals() ?? {};
  const { client, payer } = await buildClientFromLock({
    rpcUrl: root.rpc as string,
    keypairPath: root.keypair,
    lockfilePath: root.lockfile,
  });

  const sig = await client.updateMinter(payer, {
    minter: parsePubkey(address, 'address'),
    active: false,
    quotaAmount: 0n,
    windowSeconds: 1,
    resetWindow: true,
  });

  console.log(sig);
});

program
  .command('holders')
  .description('List holders and balances')
  .option('--min-balance <amount>', 'minimum base units', '0')
  .action(async (options, command) => {
    const root = command.parent?.optsWithGlobals() ?? {};
    const { client, connection } = await buildClientFromLock({
      rpcUrl: root.rpc as string,
      keypairPath: root.keypair,
      lockfilePath: root.lockfile,
    });

    const minBalance = parseAmount(options.minBalance);

    const holders = await fetchHolders({
      connection,
      mint: client.addresses.mint,
      minBalance,
    });

    console.log(JSON.stringify(holders, null, 2));
  });

program
  .command('audit-log')
  .description('Read recent program logs')
  .option('--action <type>', 'filter by case-insensitive substring')
  .option('--limit <n>', 'max transactions to inspect', '50')
  .action(async (options, command) => {
    const root = command.parent?.optsWithGlobals() ?? {};
    const { connection, lockfile } = await buildClientFromLock({
      rpcUrl: root.rpc as string,
      keypairPath: root.keypair,
      lockfilePath: root.lockfile,
    });

    const programId = new PublicKey(lockfile.stablecoinProgramId);
    const signatures = await connection.getSignaturesForAddress(programId, {
      limit: Number(options.limit),
    });

    const needle = options.action ? String(options.action).toLowerCase() : null;
    const rows: Array<Record<string, string>> = [];

    for (const item of signatures) {
      const tx = await connection.getTransaction(item.signature, {
        maxSupportedTransactionVersion: 0,
      });
      const logs = tx?.meta?.logMessages ?? [];
      const hit = needle
        ? logs.find((line) => line.toLowerCase().includes(needle))
        : logs.find((line) => line.includes('Program log:'));

      if (!hit) {
        continue;
      }

      rows.push({
        signature: item.signature,
        slot: String(item.slot),
        when: item.blockTime ? new Date(item.blockTime * 1000).toISOString() : 'unknown',
        log: hit,
      });
    }

    console.log(JSON.stringify(rows, null, 2));
  });

program
  .command('tui')
  .description('Launch interactive terminal UI for monitoring and operations')
  .action(async (_opts, command) => {
    const root = command.parent?.optsWithGlobals() ?? {};
    await launchTui({
      rpcUrl: root.rpc as string,
      keypairPath: root.keypair as string | undefined,
      lockfilePath: root.lockfile as string | undefined,
    });
  });

program.parseAsync().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
