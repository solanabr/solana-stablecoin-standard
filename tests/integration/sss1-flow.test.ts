import * as anchor from '@coral-xyz/anchor';
import {
  TOKEN_2022_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  getAccount,
  getAssociatedTokenAddressSync,
  transferChecked,
} from '@solana/spl-token';
import { Keypair, PublicKey, SystemProgram, Transaction } from '@solana/web3.js';
import { describe, expect, it } from 'vitest';
import { finalizeCreation, providerPayer } from '../helpers/stablecoin';
const HOOK_PROGRAM_ID = new PublicKey('CHfiQPpbATb9qDbYMA8sRKPxRu3sYHdMW4s4JG4xJt1H');

const shouldRun = process.env.RUN_ANCHOR_TESTS === '1';
const itIf = shouldRun ? it : it.skip;
describe('SSS-1 flow', () => {
  itIf('init -> mint -> transfer -> freeze -> thaw', async () => {
    const provider = anchor.AnchorProvider.env();
    anchor.setProvider(provider);

    const stablecoin = anchor.workspace.SssStablecoin as anchor.Program;

    const authority = providerPayer(provider);
    const mint = Keypair.generate();

    const [config] = PublicKey.findProgramAddressSync(
      [Buffer.from('config'), mint.publicKey.toBuffer()],
      stablecoin.programId,
    );
    const [masterMinterRole] = PublicKey.findProgramAddressSync(
      [Buffer.from('minter'), config.toBuffer(), authority.publicKey.toBuffer()],
      stablecoin.programId,
    );

    const treasuryOwner = Keypair.generate();
    const treasuryAta = getAssociatedTokenAddressSync(
      mint.publicKey,
      treasuryOwner.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID,
    );

    const initializeSignature = await stablecoin.methods
      .initialize({
        name: 'SSS One',
        symbol: 'SS1',
        uri: 'https://example.org/ss1.json',
        decimals: 6,
        preset: { sss1: {} },
        enableCompliance: false,
        enablePermanentDelegate: false,
        enableTransferHook: false,
        defaultAccountFrozen: false,
        seizeRequiresBlacklist: true,
        transferHookProgram: HOOK_PROGRAM_ID,
        roles: {
          pauser: null,
          burner: null,
          blacklister: null,
          seizer: null,
          treasury: treasuryAta,
        },
        initialMinterQuota: new anchor.BN(1_000_000_000),
        initialMinterWindowSeconds: new anchor.BN(86400),
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
    await provider.connection.confirmTransaction(initializeSignature, 'confirmed');
    await finalizeCreation({ provider, stablecoin, authority, mint, config });

    const userA = Keypair.generate();
    const userB = Keypair.generate();
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

    await provider.sendAndConfirm(
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
        ),
      [],
    );

    const [userACompliance] = PublicKey.findProgramAddressSync(
      [Buffer.from('compliance'), mint.publicKey.toBuffer(), userA.publicKey.toBuffer()],
      stablecoin.programId,
    );

    const mintSignature = await stablecoin.methods
      .mint(new anchor.BN(1_000_000))
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
    await provider.connection.confirmTransaction(mintSignature, 'confirmed');

    await transferChecked(
      provider.connection,
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

    await stablecoin.methods
      .freezeAccount(userBAta)
      .accounts({
        authority: authority.publicKey,
        config,
        mint: mint.publicKey,
        tokenAccount: userBAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();

    await stablecoin.methods
      .thawAccount(userBAta)
      .accounts({
        authority: authority.publicKey,
        config,
        mint: mint.publicKey,
        tokenAccount: userBAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();

    const userABalance = await getAccount(
      provider.connection,
      userAAta,
      'confirmed',
      TOKEN_2022_PROGRAM_ID,
    );
    const userBBalance = await getAccount(
      provider.connection,
      userBAta,
      'confirmed',
      TOKEN_2022_PROGRAM_ID,
    );
    expect(userABalance.amount).toEqual(900_000n);
    expect(userBBalance.amount).toEqual(100_000n);
  });
});
