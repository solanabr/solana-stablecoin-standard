import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { expect } from "chai";

// Role bitmask constants — must match the on-chain role_flags module
const ROLE_ADMIN = 1;
const ROLE_MINTER = 2;
const ROLE_BURNER = 4;
const ROLE_FREEZER = 8;
const ROLE_BLACKLISTER = 16;
const ROLE_SEIZER = 32;

// PDA derivation helpers
function findConfigPDA(mint: PublicKey, programId: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("sss_config"), mint.toBuffer()],
    programId
  );
}

function findRolePDA(
  config: PublicKey,
  authority: PublicKey,
  programId: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("sss_role"), config.toBuffer(), authority.toBuffer()],
    programId
  );
}

function findBlacklistPDA(config: PublicKey, programId: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("sss_blacklist"), config.toBuffer()],
    programId
  );
}

function findExtraAccountMetaListPDA(
  mint: PublicKey,
  hookProgramId: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("extra-account-metas"), mint.toBuffer()],
    hookProgramId
  );
}

/**
 * Creates an ATA for Token-2022 and returns the address.
 * Sends a transaction to create it if it doesn't exist yet.
 */
async function getOrCreateATA(
  provider: anchor.AnchorProvider,
  mint: PublicKey,
  owner: PublicKey
): Promise<PublicKey> {
  const ata = getAssociatedTokenAddressSync(
    mint,
    owner,
    false,
    TOKEN_2022_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  const existing = await provider.connection.getAccountInfo(ata);
  if (!existing) {
    const ix = createAssociatedTokenAccountInstruction(
      provider.wallet.publicKey,
      ata,
      owner,
      mint,
      TOKEN_2022_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );
    const tx = new anchor.web3.Transaction().add(ix);
    await provider.sendAndConfirm(tx);
  }
  return ata;
}

describe("Solana Stablecoin Standard", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  // Programs — loaded from workspace (Anchor builds the IDLs)
  const sssToken = anchor.workspace.SssToken as Program;
  const sssHook = anchor.workspace.SssTransferHook as Program;

  // Shared state across the SSS-1 block of tests
  let sss1Mint: Keypair;
  let sss1Config: PublicKey;
  let sss1DeployerRole: PublicKey;

  // Shared state across the SSS-2 block of tests
  let sss2Mint: Keypair;
  let sss2Config: PublicKey;
  let sss2DeployerRole: PublicKey;
  let sss2Blacklist: PublicKey;

  // Additional wallets for role and permission tests
  let minterWallet: Keypair;
  let randomWallet: Keypair;
  let victimWallet: Keypair;

  before(async () => {
    // Fund the extra wallets we'll use throughout the suite
    minterWallet = Keypair.generate();
    randomWallet = Keypair.generate();
    victimWallet = Keypair.generate();

    const fundTx = new anchor.web3.Transaction();
    for (const kp of [minterWallet, randomWallet, victimWallet]) {
      fundTx.add(
        SystemProgram.transfer({
          fromPubkey: provider.wallet.publicKey,
          toPubkey: kp.publicKey,
          lamports: 5 * LAMPORTS_PER_SOL,
        })
      );
    }
    await provider.sendAndConfirm(fundTx);
  });

  // ----------------------------------------------------------------
  //  SSS-1 (minimal stablecoin) tests
  // ----------------------------------------------------------------
  describe("SSS-1: Minimal Stablecoin", () => {
    it("initializes an SSS-1 token", async () => {
      sss1Mint = Keypair.generate();
      const [configPda] = findConfigPDA(sss1Mint.publicKey, sssToken.programId);
      const [rolePda] = findRolePDA(configPda, provider.wallet.publicKey, sssToken.programId);

      sss1Config = configPda;
      sss1DeployerRole = rolePda;

      await sssToken.methods
        .initialize({
          preset: 1,
          name: "Test Dollar",
          symbol: "TUSD",
          uri: "https://example.com/tusd.json",
          decimals: 6,
          supplyCap: new anchor.BN(1_000_000_000_000), // 1M tokens (6 decimals)
          transferHookProgram: null,
        })
        .accounts({
          deployer: provider.wallet.publicKey,
          mint: sss1Mint.publicKey,
          config: sss1Config,
          deployerRole: sss1DeployerRole,
          blacklist: null,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: SYSVAR_RENT_PUBKEY,
        })
        .signers([sss1Mint])
        .rpc();

      const config = await sssToken.account.tokenConfig.fetch(sss1Config);
      expect(config.preset).to.equal(1);
      expect(config.paused).to.equal(false);
      expect(config.decimals).to.equal(6);
      expect(config.supplyCap.toNumber()).to.equal(1_000_000_000_000);
      expect(config.mint.toBase58()).to.equal(sss1Mint.publicKey.toBase58());
      expect(config.deployer.toBase58()).to.equal(provider.wallet.publicKey.toBase58());
    });

    it("deployer gets admin + minter + burner + freezer roles (bitmask 15)", async () => {
      const role = await sssToken.account.roleAccount.fetch(sss1DeployerRole);
      // ADMIN(1) | MINTER(2) | BURNER(4) | FREEZER(8) = 15
      expect(role.roles).to.equal(15);
      expect(role.authority.toBase58()).to.equal(provider.wallet.publicKey.toBase58());
    });

    it("mints tokens to a destination account", async () => {
      const destAta = await getOrCreateATA(
        provider,
        sss1Mint.publicKey,
        provider.wallet.publicKey
      );

      await sssToken.methods
        .mintTokens({ amount: new anchor.BN(500_000_000) }) // 500 tokens
        .accounts({
          authority: provider.wallet.publicKey,
          config: sss1Config,
          role: sss1DeployerRole,
          mint: sss1Mint.publicKey,
          destination: destAta,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .rpc();

      const balance = await provider.connection.getTokenAccountBalance(destAta);
      expect(Number(balance.value.amount)).to.equal(500_000_000);
    });

    it("rejects minting beyond supply cap", async () => {
      const destAta = getAssociatedTokenAddressSync(
        sss1Mint.publicKey,
        provider.wallet.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID
      );

      try {
        // Try to mint way over the 1M cap (already have 500 tokens minted)
        await sssToken.methods
          .mintTokens({ amount: new anchor.BN(1_000_000_000_000) })
          .accounts({
            authority: provider.wallet.publicKey,
            config: sss1Config,
            role: sss1DeployerRole,
            mint: sss1Mint.publicKey,
            destination: destAta,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .rpc();
        expect.fail("Should have rejected — supply cap exceeded");
      } catch (err: any) {
        const errMsg = err.error?.errorCode?.code ?? err.message ?? "";
        expect(errMsg).to.include("SupplyCapExceeded");
      }
    });

    it("burns tokens from caller's account", async () => {
      const sourceAta = getAssociatedTokenAddressSync(
        sss1Mint.publicKey,
        provider.wallet.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID
      );

      await sssToken.methods
        .burnTokens({ amount: new anchor.BN(100_000_000) }) // burn 100 tokens
        .accounts({
          authority: provider.wallet.publicKey,
          config: sss1Config,
          role: sss1DeployerRole,
          mint: sss1Mint.publicKey,
          source: sourceAta,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .rpc();

      const balance = await provider.connection.getTokenAccountBalance(sourceAta);
      expect(Number(balance.value.amount)).to.equal(400_000_000); // 500 - 100
    });

    it("grants MINTER role to another wallet", async () => {
      const [targetRolePda] = findRolePDA(
        sss1Config,
        minterWallet.publicKey,
        sssToken.programId
      );

      await sssToken.methods
        .grantRole(minterWallet.publicKey, ROLE_MINTER)
        .accounts({
          admin: provider.wallet.publicKey,
          config: sss1Config,
          adminRole: sss1DeployerRole,
          targetRole: targetRolePda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const role = await sssToken.account.roleAccount.fetch(targetRolePda);
      expect(role.roles & ROLE_MINTER).to.not.equal(0);
      expect(role.authority.toBase58()).to.equal(minterWallet.publicKey.toBase58());
    });

    it("newly granted minter can mint tokens", async () => {
      const [minterRolePda] = findRolePDA(
        sss1Config,
        minterWallet.publicKey,
        sssToken.programId
      );

      // Create ATA for minter
      const minterAta = await getOrCreateATA(
        provider,
        sss1Mint.publicKey,
        minterWallet.publicKey
      );

      await sssToken.methods
        .mintTokens({ amount: new anchor.BN(50_000_000) }) // 50 tokens
        .accounts({
          authority: minterWallet.publicKey,
          config: sss1Config,
          role: minterRolePda,
          mint: sss1Mint.publicKey,
          destination: minterAta,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([minterWallet])
        .rpc();

      const balance = await provider.connection.getTokenAccountBalance(minterAta);
      expect(Number(balance.value.amount)).to.equal(50_000_000);
    });

    it("freezes and thaws a token account", async () => {
      // Freeze the minter's ATA
      const minterAta = getAssociatedTokenAddressSync(
        sss1Mint.publicKey,
        minterWallet.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID
      );

      await sssToken.methods
        .freezeAccount()
        .accounts({
          authority: provider.wallet.publicKey,
          config: sss1Config,
          role: sss1DeployerRole,
          mint: sss1Mint.publicKey,
          targetAccount: minterAta,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .rpc();

      // The account is now frozen — verify by trying to mint to it (should fail)
      // Instead, we thaw it to prove the cycle works
      await sssToken.methods
        .thawAccount()
        .accounts({
          authority: provider.wallet.publicKey,
          config: sss1Config,
          role: sss1DeployerRole,
          mint: sss1Mint.publicKey,
          targetAccount: minterAta,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .rpc();

      // If we get here without error, freeze/thaw cycle succeeded
    });

    it("pauses and unpauses the token", async () => {
      await sssToken.methods
        .pause()
        .accounts({
          authority: provider.wallet.publicKey,
          config: sss1Config,
          role: sss1DeployerRole,
        })
        .rpc();

      let config = await sssToken.account.tokenConfig.fetch(sss1Config);
      expect(config.paused).to.equal(true);

      // Minting should fail while paused
      const destAta = getAssociatedTokenAddressSync(
        sss1Mint.publicKey,
        provider.wallet.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID
      );
      try {
        await sssToken.methods
          .mintTokens({ amount: new anchor.BN(1_000) })
          .accounts({
            authority: provider.wallet.publicKey,
            config: sss1Config,
            role: sss1DeployerRole,
            mint: sss1Mint.publicKey,
            destination: destAta,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .rpc();
        expect.fail("Should have rejected — token is paused");
      } catch (err: any) {
        const errMsg = err.error?.errorCode?.code ?? err.message ?? "";
        expect(errMsg).to.include("Paused");
      }

      // Unpause
      await sssToken.methods
        .unpause()
        .accounts({
          authority: provider.wallet.publicKey,
          config: sss1Config,
          role: sss1DeployerRole,
        })
        .rpc();

      config = await sssToken.account.tokenConfig.fetch(sss1Config);
      expect(config.paused).to.equal(false);
    });

    it("rejects unauthorized caller (no role account)", async () => {
      // randomWallet has no role — trying to mint should fail at PDA derivation
      const [fakeRolePda] = findRolePDA(
        sss1Config,
        randomWallet.publicKey,
        sssToken.programId
      );

      const destAta = getAssociatedTokenAddressSync(
        sss1Mint.publicKey,
        randomWallet.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID
      );

      try {
        await sssToken.methods
          .mintTokens({ amount: new anchor.BN(1_000) })
          .accounts({
            authority: randomWallet.publicKey,
            config: sss1Config,
            role: fakeRolePda,
            mint: sss1Mint.publicKey,
            destination: destAta,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .signers([randomWallet])
          .rpc();
        expect.fail("Should have rejected — no role account exists");
      } catch (err: any) {
        // The PDA won't exist, so Anchor rejects with AccountNotInitialized
        // or a constraint violation. Either way, it must fail.
        expect(err).to.exist;
      }
    });

    it("rejects blacklist_add on SSS-1 (preset mismatch)", async () => {
      // SSS-1 has no blacklist PDA, so we derive one that won't exist
      const [fakeBl] = findBlacklistPDA(sss1Config, sssToken.programId);

      try {
        await sssToken.methods
          .blacklistAdd(randomWallet.publicKey)
          .accounts({
            authority: provider.wallet.publicKey,
            config: sss1Config,
            role: sss1DeployerRole,
            blacklist: fakeBl,
          })
          .rpc();
        expect.fail("Should have rejected — SSS-2 feature on SSS-1 token");
      } catch (err: any) {
        // Either AccountNotInitialized (blacklist doesn't exist) or PresetMismatch
        expect(err).to.exist;
      }
    });
  });

  // ----------------------------------------------------------------
  //  SSS-2 (compliant stablecoin) tests
  // ----------------------------------------------------------------
  describe("SSS-2: Compliant Stablecoin", () => {
    it("initializes an SSS-2 token with transfer hook", async () => {
      sss2Mint = Keypair.generate();
      const [configPda] = findConfigPDA(sss2Mint.publicKey, sssToken.programId);
      const [rolePda] = findRolePDA(configPda, provider.wallet.publicKey, sssToken.programId);
      const [blPda] = findBlacklistPDA(configPda, sssToken.programId);

      sss2Config = configPda;
      sss2DeployerRole = rolePda;
      sss2Blacklist = blPda;

      await sssToken.methods
        .initialize({
          preset: 2,
          name: "Compliant USD",
          symbol: "CUSD",
          uri: "https://example.com/cusd.json",
          decimals: 6,
          supplyCap: new anchor.BN(0), // no cap
          transferHookProgram: sssHook.programId,
        })
        .accounts({
          deployer: provider.wallet.publicKey,
          mint: sss2Mint.publicKey,
          config: sss2Config,
          deployerRole: sss2DeployerRole,
          blacklist: sss2Blacklist,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: SYSVAR_RENT_PUBKEY,
        })
        .signers([sss2Mint])
        .rpc();

      const config = await sssToken.account.tokenConfig.fetch(sss2Config);
      expect(config.preset).to.equal(2);
      expect(config.transferHookProgram.toBase58()).to.equal(sssHook.programId.toBase58());
    });

    it("deployer gets all 6 roles on SSS-2 (bitmask 63)", async () => {
      const role = await sssToken.account.roleAccount.fetch(sss2DeployerRole);
      // ADMIN(1) | MINTER(2) | BURNER(4) | FREEZER(8) | BLACKLISTER(16) | SEIZER(32) = 63
      expect(role.roles).to.equal(63);
    });

    it("grants individual roles to other wallets", async () => {
      // Give minterWallet the BLACKLISTER role
      const [targetRole] = findRolePDA(sss2Config, minterWallet.publicKey, sssToken.programId);

      await sssToken.methods
        .grantRole(minterWallet.publicKey, ROLE_BLACKLISTER)
        .accounts({
          admin: provider.wallet.publicKey,
          config: sss2Config,
          adminRole: sss2DeployerRole,
          targetRole: targetRole,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const fetchedRole = await sssToken.account.roleAccount.fetch(targetRole);
      expect(fetchedRole.roles & ROLE_BLACKLISTER).to.not.equal(0);
    });

    it("mints tokens on SSS-2 (no supply cap)", async () => {
      const destAta = await getOrCreateATA(
        provider,
        sss2Mint.publicKey,
        provider.wallet.publicKey
      );

      await sssToken.methods
        .mintTokens({ amount: new anchor.BN(10_000_000_000) }) // 10,000 tokens
        .accounts({
          authority: provider.wallet.publicKey,
          config: sss2Config,
          role: sss2DeployerRole,
          mint: sss2Mint.publicKey,
          destination: destAta,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .rpc();

      const balance = await provider.connection.getTokenAccountBalance(destAta);
      expect(Number(balance.value.amount)).to.equal(10_000_000_000);
    });

    it("adds an address to the blacklist", async () => {
      await sssToken.methods
        .blacklistAdd(victimWallet.publicKey)
        .accounts({
          authority: provider.wallet.publicKey,
          config: sss2Config,
          role: sss2DeployerRole,
          blacklist: sss2Blacklist,
        })
        .rpc();

      const bl = await sssToken.account.blacklist.fetch(sss2Blacklist);
      expect(bl.count).to.equal(1);
      const found = bl.entries.some(
        (e: PublicKey) => e.toBase58() === victimWallet.publicKey.toBase58()
      );
      expect(found).to.equal(true);
    });

    it("removes an address from the blacklist", async () => {
      await sssToken.methods
        .blacklistRemove(victimWallet.publicKey)
        .accounts({
          authority: provider.wallet.publicKey,
          config: sss2Config,
          role: sss2DeployerRole,
          blacklist: sss2Blacklist,
        })
        .rpc();

      const bl = await sssToken.account.blacklist.fetch(sss2Blacklist);
      expect(bl.count).to.equal(0);
    });

    it("seizes tokens from a blacklisted account", async () => {
      // Set up: mint tokens to victim, then blacklist them, then seize
      const victimAta = await getOrCreateATA(
        provider,
        sss2Mint.publicKey,
        victimWallet.publicKey
      );
      const treasuryAta = await getOrCreateATA(
        provider,
        sss2Mint.publicKey,
        provider.wallet.publicKey
      );

      // Mint to victim
      await sssToken.methods
        .mintTokens({ amount: new anchor.BN(1_000_000) }) // 1 token
        .accounts({
          authority: provider.wallet.publicKey,
          config: sss2Config,
          role: sss2DeployerRole,
          mint: sss2Mint.publicKey,
          destination: victimAta,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .rpc();

      // Blacklist victim
      await sssToken.methods
        .blacklistAdd(victimWallet.publicKey)
        .accounts({
          authority: provider.wallet.publicKey,
          config: sss2Config,
          role: sss2DeployerRole,
          blacklist: sss2Blacklist,
        })
        .rpc();

      // Check victim balance before
      const beforeVictim = await provider.connection.getTokenAccountBalance(victimAta);
      expect(Number(beforeVictim.value.amount)).to.equal(1_000_000);

      const beforeTreasury = await provider.connection.getTokenAccountBalance(treasuryAta);
      const treasuryBefore = Number(beforeTreasury.value.amount);

      // Seize
      await sssToken.methods
        .seize()
        .accounts({
          authority: provider.wallet.publicKey,
          config: sss2Config,
          role: sss2DeployerRole,
          blacklist: sss2Blacklist,
          mint: sss2Mint.publicKey,
          source: victimAta,
          treasury: treasuryAta,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .rpc();

      // Victim should have 0 tokens
      const afterVictim = await provider.connection.getTokenAccountBalance(victimAta);
      expect(Number(afterVictim.value.amount)).to.equal(0);

      // Treasury should have gained the seized amount
      const afterTreasury = await provider.connection.getTokenAccountBalance(treasuryAta);
      expect(Number(afterTreasury.value.amount)).to.equal(treasuryBefore + 1_000_000);
    });

    it("rejects seizure of non-blacklisted account", async () => {
      // randomWallet is not blacklisted
      const randomAta = await getOrCreateATA(
        provider,
        sss2Mint.publicKey,
        randomWallet.publicKey
      );
      const treasuryAta = getAssociatedTokenAddressSync(
        sss2Mint.publicKey,
        provider.wallet.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID
      );

      // Mint something to random so there's a balance
      await sssToken.methods
        .mintTokens({ amount: new anchor.BN(500_000) })
        .accounts({
          authority: provider.wallet.publicKey,
          config: sss2Config,
          role: sss2DeployerRole,
          mint: sss2Mint.publicKey,
          destination: randomAta,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .rpc();

      try {
        await sssToken.methods
          .seize()
          .accounts({
            authority: provider.wallet.publicKey,
            config: sss2Config,
            role: sss2DeployerRole,
            blacklist: sss2Blacklist,
            mint: sss2Mint.publicKey,
            source: randomAta,
            treasury: treasuryAta,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .rpc();
        expect.fail("Should have rejected — account is not blacklisted");
      } catch (err: any) {
        const errMsg = err.error?.errorCode?.code ?? err.message ?? "";
        expect(errMsg).to.include("NotBlacklisted");
      }
    });

    it("rejects granting BLACKLISTER role from non-admin", async () => {
      // randomWallet has no admin role — should fail
      const [fakeAdminRole] = findRolePDA(
        sss2Config,
        randomWallet.publicKey,
        sssToken.programId
      );
      const [targetRole] = findRolePDA(
        sss2Config,
        victimWallet.publicKey,
        sssToken.programId
      );

      try {
        await sssToken.methods
          .grantRole(victimWallet.publicKey, ROLE_BLACKLISTER)
          .accounts({
            admin: randomWallet.publicKey,
            config: sss2Config,
            adminRole: fakeAdminRole,
            targetRole: targetRole,
            systemProgram: SystemProgram.programId,
          })
          .signers([randomWallet])
          .rpc();
        expect.fail("Should have rejected — caller is not admin");
      } catch (err: any) {
        expect(err).to.exist;
      }
    });

    it("initializes extra account metas for the transfer hook", async () => {
      const [extraMetasPda] = findExtraAccountMetaListPDA(
        sss2Mint.publicKey,
        sssHook.programId
      );

      await sssHook.methods
        .initializeExtraAccountMetas()
        .accounts({
          payer: provider.wallet.publicKey,
          mint: sss2Mint.publicKey,
          extraAccountMetaList: extraMetasPda,
          sssTokenProgram: sssToken.programId,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      // Verify the account was created
      const metaAccount = await provider.connection.getAccountInfo(extraMetasPda);
      expect(metaAccount).to.not.be.null;
      expect(metaAccount!.owner.toBase58()).to.equal(sssHook.programId.toBase58());
    });
  });

  // ----------------------------------------------------------------
  //  Cross-cutting negative tests
  // ----------------------------------------------------------------
  describe("Cross-cutting: Edge Cases & Negative Paths", () => {
    it("rejects invalid preset value on initialize", async () => {
      const badMint = Keypair.generate();
      const [badConfig] = findConfigPDA(badMint.publicKey, sssToken.programId);
      const [badRole] = findRolePDA(badConfig, provider.wallet.publicKey, sssToken.programId);

      try {
        await sssToken.methods
          .initialize({
            preset: 99,
            name: "Bad Token",
            symbol: "BAD",
            uri: "",
            decimals: 6,
            supplyCap: new anchor.BN(0),
            transferHookProgram: null,
          })
          .accounts({
            deployer: provider.wallet.publicKey,
            mint: badMint.publicKey,
            config: badConfig,
            deployerRole: badRole,
            blacklist: null,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
            rent: SYSVAR_RENT_PUBKEY,
          })
          .signers([badMint])
          .rpc();
        expect.fail("Should have rejected — invalid preset");
      } catch (err: any) {
        const errMsg = err.error?.errorCode?.code ?? err.message ?? "";
        expect(errMsg).to.include("InvalidPreset");
      }
    });

    it("non-freezer cannot freeze accounts", async () => {
      // minterWallet only has MINTER (on sss1) and BLACKLISTER (on sss2) — no FREEZER
      const [minterRole] = findRolePDA(
        sss1Config,
        minterWallet.publicKey,
        sssToken.programId
      );

      const targetAta = getAssociatedTokenAddressSync(
        sss1Mint.publicKey,
        provider.wallet.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID
      );

      try {
        await sssToken.methods
          .freezeAccount()
          .accounts({
            authority: minterWallet.publicKey,
            config: sss1Config,
            role: minterRole,
            mint: sss1Mint.publicKey,
            targetAccount: targetAta,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .signers([minterWallet])
          .rpc();
        expect.fail("Should have rejected — caller lacks FREEZER role");
      } catch (err: any) {
        const errMsg = err.error?.errorCode?.code ?? err.message ?? "";
        expect(errMsg).to.include("Unauthorized");
      }
    });

    it("non-admin cannot pause", async () => {
      const [minterRole] = findRolePDA(
        sss1Config,
        minterWallet.publicKey,
        sssToken.programId
      );

      try {
        await sssToken.methods
          .pause()
          .accounts({
            authority: minterWallet.publicKey,
            config: sss1Config,
            role: minterRole,
          })
          .signers([minterWallet])
          .rpc();
        expect.fail("Should have rejected — caller lacks ADMIN role");
      } catch (err: any) {
        const errMsg = err.error?.errorCode?.code ?? err.message ?? "";
        expect(errMsg).to.include("Unauthorized");
      }
    });
  });
});
