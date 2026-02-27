import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { SssToken } from "../target/types/sss_token";
import {
  PublicKey,
  SystemProgram,
  Keypair,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  createMint,
  getOrCreateAssociatedTokenAccount,
  getAccount,
  getMint,
} from "@solana/spl-token";
import { assert } from "chai";

describe("SSS Token - SSS-1 (Minimal Stablecoin)", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.SssToken as Program<SssToken>;

  const mintKeypair = Keypair.generate();
  const secondMinter = Keypair.generate();
  const recipient = Keypair.generate();
  const newAuthority = Keypair.generate();

  let stablecoinPDA: PublicKey;
  let masterRolePDA: PublicKey;
  let minterInfoPDA: PublicKey;
  let mintAuthorityPDA: PublicKey;
  let burnAuthorityPDA: PublicKey;
  let freezeAuthorityPDA: PublicKey;
  let recipientTokenAccount: PublicKey;

  const name = "Test USD";
  const symbol = "TUSD";
  const decimals = 6;

  before(async () => {
    // Airdrop to all test accounts
    await Promise.all([
      provider.connection.requestAirdrop(
        secondMinter.publicKey,
        2 * LAMPORTS_PER_SOL
      ),
      provider.connection.requestAirdrop(
        recipient.publicKey,
        2 * LAMPORTS_PER_SOL
      ),
      provider.connection.requestAirdrop(
        newAuthority.publicKey,
        2 * LAMPORTS_PER_SOL
      ),
    ]);
    // Wait for airdrops
    await new Promise((r) => setTimeout(r, 1000));

    [stablecoinPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("stablecoin"), mintKeypair.publicKey.toBuffer()],
      program.programId
    );
    [masterRolePDA] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("role"),
        provider.wallet.publicKey.toBuffer(),
        mintKeypair.publicKey.toBuffer(),
      ],
      program.programId
    );
    [minterInfoPDA] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("minter"),
        provider.wallet.publicKey.toBuffer(),
        mintKeypair.publicKey.toBuffer(),
      ],
      program.programId
    );
    [mintAuthorityPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("mint_authority"), stablecoinPDA.toBuffer()],
      program.programId
    );
    [burnAuthorityPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("burn_authority"), stablecoinPDA.toBuffer()],
      program.programId
    );
    [freezeAuthorityPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("freeze_authority"), stablecoinPDA.toBuffer()],
      program.programId
    );

    await createMint(
      provider.connection,
      (provider.wallet as anchor.Wallet).payer,
      mintAuthorityPDA,
      freezeAuthorityPDA,
      decimals,
      mintKeypair,
      { commitment: "confirmed" },
      TOKEN_2022_PROGRAM_ID
    );
    console.log("Mint:", mintKeypair.publicKey.toBase58());
  });

  // ==================== INITIALIZE ====================

  describe("Initialize (SSS-1)", () => {
    it("Should initialize a new SSS-1 stablecoin", async () => {
      const tx = await program.methods
        .initialize(name, symbol, decimals, false, false)
        .accounts({
          authority: provider.wallet.publicKey,
          stablecoinState: stablecoinPDA,
          masterRole: masterRolePDA,
          mint: mintKeypair.publicKey,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .signers([mintKeypair])
        .rpc();

      const state = await program.account.stablecoinState.fetch(stablecoinPDA);
      assert.equal(state.name, name, "name should match");
      assert.equal(state.symbol, symbol, "symbol should match");
      assert.equal(state.decimals, decimals, "decimals should match");
      assert.equal(state.features, 0, "SSS-1 should have no features");
      assert.equal(state.isPaused, false, "should not be paused");
      assert.equal(
        state.totalSupply.toNumber(),
        0,
        "initial supply should be 0"
      );
      assert.ok(
        state.authority.equals(provider.wallet.publicKey),
        "authority should match"
      );
      assert.ok(state.mint.equals(mintKeypair.publicKey), "mint should match");
      console.log("Initialize tx:", tx);
    });

    it("Should fail to initialize the same mint twice", async () => {
      try {
        await program.methods
          .initialize(name, symbol, decimals, false, false)
          .accounts({
            authority: provider.wallet.publicKey,
            stablecoinState: stablecoinPDA,
            masterRole: masterRolePDA,
            mint: mintKeypair.publicKey,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
            rent: anchor.web3.SYSVAR_RENT_PUBKEY,
          })
          .signers([mintKeypair])
          .rpc();
        assert.fail("Should have thrown AlreadyInitialized");
      } catch (err: any) {
        assert.ok(
          err.message.includes("already in use") ||
            err.message.includes("AlreadyInitialized"),
          "Should throw already-initialized error"
        );
      }
    });
  });

  // ==================== MINT ====================

  describe("Mint (SSS-1)", () => {
    it("Should register minter info via update_minter_quota", async () => {
      const quota = new BN(10_000_000); // 10 tokens
      const tx = await program.methods
        .updateMinterQuota(quota)
        .accounts({
          authority: provider.wallet.publicKey,
          stablecoinState: stablecoinPDA,
          masterRole: masterRolePDA,
          minterKey: provider.wallet.publicKey,
          minterInfo: minterInfoPDA,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      console.log("UpdateMinterQuota tx:", tx);

      const info = await program.account.minterInfo.fetch(minterInfoPDA);
      assert.equal(info.quota.toNumber(), 10_000_000, "quota should be set");
    });

    it("Should mint tokens to a recipient", async () => {
      const amount = new BN(1_000_000); // 1 token

      const ata = await getOrCreateAssociatedTokenAccount(
        provider.connection,
        (provider.wallet as anchor.Wallet).payer,
        mintKeypair.publicKey,
        provider.wallet.publicKey,
        false,
        "confirmed",
        {},
        TOKEN_2022_PROGRAM_ID
      );
      recipientTokenAccount = ata.address;

      const tx = await program.methods
        .mint(amount)
        .accounts({
          minter: provider.wallet.publicKey,
          stablecoinState: stablecoinPDA,
          minterRole: masterRolePDA,
          minterInfo: minterInfoPDA,
          mint: mintKeypair.publicKey,
          recipientAccount: recipientTokenAccount,
          mintAuthority: mintAuthorityPDA,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .rpc();
      console.log("Mint tx:", tx);

      const state = await program.account.stablecoinState.fetch(stablecoinPDA);
      assert.equal(
        state.totalSupply.toNumber(),
        1_000_000,
        "supply should be 1 token"
      );

      const account = await getAccount(
        provider.connection,
        recipientTokenAccount,
        "confirmed",
        TOKEN_2022_PROGRAM_ID
      );
      assert.equal(
        account.amount.toString(),
        "1000000",
        "token balance should be 1 token"
      );
    });

    it("Should track epoch minting correctly", async () => {
      const state = await program.account.stablecoinState.fetch(stablecoinPDA);
      assert.equal(
        state.currentEpochMinted.toNumber(),
        1_000_000,
        "epoch minted should be tracked"
      );
    });

    it("Should mint more tokens (cumulative supply)", async () => {
      const amount = new BN(500_000);

      await getOrCreateAssociatedTokenAccount(
        provider.connection,
        (provider.wallet as anchor.Wallet).payer,
        mintKeypair.publicKey,
        provider.wallet.publicKey,
        false,
        "confirmed",
        {},
        TOKEN_2022_PROGRAM_ID
      );

      await program.methods
        .mint(amount)
        .accounts({
          minter: provider.wallet.publicKey,
          stablecoinState: stablecoinPDA,
          minterRole: masterRolePDA,
          minterInfo: minterInfoPDA,
          mint: mintKeypair.publicKey,
          recipientAccount: recipientTokenAccount,
          mintAuthority: mintAuthorityPDA,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .rpc();

      const state = await program.account.stablecoinState.fetch(stablecoinPDA);
      assert.equal(
        state.totalSupply.toNumber(),
        1_500_000,
        "supply should accumulate"
      );
    });

    it("Should fail to mint with zero amount", async () => {
      try {
        await program.methods
          .mint(new BN(0))
          .accounts({
            minter: provider.wallet.publicKey,
            stablecoinState: stablecoinPDA,
            minterRole: masterRolePDA,
            minterInfo: minterInfoPDA,
            mint: mintKeypair.publicKey,
            recipientAccount: recipientTokenAccount,
            mintAuthority: mintAuthorityPDA,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .rpc();
        assert.fail("Should have thrown InvalidAmount");
      } catch (err: any) {
        assert.ok(
          err.message.includes("InvalidAmount") ||
            err.message.includes("invalid"),
          "Should throw invalid amount error"
        );
      }
    });
  });

  // ==================== BURN ====================

  describe("Burn (SSS-1)", () => {
    it("Should burn tokens and reduce total supply", async () => {
      const burnAmount = new BN(200_000);

      const stateBefore = await program.account.stablecoinState.fetch(
        stablecoinPDA
      );
      const supplyBefore = stateBefore.totalSupply.toNumber();

      const tx = await program.methods
        .burn(burnAmount)
        .accounts({
          burner: provider.wallet.publicKey,
          stablecoinState: stablecoinPDA,
          burnerRole: masterRolePDA,
          mint: mintKeypair.publicKey,
          burnerAccount: recipientTokenAccount,
          burnAuthority: burnAuthorityPDA,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .rpc();
      console.log("Burn tx:", tx);

      const stateAfter = await program.account.stablecoinState.fetch(
        stablecoinPDA
      );
      assert.equal(
        stateAfter.totalSupply.toNumber(),
        supplyBefore - 200_000,
        "supply should decrease by burn amount"
      );
    });
  });

  // ==================== FREEZE / THAW ====================

  describe("Freeze & Thaw (SSS-1)", () => {
    let frozenAccount: PublicKey;

    before(async () => {
      const ata = await getOrCreateAssociatedTokenAccount(
        provider.connection,
        (provider.wallet as anchor.Wallet).payer,
        mintKeypair.publicKey,
        recipient.publicKey,
        false,
        "confirmed",
        {},
        TOKEN_2022_PROGRAM_ID
      );
      frozenAccount = ata.address;
    });

    it("Should freeze an account", async () => {
      const tx = await program.methods
        .freezeAccount()
        .accounts({
          freezer: provider.wallet.publicKey,
          stablecoinState: stablecoinPDA,
          freezerRole: masterRolePDA,
          mint: mintKeypair.publicKey,
          targetAccount: frozenAccount,
          freezeAuthority: freezeAuthorityPDA,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .rpc();
      console.log("Freeze tx:", tx);

      const account = await getAccount(
        provider.connection,
        frozenAccount,
        "confirmed",
        TOKEN_2022_PROGRAM_ID
      );
      assert.equal(account.isFrozen, true, "account should be frozen");
    });

    it("Should thaw (unfreeze) an account", async () => {
      const tx = await program.methods
        .thawAccount()
        .accounts({
          freezer: provider.wallet.publicKey,
          stablecoinState: stablecoinPDA,
          freezerRole: masterRolePDA,
          mint: mintKeypair.publicKey,
          targetAccount: frozenAccount,
          freezeAuthority: freezeAuthorityPDA,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .rpc();
      console.log("Thaw tx:", tx);

      const account = await getAccount(
        provider.connection,
        frozenAccount,
        "confirmed",
        TOKEN_2022_PROGRAM_ID
      );
      assert.equal(account.isFrozen, false, "account should be thawed");
    });
  });

  // ==================== PAUSE / UNPAUSE ====================

  describe("Pause & Unpause (SSS-1)", () => {
    it("Should pause the stablecoin", async () => {
      const tx = await program.methods
        .setPaused(true)
        .accounts({
          authority: provider.wallet.publicKey,
          stablecoinState: stablecoinPDA,
          masterRole: masterRolePDA,
        })
        .rpc();
      console.log("Pause tx:", tx);

      const state = await program.account.stablecoinState.fetch(stablecoinPDA);
      assert.equal(state.isPaused, true, "should be paused");
    });

    it("Should fail to mint when paused", async () => {
      try {
        await program.methods
          .mint(new BN(100_000))
          .accounts({
            minter: provider.wallet.publicKey,
            stablecoinState: stablecoinPDA,
            minterRole: masterRolePDA,
            minterInfo: minterInfoPDA,
            mint: mintKeypair.publicKey,
            recipientAccount: recipientTokenAccount,
            mintAuthority: mintAuthorityPDA,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .rpc();
        assert.fail("Should have thrown ContractPaused");
      } catch (err: any) {
        assert.ok(
          err.message.includes("ContractPaused") ||
            err.message.includes("paused"),
          "Should throw paused error"
        );
      }
    });

    it("Should unpause the stablecoin", async () => {
      const tx = await program.methods
        .setPaused(false)
        .accounts({
          authority: provider.wallet.publicKey,
          stablecoinState: stablecoinPDA,
          masterRole: masterRolePDA,
        })
        .rpc();
      console.log("Unpause tx:", tx);

      const state = await program.account.stablecoinState.fetch(stablecoinPDA);
      assert.equal(state.isPaused, false, "should be unpaused");
    });

    it("Should mint normally after unpause", async () => {
      await program.methods
        .mint(new BN(100_000))
        .accounts({
          minter: provider.wallet.publicKey,
          stablecoinState: stablecoinPDA,
          minterRole: masterRolePDA,
          minterInfo: minterInfoPDA,
          mint: mintKeypair.publicKey,
          recipientAccount: recipientTokenAccount,
          mintAuthority: mintAuthorityPDA,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .rpc();
      // Should not throw
    });
  });

  // ==================== SUPPLY CAP ====================

  describe("Supply Cap (SSS-1)", () => {
    it("Should set a supply cap", async () => {
      const cap = new BN(2_000_000); // 2 tokens cap
      const tx = await program.methods
        .updateFeatures(0, cap, new BN(0))
        .accounts({
          authority: provider.wallet.publicKey,
          stablecoinState: stablecoinPDA,
          masterRole: masterRolePDA,
        })
        .rpc();
      console.log("SetSupplyCap tx:", tx);

      const state = await program.account.stablecoinState.fetch(stablecoinPDA);
      assert.equal(
        state.supplyCap.toNumber(),
        2_000_000,
        "supply cap should be set"
      );
    });

    it("Should fail to mint beyond supply cap", async () => {
      try {
        // Current supply is ~1.4M, cap is 2M, minting 1M more should fail
        await program.methods
          .mint(new BN(1_000_000))
          .accounts({
            minter: provider.wallet.publicKey,
            stablecoinState: stablecoinPDA,
            minterRole: masterRolePDA,
            minterInfo: minterInfoPDA,
            mint: mintKeypair.publicKey,
            recipientAccount: recipientTokenAccount,
            mintAuthority: mintAuthorityPDA,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .rpc();
        assert.fail("Should have thrown SupplyCapExceeded");
      } catch (err: any) {
        assert.ok(
          err.message.includes("SupplyCapExceeded") ||
            err.message.includes("supply cap"),
          "Should throw supply cap error"
        );
      }
    });
  });

  // ==================== ROLES ====================

  describe("Role Management (SSS-1)", () => {
    let secondMinterRolePDA: PublicKey;
    let secondMinterInfoPDA: PublicKey;

    before(() => {
      [secondMinterRolePDA] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("role"),
          secondMinter.publicKey.toBuffer(),
          mintKeypair.publicKey.toBuffer(),
        ],
        program.programId
      );
      [secondMinterInfoPDA] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("minter"),
          secondMinter.publicKey.toBuffer(),
          mintKeypair.publicKey.toBuffer(),
        ],
        program.programId
      );
    });

    it("Should grant minter role to a second account", async () => {
      const tx = await program.methods
        .updateRoles(secondMinter.publicKey, 1) // role = 1 (minter)
        .accounts({
          authority: provider.wallet.publicKey,
          stablecoinState: stablecoinPDA,
          masterRole: masterRolePDA,
          targetRole: secondMinterRolePDA,
          targetKey: secondMinter.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      console.log("GrantRole tx:", tx);

      const role = await program.account.roleAccount.fetch(secondMinterRolePDA);
      assert.equal(role.role, 1, "role should be minter (1)");
      assert.ok(
        role.account.equals(secondMinter.publicKey),
        "role account should match"
      );
    });

    it("Should set quota for the second minter", async () => {
      const quota = new BN(500_000);
      await program.methods
        .updateMinterQuota(quota)
        .accounts({
          authority: provider.wallet.publicKey,
          stablecoinState: stablecoinPDA,
          masterRole: masterRolePDA,
          minterKey: secondMinter.publicKey,
          minterInfo: secondMinterInfoPDA,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const info = await program.account.minterInfo.fetch(secondMinterInfoPDA);
      assert.equal(
        info.quota.toNumber(),
        500_000,
        "quota should be set for second minter"
      );
    });
  });

  // ==================== AUTHORITY TRANSFER ====================

  describe("Authority Transfer (SSS-1)", () => {
    let newAuthorityRolePDA: PublicKey;

    before(() => {
      [newAuthorityRolePDA] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("role"),
          newAuthority.publicKey.toBuffer(),
          mintKeypair.publicKey.toBuffer(),
        ],
        program.programId
      );
    });

    it("Should transfer authority to a new account", async () => {
      const tx = await program.methods
        .transferAuthority(newAuthority.publicKey)
        .accounts({
          authority: provider.wallet.publicKey,
          stablecoinState: stablecoinPDA,
          masterRole: masterRolePDA,
          newAuthority: newAuthority.publicKey,
          newMasterRole: newAuthorityRolePDA,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      console.log("TransferAuthority tx:", tx);

      const state = await program.account.stablecoinState.fetch(stablecoinPDA);
      assert.ok(
        state.authority.equals(newAuthority.publicKey),
        "authority should transfer"
      );
    });
  });

  // ==================== BATCH MINT ====================

  describe("Batch Mint (SSS-1)", () => {
    let batchMintKeypair: Keypair;
    let batchStablecoinPDA: PublicKey;
    let batchMasterRolePDA: PublicKey;
    let batchMinterInfoPDA: PublicKey;
    let batchMintAuthorityPDA: PublicKey;
    let batchFreezeAuthorityPDA: PublicKey;

    before(async () => {
      batchMintKeypair = Keypair.generate();

      [batchStablecoinPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("stablecoin"), batchMintKeypair.publicKey.toBuffer()],
        program.programId
      );
      [batchMasterRolePDA] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("role"),
          provider.wallet.publicKey.toBuffer(),
          batchMintKeypair.publicKey.toBuffer(),
        ],
        program.programId
      );
      [batchMinterInfoPDA] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("minter"),
          provider.wallet.publicKey.toBuffer(),
          batchMintKeypair.publicKey.toBuffer(),
        ],
        program.programId
      );
      [batchMintAuthorityPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("mint_authority"), batchStablecoinPDA.toBuffer()],
        program.programId
      );
      [batchFreezeAuthorityPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("freeze_authority"), batchStablecoinPDA.toBuffer()],
        program.programId
      );

      await createMint(
        provider.connection,
        (provider.wallet as anchor.Wallet).payer,
        batchMintAuthorityPDA,
        batchFreezeAuthorityPDA,
        6,
        batchMintKeypair,
        { commitment: "confirmed" },
        TOKEN_2022_PROGRAM_ID
      );

      await program.methods
        .initialize("Batch USD", "BUSD", 6, false, false)
        .accounts({
          authority: provider.wallet.publicKey,
          stablecoinState: batchStablecoinPDA,
          masterRole: batchMasterRolePDA,
          mint: batchMintKeypair.publicKey,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .signers([batchMintKeypair])
        .rpc();

      await program.methods
        .updateMinterQuota(new BN(100_000_000))
        .accounts({
          authority: provider.wallet.publicKey,
          stablecoinState: batchStablecoinPDA,
          masterRole: batchMasterRolePDA,
          minterKey: provider.wallet.publicKey,
          minterInfo: batchMinterInfoPDA,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
    });

    it("Should batch mint to multiple recipients", async () => {
      const recipients = [
        Keypair.generate(),
        Keypair.generate(),
        Keypair.generate(),
      ];
      const amounts = [new BN(100_000), new BN(200_000), new BN(300_000)];

      const atas = await Promise.all(
        recipients.map((r) =>
          getOrCreateAssociatedTokenAccount(
            provider.connection,
            (provider.wallet as anchor.Wallet).payer,
            batchMintKeypair.publicKey,
            r.publicKey,
            false,
            "confirmed",
            {},
            TOKEN_2022_PROGRAM_ID
          )
        )
      );

      const remainingAccounts = atas.map((ata) => ({
        pubkey: ata.address,
        isSigner: false,
        isWritable: true,
      }));

      const tx = await program.methods
        .batchMint(amounts)
        .accounts({
          minter: provider.wallet.publicKey,
          stablecoinState: batchStablecoinPDA,
          minterRole: batchMasterRolePDA,
          minterInfo: batchMinterInfoPDA,
          mint: batchMintKeypair.publicKey,
          mintAuthority: batchMintAuthorityPDA,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .remainingAccounts(remainingAccounts)
        .rpc();
      console.log("BatchMint tx:", tx);

      const state = await program.account.stablecoinState.fetch(
        batchStablecoinPDA
      );
      assert.equal(
        state.totalSupply.toNumber(),
        600_000,
        "total supply should be sum of all minted"
      );

      // Verify each recipient got their tokens
      for (let i = 0; i < atas.length; i++) {
        const account = await getAccount(
          provider.connection,
          atas[i].address,
          "confirmed",
          TOKEN_2022_PROGRAM_ID
        );
        assert.equal(
          account.amount.toString(),
          amounts[i].toString(),
          `recipient ${i} should have correct balance`
        );
      }
    });
  });
});
