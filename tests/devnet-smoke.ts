import * as anchor from '@coral-xyz/anchor';
import {
  TOKEN_2022_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  getAccount,
  getAssociatedTokenAddressSync,
  transferChecked,
} from '@solana/spl-token';
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
  type Transaction as LegacyTransaction,
  type VersionedTransaction,
} from '@solana/web3.js';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { finalizeCreation } from './helpers/stablecoin';

const RPC_URL =
  process.env.SSS_RPC_URL ??
  'https://api.devnet.solana.com';
const STABLECOIN_PROGRAM_ID = new PublicKey('5C7LHvieTag3oioHsni4SgTVDeCYMLTchix5obimXkEL');
const TRANSFER_HOOK_PROGRAM_ID = new PublicKey('CHfiQPpbATb9qDbYMA8sRKPxRu3sYHdMW4s4JG4xJt1H');
const require = createRequire(import.meta.url);
const { BN } = require('@coral-xyz/anchor') as { BN: new (value: number | string) => unknown };

type AnchorWallet = anchor.Wallet & {
  payer?: Keypair;
};

class KeypairWallet implements anchor.Wallet {
  constructor(private readonly payer: Keypair) {}

  get publicKey(): PublicKey {
    return this.payer.publicKey;
  }

  async signTransaction<T extends LegacyTransaction | VersionedTransaction>(tx: T): Promise<T> {
    if ('version' in tx) {
      tx.sign([this.payer]);
    } else {
      tx.partialSign(this.payer);
    }
    return tx;
  }

  async signAllTransactions<T extends LegacyTransaction | VersionedTransaction>(
    txs: T[],
  ): Promise<T[]> {
    return Promise.all(txs.map((tx) => this.signTransaction(tx)));
  }
}

function loadKeypair(filePath = path.join(os.homedir(), '.config/solana/id.json')): Keypair {
  const secret = Uint8Array.from(JSON.parse(fs.readFileSync(filePath, 'utf8')) as number[]);
  return Keypair.fromSecretKey(secret);
}

function programForId(idl: unknown, programId: PublicKey, provider: anchor.AnchorProvider) {
  return new anchor.Program(
    {
      ...(idl as Record<string, unknown>),
      address: programId.toBase58(),
    } as anchor.Idl,
    provider,
  );
}

function loadIdl(filePath: string): anchor.Idl {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as anchor.Idl;
}

async function confirm(connection: Connection, signature: string): Promise<void> {
  const latestBlockhash = await connection.getLatestBlockhash();
  await connection.confirmTransaction({ signature, ...latestBlockhash }, 'confirmed');
}

