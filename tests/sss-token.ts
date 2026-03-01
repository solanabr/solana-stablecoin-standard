import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { SssToken } from "../target/types/sss_token";
import {
  Keypair,
  PublicKey,
  SystemProgram,
} from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  createInitializeMintInstruction,
  getMintLen,
  ExtensionType,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { expect } from "chai";

describe("sss-token", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.SssToken as Program<SssToken>;
  const authority = provider.wallet;

  let mintKeypair: Keypair;
  let mint: PublicKey;
  let stablecoinPda: PublicKey;
  let stablecoinBump: number;

  before(async () => {
    mintKeypair = Keypair.generate();
    mint = mintKeypair.publicKey;

    // Derive PDA
    [stablecoinPda, stablecoinBump] = PublicKey.findProgramAddressSync(
      [Buffer.from("stablecoin"), mint.toBuffer()],
      program.programId
    );
  });

  describe("SSS-1 (Minimal Stablecoin)", () => {
    it("should create a Token-2022 mint and initialize stablecoin state", async () => {
      // Create mint with Token-2022
      const mintLen = getMintLen([]);
      const lamports =
        await provider.connection.getMinimumBalanceForRentExemption(mintLen);

      const createMintTx = new anchor.web3.Transaction().add(
        SystemProgram.createAccount({
          fromPubkey: authority.publicKey,
          newAccountPubkey: mint,
          space: mintLen,
          lamports,
          programId: TOKEN_2022_PROGRAM_ID,
        }),
        createInitializeMintInstruction(
          mint,
          6,
          stablecoinPda, // mint authority = PDA
          stablecoinPda, // freeze authority = PDA
          TOKEN_2022_PROGRAM_ID
        )
      );

      await provider.sendAndConfirm(createMintTx, [mintKeypair]);

      // Initialize stablecoin
      await program.methods
        .initialize({
          name: "TestStable",
          symbol: "TST",
          uri: "https://example.com/metadata.json",
          decimals: 6,
          enablePermanentDelegate: false,
          enableTransferHook: false,
          defaultAccountFrozen: false,
        })
        .accounts({
          authority: authority.publicKey,
          stablecoinState: stablecoinPda,
          mint,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      // Verify state
      const state = await program.account.stablecoinState.fetch(stablecoinPda);
      expect(state.name).to.equal("TestStable");
      expect(state.symbol).to.equal("TST");
      expect(state.decimals).to.equal(6);
      expect(state.complianceEnabled).to.be.false;
      expect(state.paused).to.be.false;
      expect(state.masterAuthority.toBase58()).to.equal(
        authority.publicKey.toBase58()
      );
    });

    it("should add a minter and mint tokens", async () => {
      // Add authority as minter
      const [minterPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("minter"),
          stablecoinPda.toBuffer(),
          authority.publicKey.toBuffer(),
        ],
        program.programId
      );

      await program.methods
        .updateMinter(new anchor.BN(1_000_000_000)) // 1000 tokens quota
        .accounts({
          authority: authority.publicKey,
          stablecoinState: stablecoinPda,
          minter: authority.publicKey,
          minterState: minterPda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      // Create recipient ATA
      const recipient = authority.publicKey;
      const recipientAta = getAssociatedTokenAddressSync(
        mint,
        recipient,
        false,
        TOKEN_2022_PROGRAM_ID
      );

      const createAtaTx = new anchor.web3.Transaction().add(
        createAssociatedTokenAccountInstruction(
          authority.publicKey,
          recipientAta,
          recipient,
          mint,
          TOKEN_2022_PROGRAM_ID,
          ASSOCIATED_TOKEN_PROGRAM_ID
        )
      );
      await provider.sendAndConfirm(createAtaTx);

      // Mint 100 tokens
      await program.methods
        .mintTokens(new anchor.BN(100_000_000))
        .accounts({
          minter: authority.publicKey,
          stablecoinState: stablecoinPda,
          minterState: minterPda,
          mint,
          recipientTokenAccount: recipientAta,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .rpc();

      // Verify minter state
      const minterState = await program.account.minterState.fetch(minterPda);
      expect(minterState.minted.toNumber()).to.equal(100_000_000);
      expect(minterState.active).to.be.true;
    });

    it("should pause and unpause", async () => {
      await program.methods
        .pause()
        .accounts({
          authority: authority.publicKey,
          stablecoinState: stablecoinPda,
        })
        .rpc();

      let state = await program.account.stablecoinState.fetch(stablecoinPda);
      expect(state.paused).to.be.true;

      await program.methods
        .unpause()
        .accounts({
          authority: authority.publicKey,
          stablecoinState: stablecoinPda,
        })
        .rpc();

      state = await program.account.stablecoinState.fetch(stablecoinPda);
      expect(state.paused).to.be.false;
    });

    it("should reject minting when paused", async () => {
      // Pause first
      await program.methods
        .pause()
        .accounts({
          authority: authority.publicKey,
          stablecoinState: stablecoinPda,
        })
        .rpc();

      const [minterPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("minter"),
          stablecoinPda.toBuffer(),
          authority.publicKey.toBuffer(),
        ],
        program.programId
      );

      const recipientAta = getAssociatedTokenAddressSync(
        mint,
        authority.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID
      );

      try {
        await program.methods
          .mintTokens(new anchor.BN(1_000_000))
          .accounts({
            minter: authority.publicKey,
            stablecoinState: stablecoinPda,
            minterState: minterPda,
            mint,
            recipientTokenAccount: recipientAta,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .rpc();
        expect.fail("Should have thrown");
      } catch (err: any) {
        expect(err.error.errorCode.code).to.equal("Paused");
      }

      // Unpause for future tests
      await program.methods
        .unpause()
        .accounts({
          authority: authority.publicKey,
          stablecoinState: stablecoinPda,
        })
        .rpc();
    });

    it("should reject minting beyond quota", async () => {
      const [minterPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("minter"),
          stablecoinPda.toBuffer(),
          authority.publicKey.toBuffer(),
        ],
        program.programId
      );

      const recipientAta = getAssociatedTokenAddressSync(
        mint,
        authority.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID
      );

      try {
        // Try to mint more than quota (1000 tokens - already minted 100)
        await program.methods
          .mintTokens(new anchor.BN(999_000_000_000)) // Way over quota
          .accounts({
            minter: authority.publicKey,
            stablecoinState: stablecoinPda,
            minterState: minterPda,
            mint,
            recipientTokenAccount: recipientAta,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .rpc();
        expect.fail("Should have thrown");
      } catch (err: any) {
        expect(err.error.errorCode.code).to.equal("QuotaExceeded");
      }
    });

    it("should transfer authority", async () => {
      const newAuthority = Keypair.generate();

      await program.methods
        .transferAuthority()
        .accounts({
          authority: authority.publicKey,
          stablecoinState: stablecoinPda,
          newAuthority: newAuthority.publicKey,
        })
        .rpc();

      let state = await program.account.stablecoinState.fetch(stablecoinPda);
      expect(state.masterAuthority.toBase58()).to.equal(
        newAuthority.publicKey.toBase58()
      );

      // Transfer back
      await program.methods
        .transferAuthority()
        .accounts({
          authority: newAuthority.publicKey,
          stablecoinState: stablecoinPda,
          newAuthority: authority.publicKey,
        })
        .signers([newAuthority])
        .rpc();

      state = await program.account.stablecoinState.fetch(stablecoinPda);
      expect(state.masterAuthority.toBase58()).to.equal(
        authority.publicKey.toBase58()
      );
    });
  });

  describe("SSS-2 (Compliant Stablecoin)", () => {
    let sss2Mint: PublicKey;
    let sss2MintKeypair: Keypair;
    let sss2Pda: PublicKey;

    before(async () => {
      sss2MintKeypair = Keypair.generate();
      sss2Mint = sss2MintKeypair.publicKey;

      [sss2Pda] = PublicKey.findProgramAddressSync(
        [Buffer.from("stablecoin"), sss2Mint.toBuffer()],
        program.programId
      );

      // Create mint
      const mintLen = getMintLen([]);
      const lamports =
        await provider.connection.getMinimumBalanceForRentExemption(mintLen);

      const createMintTx = new anchor.web3.Transaction().add(
        SystemProgram.createAccount({
          fromPubkey: authority.publicKey,
          newAccountPubkey: sss2Mint,
          space: mintLen,
          lamports,
          programId: TOKEN_2022_PROGRAM_ID,
        }),
        createInitializeMintInstruction(
          sss2Mint,
          6,
          sss2Pda,
          sss2Pda,
          TOKEN_2022_PROGRAM_ID
        )
      );
      await provider.sendAndConfirm(createMintTx, [sss2MintKeypair]);

      // Initialize as SSS-2
      await program.methods
        .initialize({
          name: "ComplianceStable",
          symbol: "CSTB",
          uri: "",
          decimals: 6,
          enablePermanentDelegate: true,
          enableTransferHook: true,
          defaultAccountFrozen: false,
        })
        .accounts({
          authority: authority.publicKey,
          stablecoinState: sss2Pda,
          mint: sss2Mint,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
    });

    it("should have compliance enabled", async () => {
      const state = await program.account.stablecoinState.fetch(sss2Pda);
      expect(state.complianceEnabled).to.be.true;
      expect(state.permanentDelegateEnabled).to.be.true;
      expect(state.transferHookEnabled).to.be.true;
    });

    it("should assign blacklister role", async () => {
      const [rolePda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("role"),
          sss2Pda.toBuffer(),
          Buffer.from("blacklister"),
          authority.publicKey.toBuffer(),
        ],
        program.programId
      );

      await program.methods
        .updateRoles({ blacklister: {} } as any, authority.publicKey, true)
        .accounts({
          authority: authority.publicKey,
          stablecoinState: sss2Pda,
          roleAssignment: rolePda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const role = await program.account.roleAssignment.fetch(rolePda);
      expect(role.active).to.be.true;
    });

    it("should add and remove from blacklist", async () => {
      const target = Keypair.generate().publicKey;

      const [blacklistPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("blacklist"), sss2Pda.toBuffer(), target.toBuffer()],
        program.programId
      );

      const [rolePda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("role"),
          sss2Pda.toBuffer(),
          Buffer.from("blacklister"),
          authority.publicKey.toBuffer(),
        ],
        program.programId
      );

      // Add to blacklist
      await program.methods
        .addToBlacklist("OFAC match")
        .accounts({
          blacklister: authority.publicKey,
          stablecoinState: sss2Pda,
          roleAssignment: rolePda,
          target,
          blacklistEntry: blacklistPda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const entry = await program.account.blacklistEntry.fetch(blacklistPda);
      expect(entry.reason).to.equal("OFAC match");
      expect(entry.address.toBase58()).to.equal(target.toBase58());

      // Remove from blacklist
      await program.methods
        .removeFromBlacklist()
        .accounts({
          blacklister: authority.publicKey,
          stablecoinState: sss2Pda,
          roleAssignment: rolePda,
          target,
          blacklistEntry: blacklistPda,
        })
        .rpc();

      // Verify removal (account should be closed)
      const info = await provider.connection.getAccountInfo(blacklistPda);
      expect(info).to.be.null;
    });

    it("should reject compliance roles on SSS-1", async () => {
      // Try to assign blacklister role on SSS-1 stablecoin
      const target = Keypair.generate().publicKey;
      const [rolePda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("role"),
          stablecoinPda.toBuffer(),
          Buffer.from("blacklister"),
          target.toBuffer(),
        ],
        program.programId
      );

      try {
        await program.methods
          .updateRoles({ blacklister: {} } as any, target, true)
          .accounts({
            authority: authority.publicKey,
            stablecoinState: stablecoinPda,
            roleAssignment: rolePda,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
        expect.fail("Should have thrown");
      } catch (err: any) {
        expect(err.error.errorCode.code).to.equal("ComplianceNotEnabled");
      }
    });
  });
});
