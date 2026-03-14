/**
 * Role Permissions Tests for SSS Stablecoin
 * 
 * Tests Role-Based Access Control (RBAC) matrix
 */

import * as anchor from '@coral-xyz/anchor';
import {
  TOKEN_2022_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  getAccount,
  getAssociatedTokenAddressSync,
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

function deriveHookAccounts(mint: Keypair, programId: PublicKey) {
  const [hookConfig] = PublicKey.findProgramAddressSync(
    [Buffer.from('hook-config'), mint.publicKey.toBuffer()],
    programId,
  );
  const [extraAccountMetaList] = PublicKey.findProgramAddressSync(
    [Buffer.from('extra-account-metas'), mint.publicKey.toBuffer()],
    programId,
  );
  return { hookConfig, extraAccountMetaList };
}

async function initializeHook(params: {
  authority: Keypair;
  mint: Keypair;
  config: PublicKey;
  treasuryAta: PublicKey;
  transferHook: anchor.Program;
  stablecoinProgramId: PublicKey;
}) {
  const { hookConfig, extraAccountMetaList } = deriveHookAccounts(
    params.mint,
    params.transferHook.programId,
  );

  await params.transferHook.methods
    .initializeHook({
      stablecoinProgram: params.stablecoinProgramId,
      stablecoinConfig: params.config,
      treasuryTokenAccount: params.treasuryAta,
      enforcePause: true,
    })
    .accounts({
      payer: params.authority.publicKey,
      hookConfig,
      mint: params.mint.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  await params.transferHook.methods
    .initializeExtraAccountMetaList()
    .accounts({
      payer: params.authority.publicKey,
      hookConfig,
      extraAccountMetaList,
      mint: params.mint.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  return { hookConfig, extraAccountMetaList };
}

describe('Role Permissions Matrix', () => {
  describe('Master Authority', () => {
    itIf('can perform all operations', async () => {
      const provider = anchor.AnchorProvider.env();
      anchor.setProvider(provider);
      const stablecoin = anchor.workspace.SssStablecoin as anchor.Program;
      const transferHook = anchor.workspace.SssTransferHook as anchor.Program;
      const master = providerPayer(provider);
      const mint = Keypair.generate();

      const [config] = PublicKey.findProgramAddressSync(
        [Buffer.from('config'), mint.publicKey.toBuffer()],
        stablecoin.programId,
      );
      const [masterMinterRole] = PublicKey.findProgramAddressSync(
        [Buffer.from('minter'), config.toBuffer(), master.publicKey.toBuffer()],
        stablecoin.programId,
      );
      const treasuryAta = getAssociatedTokenAddressSync(
        mint.publicKey,
        Keypair.generate().publicKey,
        false,
        TOKEN_2022_PROGRAM_ID,
      );

      // Initialize
      await stablecoin.methods
        .initialize({
          name: 'TEST',
          symbol: 'TEST',
          uri: 'https://test.json',
          decimals: 6,
          preset: { sss1: {} },
          enableCompliance: false,
          enablePermanentDelegate: false,
          enableTransferHook: false,
          defaultAccountFrozen: false,
          seizeRequiresBlacklist: true,
          transferHookProgram: PublicKey.default,
          roles: { pauser: null, burner: null, blacklister: null, seizer: null, treasury: treasuryAta },
          initialMinterQuota: new anchor.BN(1_000_000),
          initialMinterWindowSeconds: new anchor.BN(86400),
        })
        .accounts({
          payer: master.publicKey,
          authority: master.publicKey,
          config,
          masterMinterRole,
          mint: mint.publicKey,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([mint])
        .rpc();
      await finalizeCreation({ provider, stablecoin, authority: master, mint, config });

      // Master can pause
      await stablecoin.methods
        .pause()
        .accounts({ authority: master.publicKey, config, mint: mint.publicKey })
        .rpc();

      // Master can unpause
      await stablecoin.methods
        .unpause()
        .accounts({ authority: master.publicKey, config, mint: mint.publicKey })
        .rpc();

      // Master can update roles
      const newPauser = Keypair.generate().publicKey;
      await stablecoin.methods
        .updateRoles({ pauser: newPauser, burner: null, blacklister: null, seizer: null, treasury: null })
        .accounts({ authority: master.publicKey, config, mint: mint.publicKey })
        .rpc();

      // Master can transfer authority
      const newMaster = Keypair.generate().publicKey;
      await stablecoin.methods
        .transferAuthority(newMaster)
        .accounts({ authority: master.publicKey, config, mint: mint.publicKey })
        .rpc();
    });
  });

  describe('Pauser Role', () => {
    itIf('can pause and unpause but not mint', async () => {
      const provider = anchor.AnchorProvider.env();
      anchor.setProvider(provider);
      const stablecoin = anchor.workspace.SssStablecoin as anchor.Program;
      const master = providerPayer(provider);
      const mint = Keypair.generate();

      const [config] = PublicKey.findProgramAddressSync(
        [Buffer.from('config'), mint.publicKey.toBuffer()],
        stablecoin.programId,
      );
      const [masterMinterRole] = PublicKey.findProgramAddressSync(
        [Buffer.from('minter'), config.toBuffer(), master.publicKey.toBuffer()],
        stablecoin.programId,
      );
      const treasuryAta = getAssociatedTokenAddressSync(
        mint.publicKey,
        Keypair.generate().publicKey,
        false,
        TOKEN_2022_PROGRAM_ID,
      );

      const pauser = Keypair.generate();

      await stablecoin.methods
        .initialize({
          name: 'TEST',
          symbol: 'TEST',
          uri: 'https://test.json',
          decimals: 6,
          preset: { sss1: {} },
          enableCompliance: false,
          enablePermanentDelegate: false,
          enableTransferHook: false,
          defaultAccountFrozen: false,
          seizeRequiresBlacklist: true,
          transferHookProgram: PublicKey.default,
          roles: { pauser: pauser.publicKey, burner: null, blacklister: null, seizer: null, treasury: treasuryAta },
          initialMinterQuota: new anchor.BN(1_000_000),
          initialMinterWindowSeconds: new anchor.BN(86400),
        })
        .accounts({
          payer: master.publicKey,
          authority: master.publicKey,
          config,
          masterMinterRole,
          mint: mint.publicKey,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([mint])
        .rpc();
      await finalizeCreation({ provider, stablecoin, authority: master, mint, config });

      await provider.connection.requestAirdrop(pauser.publicKey, 1_000_000_000);
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Pauser can pause
      await stablecoin.methods
        .pause()
        .accounts({ authority: pauser.publicKey, config, mint: mint.publicKey })
        .signers([pauser])
        .rpc();

      // Pauser can unpause
      await stablecoin.methods
        .unpause()
        .accounts({ authority: pauser.publicKey, config, mint: mint.publicKey })
        .signers([pauser])
        .rpc();

      // Pauser cannot mint
      const user = Keypair.generate();
      const userAta = getAssociatedTokenAddressSync(
        mint.publicKey,
        user.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID,
      );

      await provider.sendAndConfirm(
        new Transaction().add(
          createAssociatedTokenAccountIdempotentInstruction(
            master.publicKey,
            userAta,
            user.publicKey,
            mint.publicKey,
            TOKEN_2022_PROGRAM_ID,
          ),
        ),
        [],
      );

      await expect(
        stablecoin.methods
          .mint(new anchor.BN(1000))
          .accounts({
            authority: pauser.publicKey,
            config,
            mint: mint.publicKey,
            recipient: userAta,
            minterRole: masterMinterRole,
            recipientComplianceRecord: PublicKey.default,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .signers([pauser])
          .rpc(),
      ).rejects.toThrow();
    });
  });

  describe('Burner Role (SSS-2)', () => {
    itIf('can burn from any account when permanent delegate enabled', async () => {
      const provider = anchor.AnchorProvider.env();
      anchor.setProvider(provider);
      const stablecoin = anchor.workspace.SssStablecoin as anchor.Program;
      const transferHook = anchor.workspace.SssTransferHook as anchor.Program;
      const master = providerPayer(provider);
      const mint = Keypair.generate();

      const [config] = PublicKey.findProgramAddressSync(
        [Buffer.from('config'), mint.publicKey.toBuffer()],
        stablecoin.programId,
      );
      const [masterMinterRole] = PublicKey.findProgramAddressSync(
        [Buffer.from('minter'), config.toBuffer(), master.publicKey.toBuffer()],
        stablecoin.programId,
      );
      const treasuryOwner = Keypair.generate();
      const treasuryAta = getAssociatedTokenAddressSync(
        mint.publicKey,
        treasuryOwner.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID,
      );

      const burner = Keypair.generate();

      // SSS-2 with permanent delegate
      await stablecoin.methods
        .initialize({
          name: 'TEST',
          symbol: 'TEST',
          uri: 'https://test.json',
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
            burner: burner.publicKey,
            blacklister: null,
            seizer: null,
            treasury: treasuryAta,
          },
          initialMinterQuota: new anchor.BN(1_000_000),
          initialMinterWindowSeconds: new anchor.BN(86400),
        })
        .accounts({
          payer: master.publicKey,
          authority: master.publicKey,
          config,
          masterMinterRole,
          mint: mint.publicKey,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([mint])
        .rpc();
      await finalizeCreation({ provider, stablecoin, authority: master, mint, config });
      await initializeHook({
        authority: master,
        mint,
        config,
        treasuryAta,
        transferHook,
        stablecoinProgramId: stablecoin.programId,
      });

      const user = Keypair.generate();
      const [userComplianceRecord] = PublicKey.findProgramAddressSync(
        [Buffer.from('compliance'), mint.publicKey.toBuffer(), user.publicKey.toBuffer()],
        stablecoin.programId,
      );
      const userAta = getAssociatedTokenAddressSync(
        mint.publicKey,
        user.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID,
      );

      await provider.sendAndConfirm(
        new Transaction()
          .add(
            createAssociatedTokenAccountIdempotentInstruction(
              master.publicKey,
              userAta,
              user.publicKey,
              mint.publicKey,
              TOKEN_2022_PROGRAM_ID,
            ),
          )
          .add(
            createAssociatedTokenAccountIdempotentInstruction(
              master.publicKey,
              treasuryAta,
              treasuryOwner.publicKey,
              mint.publicKey,
              TOKEN_2022_PROGRAM_ID,
            ),
          ),
        [],
      );

      // Mint to user
      await stablecoin.methods
        .mint(new anchor.BN(10_000))
        .accounts({
          authority: master.publicKey,
          config,
          mint: mint.publicKey,
          recipient: userAta,
          minterRole: masterMinterRole,
          recipientComplianceRecord: userComplianceRecord,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .rpc();

      await provider.connection.requestAirdrop(burner.publicKey, 1_000_000_000);
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Burner can burn from user account
      const burnSignature = await stablecoin.methods
        .burn(new anchor.BN(5_000))
        .accounts({
          authority: burner.publicKey,
          config,
          mint: mint.publicKey,
          from: userAta,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([burner])
        .rpc();
      await provider.connection.confirmTransaction(burnSignature, 'confirmed');

      // Verify balance
      const account = await getAccount(provider.connection, userAta, 'confirmed', TOKEN_2022_PROGRAM_ID);
      expect(account.amount).toBe(5_000n);
    });
  });

  describe('Blacklister Role (SSS-2)', () => {
    itIf('can add and remove from blacklist', async () => {
      const provider = anchor.AnchorProvider.env();
      anchor.setProvider(provider);
      const stablecoin = anchor.workspace.SssStablecoin as anchor.Program;
      const transferHook = anchor.workspace.SssTransferHook as anchor.Program;
      const master = providerPayer(provider);
      const mint = Keypair.generate();

      const [config] = PublicKey.findProgramAddressSync(
        [Buffer.from('config'), mint.publicKey.toBuffer()],
        stablecoin.programId,
      );
      const [masterMinterRole] = PublicKey.findProgramAddressSync(
        [Buffer.from('minter'), config.toBuffer(), master.publicKey.toBuffer()],
        stablecoin.programId,
      );
      const treasuryAta = getAssociatedTokenAddressSync(
        mint.publicKey,
        Keypair.generate().publicKey,
        false,
        TOKEN_2022_PROGRAM_ID,
      );

      const blacklister = Keypair.generate();

      await stablecoin.methods
        .initialize({
          name: 'TEST',
          symbol: 'TEST',
          uri: 'https://test.json',
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
            blacklister: blacklister.publicKey,
            seizer: null,
            treasury: treasuryAta,
          },
          initialMinterQuota: new anchor.BN(1_000_000),
          initialMinterWindowSeconds: new anchor.BN(86400),
        })
        .accounts({
          payer: master.publicKey,
          authority: master.publicKey,
          config,
          masterMinterRole,
          mint: mint.publicKey,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([mint])
        .rpc();
      await finalizeCreation({ provider, stablecoin, authority: master, mint, config });

      const targetUser = Keypair.generate();
      const [complianceRecord] = PublicKey.findProgramAddressSync(
        [Buffer.from('compliance'), mint.publicKey.toBuffer(), targetUser.publicKey.toBuffer()],
        stablecoin.programId,
      );

      await provider.connection.requestAirdrop(blacklister.publicKey, 1_000_000_000);
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Blacklister can add to blacklist
      await stablecoin.methods
        .addToBlacklist('OFAC match')
        .accounts({
          authority: blacklister.publicKey,
          config,
          mint: mint.publicKey,
          wallet: targetUser.publicKey,
          complianceRecord,
          systemProgram: SystemProgram.programId,
        })
        .signers([blacklister])
        .rpc();

      // Blacklister can remove from blacklist
      await stablecoin.methods
        .removeFromBlacklist()
        .accounts({
          authority: blacklister.publicKey,
          config,
          mint: mint.publicKey,
          wallet: targetUser.publicKey,
          complianceRecord,
          systemProgram: SystemProgram.programId,
        })
        .signers([blacklister])
        .rpc();
    });
  });

  describe('Seizer Role (SSS-2)', () => {
    itIf('can seize tokens from blacklisted accounts', async () => {
      const provider = anchor.AnchorProvider.env();
      anchor.setProvider(provider);
      const stablecoin = anchor.workspace.SssStablecoin as anchor.Program;
      const transferHook = anchor.workspace.SssTransferHook as anchor.Program;
      const master = providerPayer(provider);
      const mint = Keypair.generate();

      const [config] = PublicKey.findProgramAddressSync(
        [Buffer.from('config'), mint.publicKey.toBuffer()],
        stablecoin.programId,
      );
      const [masterMinterRole] = PublicKey.findProgramAddressSync(
        [Buffer.from('minter'), config.toBuffer(), master.publicKey.toBuffer()],
        stablecoin.programId,
      );
      const treasuryOwner = Keypair.generate();
      const treasuryAta = getAssociatedTokenAddressSync(
        mint.publicKey,
        treasuryOwner.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID,
      );

      const seizer = Keypair.generate();

      await stablecoin.methods
        .initialize({
          name: 'TEST',
          symbol: 'TEST',
          uri: 'https://test.json',
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
            seizer: seizer.publicKey,
            treasury: treasuryAta,
          },
          initialMinterQuota: new anchor.BN(1_000_000),
          initialMinterWindowSeconds: new anchor.BN(86400),
        })
        .accounts({
          payer: master.publicKey,
          authority: master.publicKey,
          config,
          masterMinterRole,
          mint: mint.publicKey,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([mint])
        .rpc();
      await finalizeCreation({ provider, stablecoin, authority: master, mint, config });
      const { hookConfig, extraAccountMetaList } = await initializeHook({
        authority: master,
        mint,
        config,
        treasuryAta,
        transferHook,
        stablecoinProgramId: stablecoin.programId,
      });

      const targetUser = Keypair.generate();
      const targetAta = getAssociatedTokenAddressSync(
        mint.publicKey,
        targetUser.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID,
      );
      const [complianceRecord] = PublicKey.findProgramAddressSync(
        [Buffer.from('compliance'), mint.publicKey.toBuffer(), targetUser.publicKey.toBuffer()],
        stablecoin.programId,
      );
      const [treasuryComplianceRecord] = PublicKey.findProgramAddressSync(
        [Buffer.from('compliance'), mint.publicKey.toBuffer(), treasuryOwner.publicKey.toBuffer()],
        stablecoin.programId,
      );

      await provider.sendAndConfirm(
        new Transaction()
          .add(
            createAssociatedTokenAccountIdempotentInstruction(
              master.publicKey,
              targetAta,
              targetUser.publicKey,
              mint.publicKey,
              TOKEN_2022_PROGRAM_ID,
            ),
          )
          .add(
            createAssociatedTokenAccountIdempotentInstruction(
              master.publicKey,
              treasuryAta,
              treasuryOwner.publicKey,
              mint.publicKey,
              TOKEN_2022_PROGRAM_ID,
            ),
          ),
        [],
      );

      // Mint to target
      await stablecoin.methods
        .mint(new anchor.BN(10_000))
        .accounts({
          authority: master.publicKey,
          config,
          mint: mint.publicKey,
          recipient: targetAta,
          minterRole: masterMinterRole,
          recipientComplianceRecord: complianceRecord,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .rpc();

      // Blacklist the user
      await stablecoin.methods
        .addToBlacklist('Sanctions')
        .accounts({
          authority: master.publicKey,
          config,
          mint: mint.publicKey,
          wallet: targetUser.publicKey,
          complianceRecord,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      await provider.connection.requestAirdrop(seizer.publicKey, 1_000_000_000);
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Seizer can seize tokens
      const seizeSignature = await stablecoin.methods
        .seize({ amount: new anchor.BN(5_000), overrideRequiresBlacklist: false })
        .accounts({
          authority: seizer.publicKey,
          config,
          mint: mint.publicKey,
          source: targetAta,
          destination: treasuryAta,
          sourceComplianceRecord: complianceRecord,
          destinationComplianceRecord: treasuryComplianceRecord,
          transferHookProgram: transferHook.programId,
          extraAccountMetaList,
          hookConfig,
          stablecoinProgram: stablecoin.programId,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([seizer])
        .rpc();
      await provider.connection.confirmTransaction(seizeSignature, 'confirmed');

      // Verify balance
      const targetAccount = await getAccount(provider.connection, targetAta, 'confirmed', TOKEN_2022_PROGRAM_ID);
      expect(targetAccount.amount).toBe(5_000n);
    });
  });
});
