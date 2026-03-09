import * as anchor from "@coral-xyz/anchor";
import { expect } from "chai";
import { Keypair } from "@solana/web3.js";
import BN from "bn.js";
import {
  provider,
  coreProgram,
  admin,
  createSSS1Mint,
  createSSS2Mint,
  grantRole,
  createTokenAccount,
  airdropSol,
  initializeHook,
  findRolePda,
  findHookConfigPda,
  findBlacklistEntryPda,
} from "../../helpers/setup";
import { TOKEN_2022_PROGRAM_ID, ROLE } from "../../helpers/constants";

describe("burn-from", () => {
  let mintPubkey: anchor.web3.PublicKey;
  let configPda: anchor.web3.PublicKey;
  let hookConfig: anchor.web3.PublicKey;
  let burnerKeypair: Keypair;
  let minterKeypair: Keypair;
  let treasuryKeypair: Keypair;
  let holderAta: anchor.web3.PublicKey;

  beforeEach(async () => {
    burnerKeypair = Keypair.generate();
    minterKeypair = Keypair.generate();
    treasuryKeypair = Keypair.generate();
    await airdropSol(burnerKeypair.publicKey, 2);
    await airdropSol(minterKeypair.publicKey, 2);
    await airdropSol(treasuryKeypair.publicKey, 2);

    const result = await createSSS2Mint(treasuryKeypair.publicKey, "Burn Test USD", "BTUSD", 6);
    mintPubkey = result.mintKeypair.publicKey;
    configPda = result.configPda;

    const [hc] = findHookConfigPda(mintPubkey);
    hookConfig = hc;

    await initializeHook(mintPubkey, configPda);

    holderAta = await createTokenAccount(mintPubkey, admin.publicKey);

    // Grant minter and mint some tokens for burn tests (extra allowance for tests that mint more)
    await grantRole(configPda, minterKeypair.publicKey, ROLE.Minter, 2_000_000);
    const [minterRoleAccount] = findRolePda(
      configPda,
      minterKeypair.publicKey,
      ROLE.Minter
    );

    // SSS-2 mintTo requires blacklist PDA for the recipient (admin.publicKey)
    const [adminBlacklistEntry] = findBlacklistEntryPda(hookConfig, admin.publicKey);
    await coreProgram.methods
      .mintTo(new BN(1_000_000))
      .accounts({
        minter: minterKeypair.publicKey,
        config: configPda,
        roleAccount: minterRoleAccount,
        mint: mintPubkey,
        to: holderAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .remainingAccounts([{ pubkey: adminBlacklistEntry, isWritable: false, isSigner: false }])
      .signers([minterKeypair])
      .rpc();
  });

  it("burner can burn tokens from any account (permanent delegate)", async () => {
    await grantRole(configPda, burnerKeypair.publicKey, ROLE.Burner, 0);
    const [roleAccount] = findRolePda(
      configPda,
      burnerKeypair.publicKey,
      ROLE.Burner
    );

    const [adminBlacklistEntry] = findBlacklistEntryPda(hookConfig, admin.publicKey);
    await coreProgram.methods
      .burnFrom(new BN(500_000))
      .accounts({
        burner: burnerKeypair.publicKey,
        config: configPda,
        roleAccount,
        mint: mintPubkey,
        from: holderAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .remainingAccounts([{ pubkey: adminBlacklistEntry, isWritable: false, isSigner: false }])
      .signers([burnerKeypair])
      .rpc();

    const balance = await provider.connection.getTokenAccountBalance(holderAta);
    expect(parseInt(balance.value.amount)).to.equal(500_000);
  });

  it("rejects non-burner", async () => {
    const nonBurner = Keypair.generate();
    await airdropSol(nonBurner.publicKey, 1);
    // Grant minter, not burner
    await grantRole(configPda, nonBurner.publicKey, ROLE.Minter, 0);
    const [wrongRoleAccount] = findRolePda(
      configPda,
      nonBurner.publicKey,
      ROLE.Burner
    );

    const [adminBlacklistEntry] = findBlacklistEntryPda(hookConfig, admin.publicKey);
    try {
      await coreProgram.methods
        .burnFrom(new BN(100))
        .accounts({
          burner: nonBurner.publicKey,
          config: configPda,
          roleAccount: wrongRoleAccount,
          mint: mintPubkey,
          from: holderAta,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .remainingAccounts([{ pubkey: adminBlacklistEntry, isWritable: false, isSigner: false }])
        .signers([nonBurner])
        .rpc();
      expect.fail("Should have thrown");
    } catch (err: any) {
      expect(err).to.exist;
    }
  });

  it("rejects zero amount", async () => {
    await grantRole(configPda, burnerKeypair.publicKey, ROLE.Burner, 0);
    const [roleAccount] = findRolePda(
      configPda,
      burnerKeypair.publicKey,
      ROLE.Burner
    );

    const [adminBlacklistEntry] = findBlacklistEntryPda(hookConfig, admin.publicKey);
    try {
      await coreProgram.methods
        .burnFrom(new BN(0))
        .accounts({
          burner: burnerKeypair.publicKey,
          config: configPda,
          roleAccount,
          mint: mintPubkey,
          from: holderAta,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .remainingAccounts([{ pubkey: adminBlacklistEntry, isWritable: false, isSigner: false }])
        .signers([burnerKeypair])
        .rpc();
      expect.fail("Should have thrown");
    } catch (err: any) {
      expect(err).to.exist;
      expect(err.toString()).to.include("ZeroAmount");
    }
  });

  it("rejects when paused", async () => {
    await grantRole(configPda, burnerKeypair.publicKey, ROLE.Burner, 0);
    const [roleAccount] = findRolePda(
      configPda,
      burnerKeypair.publicKey,
      ROLE.Burner
    );

    await coreProgram.methods
      .pause()
      .accounts({
        authority: admin.publicKey,
        config: configPda,
        roleAccount: null,
      })
      .rpc();

    const [adminBlacklistEntry] = findBlacklistEntryPda(hookConfig, admin.publicKey);
    try {
      await coreProgram.methods
        .burnFrom(new BN(100))
        .accounts({
          burner: burnerKeypair.publicKey,
          config: configPda,
          roleAccount,
          mint: mintPubkey,
          from: holderAta,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .remainingAccounts([{ pubkey: adminBlacklistEntry, isWritable: false, isSigner: false }])
        .signers([burnerKeypair])
        .rpc();
      expect.fail("Should have thrown");
    } catch (err: any) {
      expect(err).to.exist;
      expect(err.toString()).to.include("Paused");
    }
  });

  it("updates totalBurned counter", async () => {
    await grantRole(configPda, burnerKeypair.publicKey, ROLE.Burner, 0);
    const [roleAccount] = findRolePda(
      configPda,
      burnerKeypair.publicKey,
      ROLE.Burner
    );

    const [adminBlacklistEntry] = findBlacklistEntryPda(hookConfig, admin.publicKey);
    await coreProgram.methods
      .burnFrom(new BN(250_000))
      .accounts({
        burner: burnerKeypair.publicKey,
        config: configPda,
        roleAccount,
        mint: mintPubkey,
        from: holderAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .remainingAccounts([{ pubkey: adminBlacklistEntry, isWritable: false, isSigner: false }])
      .signers([burnerKeypair])
      .rpc();

    const config = await coreProgram.account.stablecoinConfig.fetch(configPda);
    expect(config.totalBurned.toNumber()).to.equal(250_000);
  });

  it("emits TokensBurned event", async () => {
    await grantRole(configPda, burnerKeypair.publicKey, ROLE.Burner, 0);
    const [roleAccount] = findRolePda(
      configPda,
      burnerKeypair.publicKey,
      ROLE.Burner
    );

    const [adminBlacklistEntry] = findBlacklistEntryPda(hookConfig, admin.publicKey);
    const txSig = await coreProgram.methods
      .burnFrom(new BN(100_000))
      .accounts({
        burner: burnerKeypair.publicKey,
        config: configPda,
        roleAccount,
        mint: mintPubkey,
        from: holderAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .remainingAccounts([{ pubkey: adminBlacklistEntry, isWritable: false, isSigner: false }])
      .signers([burnerKeypair])
      .rpc();

    await provider.connection.confirmTransaction(txSig, "confirmed");
    const tx = await provider.connection.getTransaction(txSig, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    });
    const logs = tx?.meta?.logMessages || [];
    const hasEvent = logs.some((l) => l.includes("Program data:"));
    expect(hasEvent, "TokensBurned event should be emitted in logs").to.be.true;
  });

  it("burn from account not owned by burner (permanent delegate)", async () => {
    // Create a separate holder account
    const separateHolder = Keypair.generate();
    const separateAta = await createTokenAccount(mintPubkey, separateHolder.publicKey);

    // Mint to separate holder (SSS-2 requires blacklist PDA for the recipient)
    const [minterRoleAccount] = findRolePda(
      configPda,
      minterKeypair.publicKey,
      ROLE.Minter
    );
    const [separateHolderBlacklistEntry] = findBlacklistEntryPda(hookConfig, separateHolder.publicKey);
    await coreProgram.methods
      .mintTo(new BN(200_000))
      .accounts({
        minter: minterKeypair.publicKey,
        config: configPda,
        roleAccount: minterRoleAccount,
        mint: mintPubkey,
        to: separateAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .remainingAccounts([{ pubkey: separateHolderBlacklistEntry, isWritable: false, isSigner: false }])
      .signers([minterKeypair])
      .rpc();

    await grantRole(configPda, burnerKeypair.publicKey, ROLE.Burner, 0);
    const [roleAccount] = findRolePda(
      configPda,
      burnerKeypair.publicKey,
      ROLE.Burner
    );

    // Burner (config PDA = permanent delegate) burns from separate holder's account
    await coreProgram.methods
      .burnFrom(new BN(200_000))
      .accounts({
        burner: burnerKeypair.publicKey,
        config: configPda,
        roleAccount,
        mint: mintPubkey,
        from: separateAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .remainingAccounts([{ pubkey: separateHolderBlacklistEntry, isWritable: false, isSigner: false }])
      .signers([burnerKeypair])
      .rpc();

    const balance = await provider.connection.getTokenAccountBalance(separateAta);
    expect(parseInt(balance.value.amount)).to.equal(0);
  });

  it("rejects burn amount exceeding balance", async () => {
    await grantRole(configPda, burnerKeypair.publicKey, ROLE.Burner, 0);
    const [roleAccount] = findRolePda(
      configPda,
      burnerKeypair.publicKey,
      ROLE.Burner
    );

    const [adminBlacklistEntry] = findBlacklistEntryPda(hookConfig, admin.publicKey);
    try {
      await coreProgram.methods
        .burnFrom(new BN(2_000_000)) // more than 1_000_000 minted
        .accounts({
          burner: burnerKeypair.publicKey,
          config: configPda,
          roleAccount,
          mint: mintPubkey,
          from: holderAta,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .remainingAccounts([{ pubkey: adminBlacklistEntry, isWritable: false, isSigner: false }])
        .signers([burnerKeypair])
        .rpc();
      expect.fail("Should have thrown");
    } catch (err: any) {
      expect(err).to.exist;
    }
  });

  it("multiple burns update counter correctly", async () => {
    await grantRole(configPda, burnerKeypair.publicKey, ROLE.Burner, 0);
    const [roleAccount] = findRolePda(
      configPda,
      burnerKeypair.publicKey,
      ROLE.Burner
    );

    const [adminBlacklistEntry] = findBlacklistEntryPda(hookConfig, admin.publicKey);
    await coreProgram.methods
      .burnFrom(new BN(100_000))
      .accounts({
        burner: burnerKeypair.publicKey,
        config: configPda,
        roleAccount,
        mint: mintPubkey,
        from: holderAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .remainingAccounts([{ pubkey: adminBlacklistEntry, isWritable: false, isSigner: false }])
      .signers([burnerKeypair])
      .rpc();

    await coreProgram.methods
      .burnFrom(new BN(200_000))
      .accounts({
        burner: burnerKeypair.publicKey,
        config: configPda,
        roleAccount,
        mint: mintPubkey,
        from: holderAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .remainingAccounts([{ pubkey: adminBlacklistEntry, isWritable: false, isSigner: false }])
      .signers([burnerKeypair])
      .rpc();

    const config = await coreProgram.account.stablecoinConfig.fetch(configPda);
    expect(config.totalBurned.toNumber()).to.equal(300_000);
  });

  it("burn all tokens (balance reaches 0)", async () => {
    await grantRole(configPda, burnerKeypair.publicKey, ROLE.Burner, 0);
    const [roleAccount] = findRolePda(
      configPda,
      burnerKeypair.publicKey,
      ROLE.Burner
    );

    const [adminBlacklistEntry] = findBlacklistEntryPda(hookConfig, admin.publicKey);
    await coreProgram.methods
      .burnFrom(new BN(1_000_000))
      .accounts({
        burner: burnerKeypair.publicKey,
        config: configPda,
        roleAccount,
        mint: mintPubkey,
        from: holderAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .remainingAccounts([{ pubkey: adminBlacklistEntry, isWritable: false, isSigner: false }])
      .signers([burnerKeypair])
      .rpc();

    const balance = await provider.connection.getTokenAccountBalance(holderAta);
    expect(parseInt(balance.value.amount)).to.equal(0);
  });

  it("burner doesn't need to own the token account", async () => {
    // Burner key is different from token account owner (admin)
    expect(burnerKeypair.publicKey.toBase58()).to.not.equal(
      admin.publicKey.toBase58()
    );

    await grantRole(configPda, burnerKeypair.publicKey, ROLE.Burner, 0);
    const [roleAccount] = findRolePda(
      configPda,
      burnerKeypair.publicKey,
      ROLE.Burner
    );

    // holderAta is owned by admin, not burnerKeypair — still works via permanent delegate
    const [adminBlacklistEntry] = findBlacklistEntryPda(hookConfig, admin.publicKey);
    await coreProgram.methods
      .burnFrom(new BN(50_000))
      .accounts({
        burner: burnerKeypair.publicKey,
        config: configPda,
        roleAccount,
        mint: mintPubkey,
        from: holderAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .remainingAccounts([{ pubkey: adminBlacklistEntry, isWritable: false, isSigner: false }])
      .signers([burnerKeypair])
      .rpc();

    const balance = await provider.connection.getTokenAccountBalance(holderAta);
    expect(parseInt(balance.value.amount)).to.equal(950_000);
  });

  it("rejects invalid mint", async () => {
    await grantRole(configPda, burnerKeypair.publicKey, ROLE.Burner, 0);
    const [roleAccount] = findRolePda(
      configPda,
      burnerKeypair.publicKey,
      ROLE.Burner
    );

    const fakeMint = Keypair.generate().publicKey;

    const [adminBlacklistEntry] = findBlacklistEntryPda(hookConfig, admin.publicKey);
    try {
      await coreProgram.methods
        .burnFrom(new BN(100))
        .accounts({
          burner: burnerKeypair.publicKey,
          config: configPda,
          roleAccount,
          mint: fakeMint,
          from: holderAta,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .remainingAccounts([{ pubkey: adminBlacklistEntry, isWritable: false, isSigner: false }])
        .signers([burnerKeypair])
        .rpc();
      expect.fail("Should have thrown");
    } catch (err: any) {
      expect(err).to.exist;
    }
  });

  it("rejects burn_from on SSS-1 (no PermanentDelegate)", async () => {
    // SSS-1 does not have PermanentDelegate, so burn_from should be rejected
    const sss1Result = await createSSS1Mint("SSS1 Burn Test", "S1BT", 6);
    const sss1Burner = Keypair.generate();
    await airdropSol(sss1Burner.publicKey);
    await grantRole(sss1Result.configPda, sss1Burner.publicKey, ROLE.Burner, 0);
    const [sss1RoleAccount] = findRolePda(sss1Result.configPda, sss1Burner.publicKey, ROLE.Burner);

    // Create a token account and mint some tokens
    const holder = Keypair.generate();
    const sss1Ata = await createTokenAccount(sss1Result.mintKeypair.publicKey, holder.publicKey);
    const sss1Minter = Keypair.generate();
    await airdropSol(sss1Minter.publicKey);
    await grantRole(sss1Result.configPda, sss1Minter.publicKey, ROLE.Minter, 1_000);
    const [sss1MinterRole] = findRolePda(sss1Result.configPda, sss1Minter.publicKey, ROLE.Minter);
    await coreProgram.methods
      .mintTo(new BN(500))
      .accounts({
        minter: sss1Minter.publicKey,
        config: sss1Result.configPda,
        roleAccount: sss1MinterRole,
        mint: sss1Result.mintKeypair.publicKey,
        to: sss1Ata,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .signers([sss1Minter])
      .rpc();

    try {
      await coreProgram.methods
        .burnFrom(new BN(100))
        .accounts({
          burner: sss1Burner.publicKey,
          config: sss1Result.configPda,
          roleAccount: sss1RoleAccount,
          mint: sss1Result.mintKeypair.publicKey,
          from: sss1Ata,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([sss1Burner])
        .rpc();
      expect.fail("Should have failed with PresetFeatureUnavailable");
    } catch (err: any) {
      expect(err.toString()).to.include("PresetFeatureUnavailable");
    }
  });
});