async function main(): Promise<void> {
  const authority = loadKeypair();
  const connection = new Connection(RPC_URL, 'confirmed');
  const wallet = new KeypairWallet(authority) as AnchorWallet;
  wallet.payer = authority;
  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: 'confirmed',
    preflightCommitment: 'confirmed',
  });
  anchor.setProvider(provider);

  const stablecoin = programForId(
    loadIdl(path.join(process.cwd(), 'target/idl/sss_stablecoin.json')),
    STABLECOIN_PROGRAM_ID,
    provider,
  );
  const transferHook = programForId(
    loadIdl(path.join(process.cwd(), 'target/idl/sss_transfer_hook.json')),
    TRANSFER_HOOK_PROGRAM_ID,
    provider,
  );

  const mint = Keypair.generate();
  const userA = Keypair.generate();
  const userB = Keypair.generate();

  const [config] = PublicKey.findProgramAddressSync(
    [Buffer.from('config'), mint.publicKey.toBuffer()],
    stablecoin.programId,
  );
  const [masterMinterRole] = PublicKey.findProgramAddressSync(
    [Buffer.from('minter'), config.toBuffer(), authority.publicKey.toBuffer()],
    stablecoin.programId,
  );
  const [hookConfig] = PublicKey.findProgramAddressSync(
    [Buffer.from('hook-config'), mint.publicKey.toBuffer()],
    transferHook.programId,
  );
  const [extraAccountMetaList] = PublicKey.findProgramAddressSync(
    [Buffer.from('extra-account-metas'), mint.publicKey.toBuffer()],
    transferHook.programId,
  );
  const [userACompliance] = PublicKey.findProgramAddressSync(
    [Buffer.from('compliance'), mint.publicKey.toBuffer(), userA.publicKey.toBuffer()],
    stablecoin.programId,
  );
  const [treasuryCompliance] = PublicKey.findProgramAddressSync(
    [Buffer.from('compliance'), mint.publicKey.toBuffer(), authority.publicKey.toBuffer()],
    stablecoin.programId,
  );

  const treasuryAta = getAssociatedTokenAddressSync(
    mint.publicKey,
    authority.publicKey,
    false,
    TOKEN_2022_PROGRAM_ID,
  );
  const userAAta = getAssociatedTokenAddressSync(
    mint.publicKey,
    userA.publicKey,
    false,
    TOKEN_2022_PROGRAM_ID,
  );
  const userBAta = getAssociatedTokenAddressSync(
    mint.publicKey,
    userB.publicKey,
    false,
    TOKEN_2022_PROGRAM_ID,
  );

  const initializeSig = await stablecoin.methods
    .initialize({
      name: 'Devnet Smoke USD',
      symbol: 'DSUSD',
      uri: 'https://example.org/devnet-smoke.json',
      decimals: 6,
      preset: { sss2: {} },
      enableCompliance: true,
      enablePermanentDelegate: true,
      enableTransferHook: true,
      defaultAccountFrozen: false,
      seizeRequiresBlacklist: true,
      transferHookProgram: transferHook.programId,
      roles: {
        pauser: null,
        burner: null,
        blacklister: null,
        seizer: null,
        treasury: treasuryAta,
      },
      initialMinterQuota: new BN(10_000_000_000),
      initialMinterWindowSeconds: new BN(86400),
    })
    .accounts({
      payer: authority.publicKey,
      authority: authority.publicKey,
      config,
      masterMinterRole,
      mint: mint.publicKey,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .signers([mint])
    .rpc();
  await confirm(connection, initializeSig);
  await finalizeCreation({ provider, stablecoin, authority, mint, config });

  const initHookSig = await transferHook.methods
    .initializeHook({
      stablecoinProgram: stablecoin.programId,
      stablecoinConfig: config,
      treasuryTokenAccount: treasuryAta,
      enforcePause: true,
    })
    .accounts({
      payer: authority.publicKey,
      hookConfig,
      mint: mint.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
  await confirm(connection, initHookSig);

  const initMetaSig = await transferHook.methods
    .initializeExtraAccountMetaList()
    .accounts({
      payer: authority.publicKey,
      hookConfig,
      extraAccountMetaList,
      mint: mint.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
  await confirm(connection, initMetaSig);

  const createAtasSig = await sendAndConfirmTransaction(
    connection,
    new Transaction()
      .add(
        createAssociatedTokenAccountIdempotentInstruction(
          authority.publicKey,
          userAAta,
          userA.publicKey,
          mint.publicKey,
          TOKEN_2022_PROGRAM_ID,
        ),
      )
      .add(
        createAssociatedTokenAccountIdempotentInstruction(
          authority.publicKey,
          userBAta,
          userB.publicKey,
          mint.publicKey,
          TOKEN_2022_PROGRAM_ID,
        ),
      )
      .add(
        createAssociatedTokenAccountIdempotentInstruction(
          authority.publicKey,
          treasuryAta,
          authority.publicKey,
          mint.publicKey,
          TOKEN_2022_PROGRAM_ID,
        ),
      ),
    [authority],
    { commitment: 'confirmed' },
  );
  await confirm(connection, createAtasSig);

  const mintSig = await stablecoin.methods
    .mint(new BN(2_000_000))
    .accounts({
      authority: authority.publicKey,
      config,
      mint: mint.publicKey,
      recipient: userAAta,
      minterRole: masterMinterRole,
      recipientComplianceRecord: userACompliance,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
    })
    .rpc();
  await confirm(connection, mintSig);

  const blacklistSig = await stablecoin.methods
    .addToBlacklist('devnet smoke test')
    .accounts({
      authority: authority.publicKey,
      config,
      mint: mint.publicKey,
      wallet: userA.publicKey,
      complianceRecord: userACompliance,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
  await confirm(connection, blacklistSig);

  let transferBlocked = false;
  try {
    await transferChecked(
      connection,
      authority,
      userAAta,
      mint.publicKey,
      userBAta,
      userA,
      100_000,
      6,
      [],
      { commitment: 'confirmed' },
      TOKEN_2022_PROGRAM_ID,
    );
  } catch {
    transferBlocked = true;
  }

  if (!transferBlocked) {
    throw new Error('Expected blacklisted transfer to fail, but it succeeded');
  }

  const seizeSig = await stablecoin.methods
    .seize({ amount: new BN(250_000), overrideRequiresBlacklist: false })
    .accounts({
      authority: authority.publicKey,
      config,
      mint: mint.publicKey,
      source: userAAta,
      destination: treasuryAta,
      sourceComplianceRecord: userACompliance,
      destinationComplianceRecord: treasuryCompliance,
      transferHookProgram: transferHook.programId,
      extraAccountMetaList,
      hookConfig,
      stablecoinProgram: stablecoin.programId,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
    })
    .rpc();
  await confirm(connection, seizeSig);

  const userABalance = await getAccount(connection, userAAta, 'confirmed', TOKEN_2022_PROGRAM_ID);
  const treasuryBalance = await getAccount(
    connection,
    treasuryAta,
    'confirmed',
    TOKEN_2022_PROGRAM_ID,
  );

  console.log(
    JSON.stringify(
      {
        rpcUrl: RPC_URL,
        stablecoinProgramId: stablecoin.programId.toBase58(),
        transferHookProgramId: transferHook.programId.toBase58(),
        mint: mint.publicKey.toBase58(),
        config: config.toBase58(),
        hookConfig: hookConfig.toBase58(),
        extraAccountMetaList: extraAccountMetaList.toBase58(),
        treasuryAta: treasuryAta.toBase58(),
        userA: userA.publicKey.toBase58(),
        userAAta: userAAta.toBase58(),
        userBAta: userBAta.toBase58(),
        signatures: {
          initialize: initializeSig,
          initializeHook: initHookSig,
          initializeExtraAccountMetaList: initMetaSig,
          createAtas: createAtasSig,
          mint: mintSig,
          blacklist: blacklistSig,
          seize: seizeSig,
        },
        transferBlocked,
        balances: {
          userA: userABalance.amount.toString(),
          treasury: treasuryBalance.amount.toString(),
        },
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
