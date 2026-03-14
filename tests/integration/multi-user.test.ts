/**
 * Multi-User Tests for SSS Stablecoin
 * 
 * Tests concurrent operations and quota isolation between users
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

function providerPayer(provider: anchor.AnchorProvider): Keypair {
  const walletWithPayer = provider.wallet as anchor.Wallet & { payer?: Keypair };
  if (!walletWithPayer.payer) {
    throw new Error('Provider wallet does not expose payer keypair');
  }
  return walletWithPayer.payer;
}

describe('Multi-User Scenarios', () => {
  describe('Multiple Minters', () => {
    itIf('should isolate quotas between minters', async () => {
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

      // Create additional minter
      const minter2 = Keypair.generate();
      const [minter2Role] = PublicKey.findProgramAddressSync(
        [Buffer.from('minter'), config.toBuffer(), minter2.publicKey.toBuffer()],
        stablecoin.programId,
      );

      // Add minter2 with separate quota
      const minter2Quota = 500_000;
      await stablecoin.methods
        .updateMinter({
          active: true,
          quotaAmount: new anchor.BN(minter2Quota),
          windowSeconds: new anchor.BN(86400),
          resetWindow: true,
        })
        .accounts({
          authority: master.publicKey,
          config,
          mint: mint.publicKey,
          minterAuthority: minter2.publicKey,
          minterRole: minter2Role,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      // Create recipients
      const recipient1 = Keypair.generate();
      const recipient2 = Keypair.generate();
      const ata1 = getAssociatedTokenAddressSync(
        mint.publicKey,
        recipient1.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID,
      );
      const ata2 = getAssociatedTokenAddressSync(
        mint.publicKey,
        recipient2.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID,
      );

      await provider.sendAndConfirm(
        new Transaction()
          .add(createAssociatedTokenAccountIdempotentInstruction(
            master.publicKey, ata1, recipient1.publicKey, mint.publicKey, TOKEN_2022_PROGRAM_ID,
          ))
          .add(createAssociatedTokenAccountIdempotentInstruction(
            master.publicKey, ata2, recipient2.publicKey, mint.publicKey, TOKEN_2022_PROGRAM_ID,
          )),
        [],
      );

      // Exhaust master quota
      const masterMintSignature = await stablecoin.methods
        .mint(new anchor.BN(1_000_000))
        .accounts({
          authority: master.publicKey,
          config,
          mint: mint.publicKey,
          recipient: ata1,
          minterRole: masterMinterRole,
          recipientComplianceRecord: PublicKey.default,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .rpc();
      await provider.connection.confirmTransaction(masterMintSignature, 'confirmed');

      // Fund minter2
      const latestBlockhash = await provider.connection.getLatestBlockhash();
      const airdropSignature = await provider.connection.requestAirdrop(minter2.publicKey, 1_000_000_000);
      await provider.connection.confirmTransaction(
        { signature: airdropSignature, ...latestBlockhash },
        'confirmed',
      );

      // Minter2 should still be able to mint (separate quota)
      const minter2MintSignature = await stablecoin.methods
        .mint(new anchor.BN(minter2Quota))
        .accounts({
          authority: minter2.publicKey,
          config,
          mint: mint.publicKey,
          recipient: ata2,
          minterRole: minter2Role,
          recipientComplianceRecord: PublicKey.default,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([minter2])
        .rpc();
      await provider.connection.confirmTransaction(minter2MintSignature, 'confirmed');

      // Verify balances
      const balance1 = await getAccount(provider.connection, ata1, 'confirmed', TOKEN_2022_PROGRAM_ID);
      const balance2 = await getAccount(provider.connection, ata2, 'confirmed', TOKEN_2022_PROGRAM_ID);
      expect(balance1.amount).toBe(1_000_000n);
      expect(balance2.amount).toBe(500_000n);
    });

    itIf('should disable inactive minter', async () => {
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

      // Create and then disable minter
      const minter = Keypair.generate();
      const [minterRole] = PublicKey.findProgramAddressSync(
        [Buffer.from('minter'), config.toBuffer(), minter.publicKey.toBuffer()],
        stablecoin.programId,
      );

      // Add minter
      await stablecoin.methods
        .updateMinter({
          active: true,
          quotaAmount: new anchor.BN(500_000),
          windowSeconds: new anchor.BN(86400),
          resetWindow: true,
        })
        .accounts({
          authority: master.publicKey,
          config,
          mint: mint.publicKey,
          minterAuthority: minter.publicKey,
          minterRole: minterRole,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      // Disable minter
      await stablecoin.methods
        .updateMinter({
          active: false,
          quotaAmount: new anchor.BN(0),
          windowSeconds: new anchor.BN(1),
          resetWindow: true,
        })
        .accounts({
          authority: master.publicKey,
          config,
          mint: mint.publicKey,
          minterAuthority: minter.publicKey,
          minterRole: minterRole,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const recipient = Keypair.generate();
      const ata = getAssociatedTokenAddressSync(
        mint.publicKey,
        recipient.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID,
      );

      await provider.sendAndConfirm(
        new Transaction().add(
          createAssociatedTokenAccountIdempotentInstruction(
            master.publicKey, ata, recipient.publicKey, mint.publicKey, TOKEN_2022_PROGRAM_ID,
          ),
        ),
        [],
      );

      await provider.connection.requestAirdrop(minter.publicKey, 1_000_000_000);
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Disabled minter should not be able to mint
      await expect(
        stablecoin.methods
          .mint(new anchor.BN(1000))
          .accounts({
            authority: minter.publicKey,
            config,
            mint: mint.publicKey,
            recipient: ata,
            minterRole: minterRole,
            recipientComplianceRecord: PublicKey.default,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .signers([minter])
          .rpc(),
      ).rejects.toThrow();
    });
  });

  describe('Multiple Recipients', () => {
    itIf('should mint to multiple recipients', async () => {
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
          initialMinterQuota: new anchor.BN(10_000_000),
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

      // Create 5 recipients
      const recipients = Array.from({ length: 5 }, () => Keypair.generate());
      const atas = recipients.map((r) =>
        getAssociatedTokenAddressSync(mint.publicKey, r.publicKey, false, TOKEN_2022_PROGRAM_ID),
      );

      const tx = new Transaction();
      atas.forEach((ata, i) => {
        tx.add(
          createAssociatedTokenAccountIdempotentInstruction(
            master.publicKey,
            ata,
            recipients[i].publicKey,
            mint.publicKey,
            TOKEN_2022_PROGRAM_ID,
          ),
        );
      });
      await provider.sendAndConfirm(tx, []);

      // Mint to each recipient
      for (let i = 0; i < recipients.length; i++) {
        const signature = await stablecoin.methods
          .mint(new anchor.BN(1000 * (i + 1)))
          .accounts({
            authority: master.publicKey,
            config,
            mint: mint.publicKey,
            recipient: atas[i],
            minterRole: masterMinterRole,
            recipientComplianceRecord: PublicKey.default,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .rpc();
        await provider.connection.confirmTransaction(signature, 'confirmed');
      }

      // Verify balances
      for (let i = 0; i < recipients.length; i++) {
        const balance = await getAccount(provider.connection, atas[i], 'confirmed', TOKEN_2022_PROGRAM_ID);
        expect(balance.amount).toBe(BigInt(1000 * (i + 1)));
      }
    });
  });

  describe('Authority Transfer', () => {
    itIf('should transfer authority and revoke old permissions', async () => {
      const provider = anchor.AnchorProvider.env();
      anchor.setProvider(provider);
      const stablecoin = anchor.workspace.SssStablecoin as anchor.Program;
      const oldMaster = providerPayer(provider);
      const mint = Keypair.generate();

      const [config] = PublicKey.findProgramAddressSync(
        [Buffer.from('config'), mint.publicKey.toBuffer()],
        stablecoin.programId,
      );
      const [masterMinterRole] = PublicKey.findProgramAddressSync(
        [Buffer.from('minter'), config.toBuffer(), oldMaster.publicKey.toBuffer()],
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
          payer: oldMaster.publicKey,
          authority: oldMaster.publicKey,
          config,
          masterMinterRole,
          mint: mint.publicKey,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([mint])
        .rpc();
      await finalizeCreation({ provider, stablecoin, authority: oldMaster, mint, config });

      const newMaster = Keypair.generate();
      await provider.connection.requestAirdrop(newMaster.publicKey, 1_000_000_000);
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Transfer authority
      await stablecoin.methods
        .transferAuthority(newMaster.publicKey)
        .accounts({
          authority: oldMaster.publicKey,
          config,
          mint: mint.publicKey,
        })
        .rpc();

      // Old master should not be able to update roles
      await expect(
        stablecoin.methods
          .updateRoles({ pauser: null, burner: null, blacklister: null, seizer: null, treasury: null })
          .accounts({
            authority: oldMaster.publicKey,
            config,
            mint: mint.publicKey,
          })
          .rpc(),
      ).rejects.toThrow();

      // New master should be able to update roles
      await stablecoin.methods
        .updateRoles({ pauser: newMaster.publicKey, burner: null, blacklister: null, seizer: null, treasury: null })
        .accounts({
          authority: newMaster.publicKey,
          config,
          mint: mint.publicKey,
        })
        .signers([newMaster])
        .rpc();
    });
  });
});
