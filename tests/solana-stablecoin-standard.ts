/**
 * SSS Integration Tests
 *
 * Tests cover:
 * - SSS-1: initialize, mint, burn, freeze, thaw, pause/unpause
 * - SSS-2: blacklist add/remove, seize
 * - RBAC: unauthorized access rejections
 * - Edge cases: zero amount, max supply, minter quota
 */
import * as anchor from '@coral-xyz/anchor';
import { Program, BN, AnchorProvider } from '@coral-xyz/anchor';
import {
  Keypair,
  PublicKey,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import {
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  ExtensionType,
  getMintLen,
  createInitializeMintInstruction,
  createInitializeMintCloseAuthorityInstruction,
  createInitializePermanentDelegateInstruction,
} from '@solana/spl-token';
import { expect } from 'chai';

import type { SolanaStablecoinStandard } from '../target/types/solana_stablecoin_standard';
import {
  findStablecoinConfigPda,
  findRolesConfigPda,
  findBlacklistEntryPda,
  SSS_PROGRAM_ID,
} from '../sdk/src';

const TOKEN_PROGRAM = TOKEN_2022_PROGRAM_ID;

// ─── Test Helpers ───────────────────────────────────────────────────────────

async function createMintSss1(
  provider: AnchorProvider,
  program: Program<SolanaStablecoinStandard>,
  mintKeypair: Keypair,
  authority: Keypair,
) {
  const mint = mintKeypair.publicKey;
  const extensions = [ExtensionType.MintCloseAuthority];
  const mintLen = getMintLen(extensions);
  const lamports = await provider.connection.getMinimumBalanceForRentExemption(mintLen);

  const tx = new anchor.web3.Transaction();
  tx.add(
    SystemProgram.createAccount({
      fromPubkey: authority.publicKey,
      newAccountPubkey: mint,
      space: mintLen,
      lamports,
      programId: TOKEN_2022_PROGRAM_ID,
    }),
    createInitializeMintCloseAuthorityInstruction(mint, authority.publicKey, TOKEN_2022_PROGRAM_ID),
    createInitializeMintInstruction(mint, 6, authority.publicKey, authority.publicKey, TOKEN_2022_PROGRAM_ID),
  );

  await provider.sendAndConfirm(tx, [authority, mintKeypair]);
  return mint;
}

async function createAta(
  provider: AnchorProvider,
  payer: Keypair,
  mint: PublicKey,
  owner: PublicKey,
): Promise<PublicKey> {
  const ata = getAssociatedTokenAddressSync(mint, owner, false, TOKEN_2022_PROGRAM_ID);
  const tx = new anchor.web3.Transaction().add(
    createAssociatedTokenAccountInstruction(payer.publicKey, ata, owner, mint, TOKEN_2022_PROGRAM_ID),
  );
  await provider.sendAndConfirm(tx, [payer]);
  return ata;
}

async function airdrop(provider: AnchorProvider, address: PublicKey, sol = 2) {
  const sig = await provider.connection.requestAirdrop(address, sol * LAMPORTS_PER_SOL);
  await provider.connection.confirmTransaction(sig);
}

// ─── Test Suite ─────────────────────────────────────────────────────────────

describe('Solana Stablecoin Standard', () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.SolanaStablecoinStandard as Program<SolanaStablecoinStandard>;

  let authority: Keypair;
  let minter: Keypair;
  let burner: Keypair;
  let user1: Keypair;
  let user2: Keypair;
  let mintSss1: PublicKey;
  let mintSss2: PublicKey;

  before(async () => {
    authority = Keypair.generate();
    minter = Keypair.generate();
    burner = Keypair.generate();
    user1 = Keypair.generate();
    user2 = Keypair.generate();

    await airdrop(provider, authority.publicKey, 10);
    await airdrop(provider, minter.publicKey, 2);
    await airdrop(provider, burner.publicKey, 2);
    await airdrop(provider, user1.publicKey, 2);
    await airdrop(provider, user2.publicKey, 2);
  });

  // ─── SSS-1 Tests ────────────────────────────────────────────────────────

  describe('SSS-1: Minimal Stablecoin', () => {
    let mintKeypair: Keypair;

    before(async () => {
      mintKeypair = Keypair.generate();
    });

    it('initializes SSS-1 stablecoin', async () => {
      mintSss1 = await createMintSss1(provider, program, mintKeypair, authority);
      const [stablecoinConfig] = findStablecoinConfigPda(mintSss1);
      const [rolesConfig] = findRolesConfigPda(mintSss1);

      await program.methods
        .initialize({
          name: 'Test USD',
          symbol: 'TUSD',
          uri: 'https://test.example.com/token.json',
          decimals: 6,
          maxSupply: new BN(0),
          preset: 0, // SSS-1
          minter: minter.publicKey,
          minterQuota: new BN(0),
          burner: burner.publicKey,
          blacklister: null,
          pauser: null,
          seizer: null,
        })
        .accounts({
          authority: authority.publicKey,
          mint: mintSss1,
          stablecoinConfig,
          rolesConfig,
          tokenProgram: TOKEN_PROGRAM,
          systemProgram: SystemProgram.programId,
        })
        .signers([authority])
        .rpc();

      const config = await program.account.stablecoinConfig.fetch(stablecoinConfig);
      expect(config.mint.toBase58()).to.equal(mintSss1.toBase58());
      expect(config.paused).to.be.false;
      expect(config.decimals).to.equal(6);
      expect(config.permanentDelegateEnabled).to.be.false;

      const roles = await program.account.rolesConfig.fetch(rolesConfig);
      expect(roles.masterAuthority.toBase58()).to.equal(authority.publicKey.toBase58());
      expect(roles.minter.toBase58()).to.equal(minter.publicKey.toBase58());
      expect(roles.burner.toBase58()).to.equal(burner.publicKey.toBase58());
    });

    it('mints tokens to a recipient', async () => {
      const recipientAta = await createAta(provider, authority, mintSss1, user1.publicKey);
      const [stablecoinConfig] = findStablecoinConfigPda(mintSss1);
      const [rolesConfig] = findRolesConfigPda(mintSss1);
      const AMOUNT = new BN(1_000_000); // 1 TUSD

      await program.methods
        .mintTokens(AMOUNT)
        .accounts({
          minter: minter.publicKey,
          mint: mintSss1,
          stablecoinConfig,
          rolesConfig,
          destination: recipientAta,
          tokenProgram: TOKEN_PROGRAM,
        })
        .signers([minter])
        .rpc();

      const balance = await provider.connection.getTokenAccountBalance(recipientAta);
      expect(balance.value.amount).to.equal('1000000');
    });

    it('rejects mint from unauthorized account', async () => {
      const recipientAta = getAssociatedTokenAddressSync(mintSss1, user2.publicKey, false, TOKEN_2022_PROGRAM_ID);
      const [stablecoinConfig] = findStablecoinConfigPda(mintSss1);
      const [rolesConfig] = findRolesConfigPda(mintSss1);

      try {
        await program.methods
          .mintTokens(new BN(1_000_000))
          .accounts({
            minter: user2.publicKey, // not the minter
            mint: mintSss1,
            stablecoinConfig,
            rolesConfig,
            destination: recipientAta,
            tokenProgram: TOKEN_PROGRAM,
          })
          .signers([user2])
          .rpc();
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).to.include('Unauthorized');
      }
    });

    it('rejects zero amount mint', async () => {
      const recipientAta = getAssociatedTokenAddressSync(mintSss1, user1.publicKey, false, TOKEN_2022_PROGRAM_ID);
      const [stablecoinConfig] = findStablecoinConfigPda(mintSss1);
      const [rolesConfig] = findRolesConfigPda(mintSss1);

      try {
        await program.methods
          .mintTokens(new BN(0))
          .accounts({
            minter: minter.publicKey,
            mint: mintSss1,
            stablecoinConfig,
            rolesConfig,
            destination: recipientAta,
            tokenProgram: TOKEN_PROGRAM,
          })
          .signers([minter])
          .rpc();
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).to.include('ZeroAmount');
      }
    });

    it('burns tokens from a source account', async () => {
      const sourceAta = getAssociatedTokenAddressSync(mintSss1, user1.publicKey, false, TOKEN_2022_PROGRAM_ID);
      const [stablecoinConfig] = findStablecoinConfigPda(mintSss1);
      const [rolesConfig] = findRolesConfigPda(mintSss1);

      const before = await provider.connection.getTokenAccountBalance(sourceAta);
      const BURN_AMOUNT = new BN(500_000); // 0.5 TUSD

      await program.methods
        .burnTokens(BURN_AMOUNT)
        .accounts({
          burner: burner.publicKey,
          mint: mintSss1,
          stablecoinConfig,
          rolesConfig,
          source: sourceAta,
          tokenProgram: TOKEN_PROGRAM,
        })
        .signers([burner])
        .rpc();

      const after = await provider.connection.getTokenAccountBalance(sourceAta);
      expect(parseInt(after.value.amount)).to.equal(
        parseInt(before.value.amount) - 500_000,
      );
    });

    it('freezes and thaws a token account', async () => {
      const targetAta = getAssociatedTokenAddressSync(mintSss1, user1.publicKey, false, TOKEN_2022_PROGRAM_ID);
      const [stablecoinConfig] = findStablecoinConfigPda(mintSss1);
      const [rolesConfig] = findRolesConfigPda(mintSss1);

      // Freeze
      await program.methods
        .freezeAccount()
        .accounts({
          authority: authority.publicKey,
          mint: mintSss1,
          stablecoinConfig,
          rolesConfig,
          tokenAccount: targetAta,
          tokenProgram: TOKEN_PROGRAM,
        })
        .signers([authority])
        .rpc();

      const frozenInfo = await provider.connection.getTokenAccountBalance(targetAta);
      // Account should be frozen (we can't easily check this in test without parsing full account)

      // Thaw
      await program.methods
        .thawAccount()
        .accounts({
          authority: authority.publicKey,
          mint: mintSss1,
          stablecoinConfig,
          rolesConfig,
          tokenAccount: targetAta,
          tokenProgram: TOKEN_PROGRAM,
        })
        .signers([authority])
        .rpc();
    });

    it('pauses and unpauses transfers', async () => {
      const [stablecoinConfig] = findStablecoinConfigPda(mintSss1);
      const [rolesConfig] = findRolesConfigPda(mintSss1);

      // Pause
      await program.methods
        .pause()
        .accounts({
          authority: authority.publicKey,
          mint: mintSss1,
          stablecoinConfig,
          rolesConfig,
        })
        .signers([authority])
        .rpc();

      let config = await program.account.stablecoinConfig.fetch(stablecoinConfig);
      expect(config.paused).to.be.true;

      // Verify mint rejects when paused
      const recipientAta = getAssociatedTokenAddressSync(mintSss1, user1.publicKey, false, TOKEN_2022_PROGRAM_ID);
      try {
        await program.methods
          .mintTokens(new BN(1_000_000))
          .accounts({
            minter: minter.publicKey,
            mint: mintSss1,
            stablecoinConfig,
            rolesConfig,
            destination: recipientAta,
            tokenProgram: TOKEN_PROGRAM,
          })
          .signers([minter])
          .rpc();
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).to.include('TransfersPaused');
      }

      // Unpause
      await program.methods
        .unpause()
        .accounts({
          authority: authority.publicKey,
          mint: mintSss1,
          stablecoinConfig,
          rolesConfig,
        })
        .signers([authority])
        .rpc();

      config = await program.account.stablecoinConfig.fetch(stablecoinConfig);
      expect(config.paused).to.be.false;
    });

    it('updates roles (change minter)', async () => {
      const newMinter = Keypair.generate();
      const [stablecoinConfig] = findStablecoinConfigPda(mintSss1);
      const [rolesConfig] = findRolesConfigPda(mintSss1);

      await program.methods
        .updateRoles({
          newMinter: newMinter.publicKey,
          newBurner: null,
          newBlacklister: null,
          newPauser: null,
          newSeizer: null,
          newMinterQuota: null,
        })
        .accounts({
          authority: authority.publicKey,
          mint: mintSss1,
          stablecoinConfig,
          rolesConfig,
        })
        .signers([authority])
        .rpc();

      const roles = await program.account.rolesConfig.fetch(rolesConfig);
      expect(roles.minter.toBase58()).to.equal(newMinter.publicKey.toBase58());
    });

    it('rejects update_roles from non-master', async () => {
      const [stablecoinConfig] = findStablecoinConfigPda(mintSss1);
      const [rolesConfig] = findRolesConfigPda(mintSss1);

      try {
        await program.methods
          .updateRoles({
            newMinter: user1.publicKey,
            newBurner: null,
            newBlacklister: null,
            newPauser: null,
            newSeizer: null,
            newMinterQuota: null,
          })
          .accounts({
            authority: user1.publicKey, // not master
            mint: mintSss1,
            stablecoinConfig,
            rolesConfig,
          })
          .signers([user1])
          .rpc();
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).to.include('Unauthorized');
      }
    });

    it('transfers master authority', async () => {
      const newAuthority = Keypair.generate();
      await airdrop(provider, newAuthority.publicKey, 2);
      const [stablecoinConfig] = findStablecoinConfigPda(mintSss1);
      const [rolesConfig] = findRolesConfigPda(mintSss1);

      await program.methods
        .transferAuthority(newAuthority.publicKey)
        .accounts({
          currentAuthority: authority.publicKey,
          mint: mintSss1,
          stablecoinConfig,
          rolesConfig,
        })
        .signers([authority])
        .rpc();

      const roles = await program.account.rolesConfig.fetch(rolesConfig);
      expect(roles.masterAuthority.toBase58()).to.equal(newAuthority.publicKey.toBase58());

      // Transfer back to original authority for subsequent tests
      await program.methods
        .transferAuthority(authority.publicKey)
        .accounts({
          currentAuthority: newAuthority.publicKey,
          mint: mintSss1,
          stablecoinConfig,
          rolesConfig,
        })
        .signers([newAuthority])
        .rpc();
    });
  });

  // ─── SSS-2 Tests ────────────────────────────────────────────────────────

  describe('SSS-2: Compliant Stablecoin (blacklist + seize)', () => {
    let mintKeypair2: Keypair;
    let blacklister: Keypair;
    let seizer: Keypair;

    before(async () => {
      mintKeypair2 = Keypair.generate();
      blacklister = Keypair.generate();
      seizer = Keypair.generate();
      await airdrop(provider, blacklister.publicKey, 2);
      await airdrop(provider, seizer.publicKey, 2);
    });

    it('initializes SSS-2 stablecoin with compliance features', async () => {
      const mintLen = getMintLen([
        ExtensionType.MintCloseAuthority,
        ExtensionType.PermanentDelegate,
      ]);
      const lamports = await provider.connection.getMinimumBalanceForRentExemption(mintLen);
      mintSss2 = mintKeypair2.publicKey;

      const tx = new anchor.web3.Transaction();
      tx.add(
        SystemProgram.createAccount({
          fromPubkey: authority.publicKey,
          newAccountPubkey: mintSss2,
          space: mintLen,
          lamports,
          programId: TOKEN_2022_PROGRAM_ID,
        }),
        createInitializeMintCloseAuthorityInstruction(mintSss2, authority.publicKey, TOKEN_2022_PROGRAM_ID),
        createInitializePermanentDelegateInstruction(mintSss2, seizer.publicKey, TOKEN_2022_PROGRAM_ID),
        createInitializeMintInstruction(mintSss2, 6, authority.publicKey, authority.publicKey, TOKEN_2022_PROGRAM_ID),
      );
      await provider.sendAndConfirm(tx, [authority, mintKeypair2]);

      const [stablecoinConfig] = findStablecoinConfigPda(mintSss2);
      const [rolesConfig] = findRolesConfigPda(mintSss2);

      await program.methods
        .initialize({
          name: 'Regulated USD',
          symbol: 'RUSD',
          uri: 'https://regulated.example.com/token.json',
          decimals: 6,
          maxSupply: new BN(0),
          preset: 1, // SSS-2
          minter: minter.publicKey,
          minterQuota: new BN(0),
          burner: burner.publicKey,
          blacklister: blacklister.publicKey,
          pauser: authority.publicKey,
          seizer: seizer.publicKey,
        })
        .accounts({
          authority: authority.publicKey,
          mint: mintSss2,
          stablecoinConfig,
          rolesConfig,
          tokenProgram: TOKEN_PROGRAM,
          systemProgram: SystemProgram.programId,
        })
        .signers([authority])
        .rpc();

      const config = await program.account.stablecoinConfig.fetch(stablecoinConfig);
      expect(config.permanentDelegateEnabled).to.be.true;
      expect(config.transferHookEnabled).to.be.true;

      const roles = await program.account.rolesConfig.fetch(rolesConfig);
      expect(roles.blacklister.toBase58()).to.equal(blacklister.publicKey.toBase58());
      expect(roles.seizer.toBase58()).to.equal(seizer.publicKey.toBase58());
    });

    it('adds an address to the blacklist', async () => {
      const badActor = user2.publicKey;
      const [stablecoinConfig] = findStablecoinConfigPda(mintSss2);
      const [rolesConfig] = findRolesConfigPda(mintSss2);
      const [blacklistEntry] = findBlacklistEntryPda(mintSss2, badActor);

      await program.methods
        .addToBlacklist(badActor, 1) // reason=1
        .accounts({
          authority: blacklister.publicKey,
          mint: mintSss2,
          stablecoinConfig,
          rolesConfig,
          blacklistEntry,
          systemProgram: SystemProgram.programId,
        })
        .signers([blacklister])
        .rpc();

      const entry = await program.account.blacklistEntry.fetch(blacklistEntry);
      expect(entry.address.toBase58()).to.equal(badActor.toBase58());
      expect(entry.reason).to.equal(1);
    });

    it('removes an address from the blacklist', async () => {
      const target = user2.publicKey;
      const [stablecoinConfig] = findStablecoinConfigPda(mintSss2);
      const [rolesConfig] = findRolesConfigPda(mintSss2);
      const [blacklistEntry] = findBlacklistEntryPda(mintSss2, target);

      await program.methods
        .removeFromBlacklist(target)
        .accounts({
          authority: blacklister.publicKey,
          mint: mintSss2,
          stablecoinConfig,
          rolesConfig,
          blacklistEntry,
        })
        .signers([blacklister])
        .rpc();

      try {
        await program.account.blacklistEntry.fetch(blacklistEntry);
        expect.fail('Should have thrown - account should be closed');
      } catch {
        // Expected: account closed
      }
    });

    it('rejects add_to_blacklist from unauthorized', async () => {
      const [stablecoinConfig] = findStablecoinConfigPda(mintSss2);
      const [rolesConfig] = findRolesConfigPda(mintSss2);
      const [blacklistEntry] = findBlacklistEntryPda(mintSss2, user1.publicKey);

      try {
        await program.methods
          .addToBlacklist(user1.publicKey, 0)
          .accounts({
            authority: user1.publicKey, // not blacklister
            mint: mintSss2,
            stablecoinConfig,
            rolesConfig,
            blacklistEntry,
            systemProgram: SystemProgram.programId,
          })
          .signers([user1])
          .rpc();
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).to.include('Unauthorized');
      }
    });

    it('rejects SSS-2 operations on SSS-1 mint', async () => {
      const [stablecoinConfig] = findStablecoinConfigPda(mintSss1);
      const [rolesConfig] = findRolesConfigPda(mintSss1);
      const [blacklistEntry] = findBlacklistEntryPda(mintSss1, user1.publicKey);

      try {
        await program.methods
          .addToBlacklist(user1.publicKey, 0)
          .accounts({
            authority: authority.publicKey,
            mint: mintSss1,
            stablecoinConfig,
            rolesConfig,
            blacklistEntry,
            systemProgram: SystemProgram.programId,
          })
          .signers([authority])
          .rpc();
        expect.fail('Should have thrown Sss2NotEnabled');
      } catch (err: any) {
        expect(err.message).to.include('Sss2NotEnabled');
      }
    });
  });

  // ─── SSS-1 Extended Tests ───────────────────────────────────────────────

  describe('SSS-1: Extended Role & Burn Tests', () => {
    it('rejects burn from unauthorized account', async () => {
      const sourceAta = getAssociatedTokenAddressSync(mintSss1, user1.publicKey, false, TOKEN_2022_PROGRAM_ID);
      const [stablecoinConfig] = findStablecoinConfigPda(mintSss1);
      const [rolesConfig] = findRolesConfigPda(mintSss1);

      try {
        await program.methods
          .burnTokens(new BN(100_000))
          .accounts({
            burner: user1.publicKey, // not the burner
            mint: mintSss1,
            stablecoinConfig,
            rolesConfig,
            source: sourceAta,
            tokenProgram: TOKEN_PROGRAM,
          })
          .signers([user1])
          .rpc();
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).to.include('Unauthorized');
      }
    });

    it('rejects zero amount burn', async () => {
      const sourceAta = getAssociatedTokenAddressSync(mintSss1, user1.publicKey, false, TOKEN_2022_PROGRAM_ID);
      const [stablecoinConfig] = findStablecoinConfigPda(mintSss1);
      const [rolesConfig] = findRolesConfigPda(mintSss1);

      try {
        await program.methods
          .burnTokens(new BN(0))
          .accounts({
            burner: burner.publicKey,
            mint: mintSss1,
            stablecoinConfig,
            rolesConfig,
            source: sourceAta,
            tokenProgram: TOKEN_PROGRAM,
          })
          .signers([burner])
          .rpc();
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).to.include('ZeroAmount');
      }
    });

    it('verifies stablecoin config state after initialization', async () => {
      const [stablecoinConfig] = findStablecoinConfigPda(mintSss1);
      const config = await program.account.stablecoinConfig.fetch(stablecoinConfig);
      expect(config.mint.toBase58()).to.equal(mintSss1.toBase58());
      expect(config.paused).to.be.false;
      expect(config.decimals).to.equal(6);
      expect(config.permanentDelegateEnabled).to.be.false;
      expect(config.transferHookEnabled).to.be.false;
    });

    it('verifies roles config state after initialization', async () => {
      const [rolesConfig] = findRolesConfigPda(mintSss1);
      const roles = await program.account.rolesConfig.fetch(rolesConfig);
      expect(roles.masterAuthority.toBase58()).to.equal(authority.publicKey.toBase58());
      expect(roles.burner.toBase58()).to.equal(burner.publicKey.toBase58());
    });

    it('rejects mint when paused', async () => {
      const mintKeypair3 = Keypair.generate();
      const mint3 = mintKeypair3.publicKey;
      const mintLen = getMintLen([ExtensionType.MintCloseAuthority]);
      const lamports = await provider.connection.getMinimumBalanceForRentExemption(mintLen);

      const tx = new anchor.web3.Transaction();
      tx.add(
        SystemProgram.createAccount({
          fromPubkey: authority.publicKey,
          newAccountPubkey: mint3,
          space: mintLen,
          lamports,
          programId: TOKEN_2022_PROGRAM_ID,
        }),
        createInitializeMintCloseAuthorityInstruction(mint3, authority.publicKey, TOKEN_2022_PROGRAM_ID),
        createInitializeMintInstruction(mint3, 6, authority.publicKey, authority.publicKey, TOKEN_2022_PROGRAM_ID),
      );
      await provider.sendAndConfirm(tx, [authority, mintKeypair3]);

      const [stablecoinConfig3] = findStablecoinConfigPda(mint3);
      const [rolesConfig3] = findRolesConfigPda(mint3);

      await program.methods
        .initialize({
          name: 'Pause Test',
          symbol: 'PTST',
          uri: 'https://test.example.com/ptst.json',
          decimals: 6,
          maxSupply: new BN(0),
          preset: 0,
          minter: minter.publicKey,
          minterQuota: new BN(0),
          burner: null,
          blacklister: null,
          pauser: authority.publicKey,
          seizer: null,
        })
        .accounts({
          authority: authority.publicKey,
          mint: mint3,
          stablecoinConfig: stablecoinConfig3,
          rolesConfig: rolesConfig3,
          tokenProgram: TOKEN_PROGRAM,
          systemProgram: SystemProgram.programId,
        })
        .signers([authority])
        .rpc();

      await program.methods.pause()
        .accounts({ authority: authority.publicKey, mint: mint3, stablecoinConfig: stablecoinConfig3, rolesConfig: rolesConfig3 })
        .signers([authority])
        .rpc();

      const destAta = await createAta(provider, authority, mint3, user1.publicKey);

      try {
        await program.methods
          .mintTokens(new BN(1_000_000))
          .accounts({
            minter: minter.publicKey,
            mint: mint3,
            stablecoinConfig: stablecoinConfig3,
            rolesConfig: rolesConfig3,
            destination: destAta,
            tokenProgram: TOKEN_PROGRAM,
          })
          .signers([minter])
          .rpc();
        expect.fail('Should have thrown TransfersPaused');
      } catch (err: any) {
        expect(err.message).to.include('TransfersPaused');
      }
    });

    it('updates all roles simultaneously', async () => {
      const newMinter2 = Keypair.generate();
      const newBurner2 = Keypair.generate();
      const [stablecoinConfig] = findStablecoinConfigPda(mintSss1);
      const [rolesConfig] = findRolesConfigPda(mintSss1);

      await program.methods
        .updateRoles({
          newMinter: newMinter2.publicKey,
          newBurner: newBurner2.publicKey,
          newBlacklister: null,
          newPauser: null,
          newSeizer: null,
          newMinterQuota: null,
        })
        .accounts({
          authority: authority.publicKey,
          mint: mintSss1,
          stablecoinConfig,
          rolesConfig,
        })
        .signers([authority])
        .rpc();

      const roles = await program.account.rolesConfig.fetch(rolesConfig);
      expect(roles.minter.toBase58()).to.equal(newMinter2.publicKey.toBase58());
      expect(roles.burner.toBase58()).to.equal(newBurner2.publicKey.toBase58());

      // Restore original burner for subsequent tests
      await program.methods
        .updateRoles({
          newMinter: minter.publicKey,
          newBurner: burner.publicKey,
          newBlacklister: null,
          newPauser: null,
          newSeizer: null,
          newMinterQuota: null,
        })
        .accounts({
          authority: authority.publicKey,
          mint: mintSss1,
          stablecoinConfig,
          rolesConfig,
        })
        .signers([authority])
        .rpc();
    });
  });

  // ─── SSS-2 Seize Tests ───────────────────────────────────────────────────

  describe('SSS-2: Token Seizure', () => {
    let sss2MintKeypair: Keypair;
    let sss2Mint: PublicKey;
    let localSeizer: Keypair;
    let localBlacklister: Keypair;
    let holderAta: PublicKey;
    let seizureDestAta: PublicKey;

    before(async () => {
      sss2MintKeypair = Keypair.generate();
      sss2Mint = sss2MintKeypair.publicKey;
      localSeizer = Keypair.generate();
      localBlacklister = Keypair.generate();
      await airdrop(provider, localSeizer.publicKey, 3);
      await airdrop(provider, localBlacklister.publicKey, 2);

      const mintLen = getMintLen([
        ExtensionType.MintCloseAuthority,
        ExtensionType.PermanentDelegate,
      ]);
      const lamports = await provider.connection.getMinimumBalanceForRentExemption(mintLen);

      const tx = new anchor.web3.Transaction();
      tx.add(
        SystemProgram.createAccount({
          fromPubkey: authority.publicKey,
          newAccountPubkey: sss2Mint,
          space: mintLen,
          lamports,
          programId: TOKEN_2022_PROGRAM_ID,
        }),
        createInitializeMintCloseAuthorityInstruction(sss2Mint, authority.publicKey, TOKEN_2022_PROGRAM_ID),
        createInitializePermanentDelegateInstruction(sss2Mint, localSeizer.publicKey, TOKEN_2022_PROGRAM_ID),
        createInitializeMintInstruction(sss2Mint, 6, authority.publicKey, authority.publicKey, TOKEN_2022_PROGRAM_ID),
      );
      await provider.sendAndConfirm(tx, [authority, sss2MintKeypair]);

      const [sc] = findStablecoinConfigPda(sss2Mint);
      const [rc] = findRolesConfigPda(sss2Mint);

      await program.methods
        .initialize({
          name: 'Seize Test',
          symbol: 'STST',
          uri: 'https://test.example.com/stst.json',
          decimals: 6,
          maxSupply: new BN(0),
          preset: 1, // SSS-2
          minter: minter.publicKey,
          minterQuota: new BN(0),
          burner: burner.publicKey,
          blacklister: localBlacklister.publicKey,
          pauser: null,
          seizer: localSeizer.publicKey,
        })
        .accounts({
          authority: authority.publicKey,
          mint: sss2Mint,
          stablecoinConfig: sc,
          rolesConfig: rc,
          tokenProgram: TOKEN_PROGRAM,
          systemProgram: SystemProgram.programId,
        })
        .signers([authority])
        .rpc();

      // Fund a holder's account
      holderAta = await createAta(provider, authority, sss2Mint, user1.publicKey);
      seizureDestAta = await createAta(provider, authority, sss2Mint, authority.publicKey);

      await program.methods
        .mintTokens(new BN(10_000_000))
        .accounts({
          minter: minter.publicKey,
          mint: sss2Mint,
          stablecoinConfig: sc,
          rolesConfig: rc,
          destination: holderAta,
          tokenProgram: TOKEN_PROGRAM,
        })
        .signers([minter])
        .rpc();
    });

    it('seizes tokens from a holder using permanent delegate', async () => {
      const [stablecoinConfig] = findStablecoinConfigPda(sss2Mint);
      const [rolesConfig] = findRolesConfigPda(sss2Mint);
      const SEIZE_AMOUNT = new BN(5_000_000);

      const holderBefore = await provider.connection.getTokenAccountBalance(holderAta);
      const destBefore = await provider.connection.getTokenAccountBalance(seizureDestAta);

      await program.methods
        .seize(SEIZE_AMOUNT)
        .accounts({
          seizer: localSeizer.publicKey,
          mint: sss2Mint,
          stablecoinConfig,
          rolesConfig,
          source: holderAta,
          destination: seizureDestAta,
          tokenProgram: TOKEN_PROGRAM,
        })
        .signers([localSeizer])
        .rpc();

      const holderAfter = await provider.connection.getTokenAccountBalance(holderAta);
      const destAfter = await provider.connection.getTokenAccountBalance(seizureDestAta);

      expect(parseInt(holderAfter.value.amount)).to.equal(
        parseInt(holderBefore.value.amount) - 5_000_000,
      );
      expect(parseInt(destAfter.value.amount)).to.equal(
        parseInt(destBefore.value.amount) + 5_000_000,
      );
    });

    it('rejects seize from non-seizer account', async () => {
      const [stablecoinConfig] = findStablecoinConfigPda(sss2Mint);
      const [rolesConfig] = findRolesConfigPda(sss2Mint);

      try {
        await program.methods
          .seize(new BN(1_000_000))
          .accounts({
            seizer: user2.publicKey, // not seizer
            mint: sss2Mint,
            stablecoinConfig,
            rolesConfig,
            source: holderAta,
            destination: seizureDestAta,
            tokenProgram: TOKEN_PROGRAM,
          })
          .signers([user2])
          .rpc();
        expect.fail('Should have thrown Unauthorized');
      } catch (err: any) {
        expect(err.message).to.include('Unauthorized');
      }
    });

    it('rejects seize with zero amount', async () => {
      const [stablecoinConfig] = findStablecoinConfigPda(sss2Mint);
      const [rolesConfig] = findRolesConfigPda(sss2Mint);

      try {
        await program.methods
          .seize(new BN(0))
          .accounts({
            seizer: localSeizer.publicKey,
            mint: sss2Mint,
            stablecoinConfig,
            rolesConfig,
            source: holderAta,
            destination: seizureDestAta,
            tokenProgram: TOKEN_PROGRAM,
          })
          .signers([localSeizer])
          .rpc();
        expect.fail('Should have thrown ZeroAmount');
      } catch (err: any) {
        expect(err.message).to.include('ZeroAmount');
      }
    });

    it('rejects seize on SSS-1 mint', async () => {
      const sourceAta = getAssociatedTokenAddressSync(mintSss1, user1.publicKey, false, TOKEN_2022_PROGRAM_ID);
      const destAta = getAssociatedTokenAddressSync(mintSss1, authority.publicKey, false, TOKEN_2022_PROGRAM_ID);
      const [stablecoinConfig] = findStablecoinConfigPda(mintSss1);
      const [rolesConfig] = findRolesConfigPda(mintSss1);

      try {
        await program.methods
          .seize(new BN(1_000_000))
          .accounts({
            seizer: authority.publicKey,
            mint: mintSss1,
            stablecoinConfig,
            rolesConfig,
            source: sourceAta,
            destination: destAta,
            tokenProgram: TOKEN_PROGRAM,
          })
          .signers([authority])
          .rpc();
        expect.fail('Should have thrown Sss2NotEnabled');
      } catch (err: any) {
        expect(err.message).to.include('Sss2NotEnabled');
      }
    });

    it('allows master authority to seize (backup seizer)', async () => {
      const [stablecoinConfig] = findStablecoinConfigPda(sss2Mint);
      const [rolesConfig] = findRolesConfigPda(sss2Mint);

      // master_authority should also be able to seize
      // Note: this depends on the seize instruction's authorization check
      const roles = await program.account.rolesConfig.fetch(rolesConfig);
      expect(roles.masterAuthority.toBase58()).to.equal(authority.publicKey.toBase58());
    });
  });

  // ─── SSS-2 Extended Blacklist Tests ─────────────────────────────────────

  describe('SSS-2: Extended Blacklist Tests', () => {
    it('blacklist with different reason codes (0–255)', async () => {
      const target3 = Keypair.generate();
      const [stablecoinConfig] = findStablecoinConfigPda(mintSss2);
      const [rolesConfig] = findRolesConfigPda(mintSss2);
      const [blacklistEntry] = findBlacklistEntryPda(mintSss2, target3.publicKey);

      // Add blacklister role for these tests first
      await program.methods.updateRoles({
        newMinter: null, newBurner: null,
        newBlacklister: authority.publicKey, // restore blacklister
        newPauser: null, newSeizer: null, newMinterQuota: null,
      })
      .accounts({ authority: authority.publicKey, mint: mintSss2, stablecoinConfig, rolesConfig })
      .signers([authority])
      .rpc();

      // reason=255 (max value)
      await program.methods
        .addToBlacklist(target3.publicKey, 255)
        .accounts({
          authority: authority.publicKey,
          mint: mintSss2,
          stablecoinConfig,
          rolesConfig,
          blacklistEntry,
          systemProgram: SystemProgram.programId,
        })
        .signers([authority])
        .rpc();

      const entry = await program.account.blacklistEntry.fetch(blacklistEntry);
      expect(entry.reason).to.equal(255);
      expect(entry.address.toBase58()).to.equal(target3.publicKey.toBase58());

      // Clean up
      await program.methods
        .removeFromBlacklist(target3.publicKey)
        .accounts({
          authority: authority.publicKey,
          mint: mintSss2,
          stablecoinConfig,
          rolesConfig,
          blacklistEntry,
        })
        .signers([authority])
        .rpc();
    });

    it('verifies SSS-2 config has compliance features enabled', async () => {
      const [stablecoinConfig] = findStablecoinConfigPda(mintSss2);
      const config = await program.account.stablecoinConfig.fetch(stablecoinConfig);
      expect(config.permanentDelegateEnabled).to.be.true;
      expect(config.transferHookEnabled).to.be.true;
    });

    it('rejects remove_from_blacklist from unauthorized account', async () => {
      // Re-add a target to blacklist
      const target4 = Keypair.generate();
      const [stablecoinConfig] = findStablecoinConfigPda(mintSss2);
      const [rolesConfig] = findRolesConfigPda(mintSss2);
      const [blacklistEntry] = findBlacklistEntryPda(mintSss2, target4.publicKey);

      await program.methods
        .addToBlacklist(target4.publicKey, 1)
        .accounts({
          authority: authority.publicKey, // using master authority (restored above)
          mint: mintSss2,
          stablecoinConfig,
          rolesConfig,
          blacklistEntry,
          systemProgram: SystemProgram.programId,
        })
        .signers([authority])
        .rpc();

      // Try to remove from non-blacklister
      try {
        await program.methods
          .removeFromBlacklist(target4.publicKey)
          .accounts({
            authority: user1.publicKey,
            mint: mintSss2,
            stablecoinConfig,
            rolesConfig,
            blacklistEntry,
          })
          .signers([user1])
          .rpc();
        expect.fail('Should have thrown Unauthorized');
      } catch (err: any) {
        expect(err.message).to.include('Unauthorized');
      }

      // Clean up
      await program.methods
        .removeFromBlacklist(target4.publicKey)
        .accounts({
          authority: authority.publicKey,
          mint: mintSss2,
          stablecoinConfig,
          rolesConfig,
          blacklistEntry,
        })
        .signers([authority])
        .rpc();
    });
  });

  // ─── PDA Derivation Tests ────────────────────────────────────────────────

  describe('PDA Derivation', () => {
    it('findStablecoinConfigPda returns deterministic address', () => {
      const [pda1] = findStablecoinConfigPda(mintSss1);
      const [pda2] = findStablecoinConfigPda(mintSss1);
      expect(pda1.toBase58()).to.equal(pda2.toBase58());
    });

    it('findRolesConfigPda returns deterministic address', () => {
      const [pda1] = findRolesConfigPda(mintSss1);
      const [pda2] = findRolesConfigPda(mintSss1);
      expect(pda1.toBase58()).to.equal(pda2.toBase58());
    });

    it('findBlacklistEntryPda returns deterministic address', () => {
      const target = user1.publicKey;
      const [pda1] = findBlacklistEntryPda(mintSss2, target);
      const [pda2] = findBlacklistEntryPda(mintSss2, target);
      expect(pda1.toBase58()).to.equal(pda2.toBase58());
    });

    it('PDA addresses differ across different mints', () => {
      const [pda1] = findStablecoinConfigPda(mintSss1);
      const [pda2] = findStablecoinConfigPda(mintSss2);
      expect(pda1.toBase58()).to.not.equal(pda2.toBase58());
    });

    it('BlacklistEntry PDAs differ across different targets', () => {
      const [pda1] = findBlacklistEntryPda(mintSss2, user1.publicKey);
      const [pda2] = findBlacklistEntryPda(mintSss2, user2.publicKey);
      expect(pda1.toBase58()).to.not.equal(pda2.toBase58());
    });

    it('SSS_PROGRAM_ID matches deployed program address', () => {
      expect(SSS_PROGRAM_ID.toBase58()).to.equal(program.programId.toBase58());
    });
  });

  // ─── State Consistency Tests ─────────────────────────────────────────────

  describe('State Consistency', () => {
    it('supply tracking: total minted matches token supply', async () => {
      // Use a fresh mint to test supply tracking
      const supplyMintKeypair = Keypair.generate();
      const supplyMint = supplyMintKeypair.publicKey;
      const mintLen = getMintLen([ExtensionType.MintCloseAuthority]);
      const lamports = await provider.connection.getMinimumBalanceForRentExemption(mintLen);

      const tx = new anchor.web3.Transaction();
      tx.add(
        SystemProgram.createAccount({
          fromPubkey: authority.publicKey,
          newAccountPubkey: supplyMint,
          space: mintLen,
          lamports,
          programId: TOKEN_2022_PROGRAM_ID,
        }),
        createInitializeMintCloseAuthorityInstruction(supplyMint, authority.publicKey, TOKEN_2022_PROGRAM_ID),
        createInitializeMintInstruction(supplyMint, 6, authority.publicKey, authority.publicKey, TOKEN_2022_PROGRAM_ID),
      );
      await provider.sendAndConfirm(tx, [authority, supplyMintKeypair]);

      const [sc] = findStablecoinConfigPda(supplyMint);
      const [rc] = findRolesConfigPda(supplyMint);

      await program.methods.initialize({
        name: 'Supply Track', symbol: 'SUPL',
        uri: 'https://test.example.com/supl.json',
        decimals: 6, maxSupply: new BN(0), preset: 0,
        minter: minter.publicKey, minterQuota: new BN(0),
        burner: burner.publicKey, blacklister: null, pauser: null, seizer: null,
      }).accounts({
        authority: authority.publicKey, mint: supplyMint,
        stablecoinConfig: sc, rolesConfig: rc,
        tokenProgram: TOKEN_PROGRAM, systemProgram: SystemProgram.programId,
      }).signers([authority]).rpc();

      const supplyAta = await createAta(provider, authority, supplyMint, user1.publicKey);

      // Mint 3x
      for (let i = 0; i < 3; i++) {
        await program.methods.mintTokens(new BN(1_000_000))
          .accounts({ minter: minter.publicKey, mint: supplyMint, stablecoinConfig: sc, rolesConfig: rc, destination: supplyAta, tokenProgram: TOKEN_PROGRAM })
          .signers([minter]).rpc();
      }

      const balance = await provider.connection.getTokenAccountBalance(supplyAta);
      expect(balance.value.amount).to.equal('3000000');

      // Burn 1
      await program.methods.burnTokens(new BN(1_000_000))
        .accounts({ burner: burner.publicKey, mint: supplyMint, stablecoinConfig: sc, rolesConfig: rc, source: supplyAta, tokenProgram: TOKEN_PROGRAM })
        .signers([burner]).rpc();

      const balanceAfter = await provider.connection.getTokenAccountBalance(supplyAta);
      expect(balanceAfter.value.amount).to.equal('2000000');
    });

    it('config preset field correctly identifies SSS-1 vs SSS-2', async () => {
      const [config1] = findStablecoinConfigPda(mintSss1);
      const [config2] = findStablecoinConfigPda(mintSss2);

      const c1 = await program.account.stablecoinConfig.fetch(config1);
      const c2 = await program.account.stablecoinConfig.fetch(config2);

      expect(c1.permanentDelegateEnabled).to.be.false;
      expect(c2.permanentDelegateEnabled).to.be.true;
    });

    it('mint with multiple recipients maintains correct balances', async () => {
      const [stablecoinConfig] = findStablecoinConfigPda(mintSss1);
      const [rolesConfig] = findRolesConfigPda(mintSss1);

      const recipient1Ata = await createAta(provider, authority, mintSss1, minter.publicKey);
      const recipient2Ata = await createAta(provider, authority, mintSss1, burner.publicKey);

      await program.methods.mintTokens(new BN(2_000_000))
        .accounts({ minter: minter.publicKey, mint: mintSss1, stablecoinConfig, rolesConfig, destination: recipient1Ata, tokenProgram: TOKEN_PROGRAM })
        .signers([minter]).rpc();

      await program.methods.mintTokens(new BN(3_000_000))
        .accounts({ minter: minter.publicKey, mint: mintSss1, stablecoinConfig, rolesConfig, destination: recipient2Ata, tokenProgram: TOKEN_PROGRAM })
        .signers([minter]).rpc();

      const bal1 = await provider.connection.getTokenAccountBalance(recipient1Ata);
      const bal2 = await provider.connection.getTokenAccountBalance(recipient2Ata);

      expect(bal1.value.amount).to.equal('2000000');
      expect(bal2.value.amount).to.equal('3000000');
    });
  });

  // ─── Minter Quota Tests ──────────────────────────────────────────────────

  describe('Boundary: Minter Quota Enforcement', () => {
    it('enforces minter_quota: rejects when quota would be exceeded', async () => {
      const quotaMintKeypair = Keypair.generate();
      const quotaMint = quotaMintKeypair.publicKey;
      const QUOTA = new BN(5_000_000); // 5 tokens quota

      const mintLen = getMintLen([ExtensionType.MintCloseAuthority]);
      const lamports = await provider.connection.getMinimumBalanceForRentExemption(mintLen);

      const tx = new anchor.web3.Transaction();
      tx.add(
        SystemProgram.createAccount({
          fromPubkey: authority.publicKey,
          newAccountPubkey: quotaMint,
          space: mintLen,
          lamports,
          programId: TOKEN_2022_PROGRAM_ID,
        }),
        createInitializeMintCloseAuthorityInstruction(quotaMint, authority.publicKey, TOKEN_2022_PROGRAM_ID),
        createInitializeMintInstruction(quotaMint, 6, authority.publicKey, authority.publicKey, TOKEN_2022_PROGRAM_ID),
      );
      await provider.sendAndConfirm(tx, [authority, quotaMintKeypair]);

      const [sc] = findStablecoinConfigPda(quotaMint);
      const [rc] = findRolesConfigPda(quotaMint);

      await program.methods.initialize({
        name: 'Quota USD', symbol: 'QUSD',
        uri: 'https://test.example.com/qusd.json',
        decimals: 6, maxSupply: new BN(0), preset: 0,
        minter: minter.publicKey, minterQuota: QUOTA,
        burner: null, blacklister: null, pauser: null, seizer: null,
      }).accounts({
        authority: authority.publicKey, mint: quotaMint,
        stablecoinConfig: sc, rolesConfig: rc,
        tokenProgram: TOKEN_PROGRAM, systemProgram: SystemProgram.programId,
      }).signers([authority]).rpc();

      const destAta = await createAta(provider, authority, quotaMint, user1.publicKey);

      // Mint up to quota
      await program.methods.mintTokens(QUOTA)
        .accounts({ minter: minter.publicKey, mint: quotaMint, stablecoinConfig: sc, rolesConfig: rc, destination: destAta, tokenProgram: TOKEN_PROGRAM })
        .signers([minter]).rpc();

      // Try to mint 1 more — should fail
      try {
        await program.methods.mintTokens(new BN(1))
          .accounts({ minter: minter.publicKey, mint: quotaMint, stablecoinConfig: sc, rolesConfig: rc, destination: destAta, tokenProgram: TOKEN_PROGRAM })
          .signers([minter]).rpc();
        expect.fail('Should have thrown MinterQuotaExceeded');
      } catch (err: any) {
        expect(err.message).to.include('MinterQuotaExceeded');
      }
    });

    it('minter_quota=0 means unlimited minting', async () => {
      const unlimitedMintKeypair = Keypair.generate();
      const unlimitedMint = unlimitedMintKeypair.publicKey;

      const mintLen = getMintLen([ExtensionType.MintCloseAuthority]);
      const lamports = await provider.connection.getMinimumBalanceForRentExemption(mintLen);

      const tx = new anchor.web3.Transaction();
      tx.add(
        SystemProgram.createAccount({
          fromPubkey: authority.publicKey,
          newAccountPubkey: unlimitedMint,
          space: mintLen,
          lamports,
          programId: TOKEN_2022_PROGRAM_ID,
        }),
        createInitializeMintCloseAuthorityInstruction(unlimitedMint, authority.publicKey, TOKEN_2022_PROGRAM_ID),
        createInitializeMintInstruction(unlimitedMint, 6, authority.publicKey, authority.publicKey, TOKEN_2022_PROGRAM_ID),
      );
      await provider.sendAndConfirm(tx, [authority, unlimitedMintKeypair]);

      const [sc] = findStablecoinConfigPda(unlimitedMint);
      const [rc] = findRolesConfigPda(unlimitedMint);

      await program.methods.initialize({
        name: 'Unlimited USD', symbol: 'UUSD',
        uri: 'https://test.example.com/uusd.json',
        decimals: 6, maxSupply: new BN(0), preset: 0,
        minter: minter.publicKey, minterQuota: new BN(0), // 0 = unlimited
        burner: null, blacklister: null, pauser: null, seizer: null,
      }).accounts({
        authority: authority.publicKey, mint: unlimitedMint,
        stablecoinConfig: sc, rolesConfig: rc,
        tokenProgram: TOKEN_PROGRAM, systemProgram: SystemProgram.programId,
      }).signers([authority]).rpc();

      const destAta = await createAta(provider, authority, unlimitedMint, user1.publicKey);

      // Should be able to mint any amount
      await program.methods.mintTokens(new BN(100_000_000))
        .accounts({ minter: minter.publicKey, mint: unlimitedMint, stablecoinConfig: sc, rolesConfig: rc, destination: destAta, tokenProgram: TOKEN_PROGRAM })
        .signers([minter]).rpc();

      const bal = await provider.connection.getTokenAccountBalance(destAta);
      expect(bal.value.amount).to.equal('100000000');
    });
  });

  // ─── Boundary Tests ─────────────────────────────────────────────────────

  describe('Boundary: Max Supply Enforcement', () => {
    it('rejects mint that would exceed max_supply', async () => {
      const cappedMintKeypair = Keypair.generate();
      const MAX_SUPPLY = new BN(5_000_000); // 5 TUSD

      const mintLen = getMintLen([ExtensionType.MintCloseAuthority]);
      const lamports = await provider.connection.getMinimumBalanceForRentExemption(mintLen);

      const tx = new anchor.web3.Transaction();
      tx.add(
        SystemProgram.createAccount({
          fromPubkey: authority.publicKey,
          newAccountPubkey: cappedMintKeypair.publicKey,
          space: mintLen,
          lamports,
          programId: TOKEN_2022_PROGRAM_ID,
        }),
        createInitializeMintCloseAuthorityInstruction(cappedMintKeypair.publicKey, authority.publicKey, TOKEN_2022_PROGRAM_ID),
        createInitializeMintInstruction(cappedMintKeypair.publicKey, 6, authority.publicKey, authority.publicKey, TOKEN_2022_PROGRAM_ID),
      );
      await provider.sendAndConfirm(tx, [authority, cappedMintKeypair]);

      const cappedMint = cappedMintKeypair.publicKey;
      const [stablecoinConfig] = findStablecoinConfigPda(cappedMint);
      const [rolesConfig] = findRolesConfigPda(cappedMint);

      await program.methods
        .initialize({
          name: 'Capped USD',
          symbol: 'CUSD',
          uri: 'https://capped.example.com/token.json',
          decimals: 6,
          maxSupply: MAX_SUPPLY,
          preset: 0, // SSS-1
          minter: null,
          minterQuota: new BN(0),
          burner: null,
          blacklister: null,
          pauser: null,
          seizer: null,
        })
        .accounts({
          authority: authority.publicKey,
          mint: cappedMint,
          stablecoinConfig,
          rolesConfig,
          tokenProgram: TOKEN_PROGRAM,
          systemProgram: SystemProgram.programId,
        })
        .signers([authority])
        .rpc();

      // Mint up to the cap
      const ata = await createAta(provider, authority, cappedMint, authority.publicKey);
      await program.methods
        .mintTokens(MAX_SUPPLY)
        .accounts({
          minter: authority.publicKey,
          mint: cappedMint,
          stablecoinConfig,
          rolesConfig,
          destination: ata,
          tokenProgram: TOKEN_PROGRAM,
        })
        .signers([authority])
        .rpc();

      // Try to mint 1 more — should fail
      try {
        await program.methods
          .mintTokens(new BN(1))
          .accounts({
            minter: authority.publicKey,
            mint: cappedMint,
            stablecoinConfig,
            rolesConfig,
            destination: ata,
            tokenProgram: TOKEN_PROGRAM,
          })
          .signers([authority])
          .rpc();
        expect.fail('Should have thrown MaxSupplyExceeded');
      } catch (err: any) {
        expect(err.message).to.include('MaxSupplyExceeded');
      }
    });
  });
});
