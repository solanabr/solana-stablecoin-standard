/**
 * Pause Control Tests for SSS Stablecoin
 * 
 * Tests pause/unpause functionality and its effects on operations
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

describe('Pause Control', () => {
  describe('Mint Operations', () => {
    itIf('should block mint when paused', async () => {
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

      // Pause
      await stablecoin.methods
        .pause()
        .accounts({ authority: authority.publicKey, config, mint: mint.publicKey })
        .rpc();

      // Mint should fail when paused
      await expect(
        stablecoin.methods
          .mint(new anchor.BN(1000))
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

      // Unpause
      await stablecoin.methods
        .unpause()
        .accounts({ authority: authority.publicKey, config, mint: mint.publicKey })
        .rpc();

      // Mint should succeed after unpause
      await stablecoin.methods
        .mint(new anchor.BN(1000))
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

  describe('Freeze Operations', () => {
    itIf('should block freeze when paused', async () => {
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

      // Pause
      await stablecoin.methods
        .pause()
        .accounts({ authority: authority.publicKey, config, mint: mint.publicKey })
        .rpc();

      // Freeze should fail when paused
      await expect(
        stablecoin.methods
          .freezeAccount(userAta)
          .accounts({
            authority: authority.publicKey,
            config,
            mint: mint.publicKey,
            tokenAccount: userAta,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .rpc(),
      ).rejects.toThrow();

      // Unpause
      await stablecoin.methods
        .unpause()
        .accounts({ authority: authority.publicKey, config, mint: mint.publicKey })
        .rpc();

      // Freeze should succeed after unpause
      await stablecoin.methods
        .freezeAccount(userAta)
        .accounts({
          authority: authority.publicKey,
          config,
          mint: mint.publicKey,
          tokenAccount: userAta,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .rpc();
    });

    itIf('should allow thaw when paused', async () => {
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

      // Freeze first
      await stablecoin.methods
        .freezeAccount(userAta)
        .accounts({
          authority: authority.publicKey,
          config,
          mint: mint.publicKey,
          tokenAccount: userAta,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .rpc();

      // Pause
      await stablecoin.methods
        .pause()
        .accounts({ authority: authority.publicKey, config, mint: mint.publicKey })
        .rpc();

      // Thaw should succeed even when paused (emergency unfreeze)
      await stablecoin.methods
        .thawAccount(userAta)
        .accounts({
          authority: authority.publicKey,
          config,
          mint: mint.publicKey,
          tokenAccount: userAta,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .rpc();
    });
  });

  describe('Burn Operations', () => {
    itIf('should block burn when paused', async () => {
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

      // Mint some tokens first
      await stablecoin.methods
        .mint(new anchor.BN(10_000))
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

      // Pause
      await stablecoin.methods
        .pause()
        .accounts({ authority: authority.publicKey, config, mint: mint.publicKey })
        .rpc();

      // Burn should fail when paused
      await expect(
        stablecoin.methods
          .burn(new anchor.BN(1000))
          .accounts({
            authority: authority.publicKey,
            config,
            mint: mint.publicKey,
            from: userAta,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .rpc(),
      ).rejects.toThrow();
    });
  });
});
