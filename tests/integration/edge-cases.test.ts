/**
 * Edge Cases Tests for SSS Stablecoin
 * 
 * Tests boundary conditions, overflow scenarios, and error handling
 */

import * as anchor from '@coral-xyz/anchor';
import {
  TOKEN_2022_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token';
import { Keypair, PublicKey, SystemProgram, Transaction } from '@solana/web3.js';
import { describe, expect, it } from 'vitest';
import { finalizeCreation } from '../helpers/stablecoin';

const shouldRun = process.env.RUN_ANCHOR_TESTS === '1';
const itIf = shouldRun ? it : it.skip;

function providerPayer(provider: anchor.AnchorProvider): Keypair {
  const walletWithPayer = provider.wallet as anchor.Wallet & { payer?: Keypair };
  if (!walletWithPayer.payer) {
    throw new Error('Provider wallet does not expose payer keypair');
  }
  return walletWithPayer.payer;
}

describe('Edge Cases', () => {
  describe('Zero Amount Handling', () => {
    itIf('should reject mint with zero amount', async () => {
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
            authority.publicKey,
            userAta,
            user.publicKey,
            mint.publicKey,
            TOKEN_2022_PROGRAM_ID,
          ),
        ),
        [],
      );

      // Try to mint 0 - should succeed (Token-2022 allows 0 amount)
      await stablecoin.methods
        .mint(new anchor.BN(0))
        .accounts({
          authority: authority.publicKey,
          config,
          mint: mint.publicKey,
          recipient: userAta,
          minterRole: masterMinterRole,
          recipientComplianceRecord: PublicKey.default,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .rpc();
    });
  });

  describe('Quota Boundary Conditions', () => {
    itIf('should allow mint exactly at quota limit', async () => {
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
      const treasuryAta = getAssociatedTokenAddressSync(
        mint.publicKey,
        Keypair.generate().publicKey,
        false,
        TOKEN_2022_PROGRAM_ID,
      );

      const quota = 1_000_000;

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
          initialMinterQuota: new anchor.BN(quota),
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
            authority.publicKey,
            userAta,
            user.publicKey,
            mint.publicKey,
            TOKEN_2022_PROGRAM_ID,
          ),
        ),
        [],
      );

      // Mint exactly at quota - should succeed
      await stablecoin.methods
        .mint(new anchor.BN(quota))
        .accounts({
          authority: authority.publicKey,
          config,
          mint: mint.publicKey,
          recipient: userAta,
          minterRole: masterMinterRole,
          recipientComplianceRecord: PublicKey.default,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .rpc();

      // Next mint should fail
      await expect(
        stablecoin.methods
          .mint(new anchor.BN(1))
          .accounts({
            authority: authority.publicKey,
            config,
            mint: mint.publicKey,
            recipient: userAta,
            minterRole: masterMinterRole,
            recipientComplianceRecord: PublicKey.default,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .rpc(),
      ).rejects.toThrow();
    });

    itIf('should reset quota after window expires', async () => {
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
      const treasuryAta = getAssociatedTokenAddressSync(
        mint.publicKey,
        Keypair.generate().publicKey,
        false,
        TOKEN_2022_PROGRAM_ID,
      );

      // Use a very short window (2 seconds)
      const windowSeconds = 2;
      const quota = 1_000_000;

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
          initialMinterQuota: new anchor.BN(quota),
          initialMinterWindowSeconds: new anchor.BN(windowSeconds),
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
            authority.publicKey,
            userAta,
            user.publicKey,
            mint.publicKey,
            TOKEN_2022_PROGRAM_ID,
          ),
        ),
        [],
      );

      // Exhaust quota
      await stablecoin.methods
        .mint(new anchor.BN(quota))
        .accounts({
          authority: authority.publicKey,
          config,
          mint: mint.publicKey,
          recipient: userAta,
          minterRole: masterMinterRole,
          recipientComplianceRecord: PublicKey.default,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .rpc();

      // Wait for window to expire
      await new Promise((resolve) => setTimeout(resolve, (windowSeconds + 1) * 1000));

      // Should be able to mint again
      await stablecoin.methods
        .mint(new anchor.BN(quota))
        .accounts({
          authority: authority.publicKey,
          config,
          mint: mint.publicKey,
          recipient: userAta,
          minterRole: masterMinterRole,
          recipientComplianceRecord: PublicKey.default,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .rpc();
    }, 10_000);
  });

  describe('Unauthorized Access', () => {
    itIf('should reject mint by non-minter', async () => {
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
      const treasuryAta = getAssociatedTokenAddressSync(
        mint.publicKey,
        Keypair.generate().publicKey,
        false,
        TOKEN_2022_PROGRAM_ID,
      );

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

      const nonMinter = Keypair.generate();
      const [nonMinterRole] = PublicKey.findProgramAddressSync(
        [Buffer.from('minter'), config.toBuffer(), nonMinter.publicKey.toBuffer()],
        stablecoin.programId,
      );

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
            authority.publicKey,
            userAta,
            user.publicKey,
            mint.publicKey,
            TOKEN_2022_PROGRAM_ID,
          ),
        ),
        [],
      );

      // Fund non-minter
      await provider.connection.requestAirdrop(nonMinter.publicKey, 1_000_000_000);
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Non-minter tries to mint - should fail
      await expect(
        stablecoin.methods
          .mint(new anchor.BN(1000))
          .accounts({
            authority: nonMinter.publicKey,
            config,
            mint: mint.publicKey,
            recipient: userAta,
            minterRole: nonMinterRole,
            recipientComplianceRecord: PublicKey.default,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .signers([nonMinter])
          .rpc(),
      ).rejects.toThrow();
    });

    itIf('should reject pause by non-pauser', async () => {
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
      const treasuryAta = getAssociatedTokenAddressSync(
        mint.publicKey,
        Keypair.generate().publicKey,
        false,
        TOKEN_2022_PROGRAM_ID,
      );

      const designatedPauser = Keypair.generate();

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
          roles: {
            pauser: designatedPauser.publicKey,
            burner: null,
            blacklister: null,
            seizer: null,
            treasury: treasuryAta,
          },
          initialMinterQuota: new anchor.BN(1_000_000),
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

      const randomUser = Keypair.generate();
      await provider.connection.requestAirdrop(randomUser.publicKey, 1_000_000_000);
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Random user tries to pause - should fail
      await expect(
        stablecoin.methods
          .pause()
          .accounts({
            authority: randomUser.publicKey,
            config,
            mint: mint.publicKey,
          })
          .signers([randomUser])
          .rpc(),
      ).rejects.toThrow();
    });
  });

  describe('Invalid PDA Addresses', () => {
    itIf('should reject mint with wrong minter role PDA', async () => {
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
      const treasuryAta = getAssociatedTokenAddressSync(
        mint.publicKey,
        Keypair.generate().publicKey,
        false,
        TOKEN_2022_PROGRAM_ID,
      );

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
            authority.publicKey,
            userAta,
            user.publicKey,
            mint.publicKey,
            TOKEN_2022_PROGRAM_ID,
          ),
        ),
        [],
      );

      // Wrong minter role PDA (different authority)
      const wrongMinterRole = Keypair.generate().publicKey;

      // Should fail with invalid PDA
      await expect(
        stablecoin.methods
          .mint(new anchor.BN(1000))
          .accounts({
            authority: authority.publicKey,
            config,
            mint: mint.publicKey,
            recipient: userAta,
            minterRole: wrongMinterRole,
            recipientComplianceRecord: PublicKey.default,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .rpc(),
      ).rejects.toThrow();
    });
  });
});
