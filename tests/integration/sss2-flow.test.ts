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
import { finalizeCreation } from '../helpers/stablecoin';

const shouldRun = process.env.RUN_ANCHOR_TESTS === '1';
const itIf = shouldRun ? it : it.skip;
const HOOK_PROGRAM_ID = new PublicKey('CHfiQPpbATb9qDbYMA8sRKPxRu3sYHdMW4s4JG4xJt1H');

function providerPayer(provider: anchor.AnchorProvider): Keypair {
  const walletWithPayer = provider.wallet as anchor.Wallet & { payer?: Keypair };
  if (!walletWithPayer.payer) {
    throw new Error('Provider wallet does not expose payer keypair');
  }
  return walletWithPayer.payer;
}

describe('SSS-2 flow', () => {
  itIf('init -> mint -> transfer -> blacklist -> transfer fails -> seize', async () => {
    const provider = anchor.AnchorProvider.env();
    anchor.setProvider(provider);

    const stablecoin = anchor.workspace.SssStablecoin as anchor.Program;
    const transferHook = anchor.workspace.SssTransferHook as anchor.Program;

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
    const [hookConfig] = PublicKey.findProgramAddressSync(
      [Buffer.from('hook-config'), mint.publicKey.toBuffer()],
      transferHook.programId,
    );
    const [extraAccountMetaList] = PublicKey.findProgramAddressSync(
      [Buffer.from('extra-account-metas'), mint.publicKey.toBuffer()],
      transferHook.programId,
    );

    const treasuryOwner = Keypair.generate();
    const treasuryAta = getAssociatedTokenAddressSync(
      mint.publicKey,
      treasuryOwner.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID,
    );

    await stablecoin.methods
      .initialize({
        name: 'SSS Two',
        symbol: 'SS2',
        uri: 'https://example.org/ss2.json',
        decimals: 6,
        preset: { sss2: {} },
        enableCompliance: true,
        enablePermanentDelegate: true,
        enableTransferHook: true,
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
        initialMinterQuota: new anchor.BN(10_000_000_000),
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
    await finalizeCreation({ provider, stablecoin, authority, mint, config });

    await transferHook.methods
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

    await transferHook.methods
      .initializeExtraAccountMetaList()
      .accounts({
        payer: authority.publicKey,
        hookConfig,
        extraAccountMetaList,
        mint: mint.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

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
        )
        .add(
          createAssociatedTokenAccountIdempotentInstruction(
            authority.publicKey,
            treasuryAta,
            treasuryOwner.publicKey,
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
    const [treasuryCompliance] = PublicKey.findProgramAddressSync(
      [Buffer.from('compliance'), mint.publicKey.toBuffer(), treasuryOwner.publicKey.toBuffer()],
      stablecoin.programId,
    );

    await stablecoin.methods
      .mint(new anchor.BN(2_000_000))
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

    await stablecoin.methods
      .addToBlacklist('sanctions')
      .accounts({
        authority: authority.publicKey,
        config,
        mint: mint.publicKey,
        wallet: userA.publicKey,
        complianceRecord: userACompliance,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    await expect(
      transferChecked(
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
      ),
    ).rejects.toThrowError();

    const seizeSignature = await stablecoin.methods
      .seize({ amount: new anchor.BN(250_000), overrideRequiresBlacklist: false })
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
    await provider.connection.confirmTransaction(seizeSignature, 'confirmed');

    const sourceBalance = await getAccount(
      provider.connection,
      userAAta,
      'confirmed',
      TOKEN_2022_PROGRAM_ID,
    );
    const treasuryBalance = await getAccount(
      provider.connection,
      treasuryAta,
      'confirmed',
      TOKEN_2022_PROGRAM_ID,
    );

    expect(sourceBalance.amount).toEqual(1_750_000n);
    expect(treasuryBalance.amount).toEqual(250_000n);
  });
});
