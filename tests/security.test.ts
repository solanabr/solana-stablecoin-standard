import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import { expect } from "chai";
import { SssCore } from "../target/types/sss_core";
import {
  createSss1Mint,
  createTokenAccount,
  deriveRolePda,
  grantRole,
  airdropSol,
  ROLE_ADMIN,
  ROLE_MINTER,
  ROLE_FREEZER,
  ROLE_PAUSER,
  CreateSss1MintResult,
} from "./helpers";

describe("Security", () => {
  const provider = anchor.AnchorProvider.env();
  provider.opts.commitment = "confirmed";
  anchor.setProvider(provider);

  const coreProgram = anchor.workspace.SssCore as Program<SssCore>;

  let mintResult: CreateSss1MintResult;
  let recipientAta: PublicKey;
  let treasuryAta: PublicKey;
  let minterRolePda: PublicKey;

  const minter = Keypair.generate();
  const attacker = Keypair.generate();
  const recipient = Keypair.generate();

  before(async () => {
    // Fund all accounts
    await airdropSol(provider.connection, minter.publicKey, 5);
    await airdropSol(provider.connection, attacker.publicKey, 5);
    await airdropSol(provider.connection, recipient.publicKey, 2);

    // Create SSS-1 stablecoin owned by default provider authority
    mintResult = await createSss1Mint(provider, coreProgram, {
      name: "Security Test USD",
      symbol: "SUSD",
      uri: "https://example.com/susd.json",
      decimals: 6,
      supplyCap: null,
    });

    // Grant minter role to the legitimate minter
    minterRolePda = await grantRole(
      coreProgram,
      mintResult.configPda,
      mintResult.adminRolePda,
      minter.publicKey,
      ROLE_MINTER,
    );

    // Create token accounts for testing
    recipientAta = await createTokenAccount(
      provider,
      mintResult.mint.publicKey,
      recipient.publicKey,
    );
    treasuryAta = await createTokenAccount(
      provider,
      mintResult.mint.publicKey,
      provider.wallet.publicKey,
    );

    // Mint some tokens so burn/seize operations can be attempted
    await coreProgram.methods
      .mintTokens(new BN(1_000_000))
      .accountsPartial({
        minter: minter.publicKey,
        config: mintResult.configPda,
        minterRole: minterRolePda,
        mint: mintResult.mint.publicKey,
        to: recipientAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .signers([minter])
      .rpc();
  });

  // ─────────────────────────────────────────────────────────────
  // 1. Mint without minter role
  // ─────────────────────────────────────────────────────────────

  it("rejects mint from account without minter role", async () => {
    const [attackerMinterRole] = deriveRolePda(
      mintResult.configPda,
      attacker.publicKey,
      ROLE_MINTER,
      coreProgram.programId,
    );

    try {
      await coreProgram.methods
        .mintTokens(new BN(1_000))
        .accountsPartial({
          minter: attacker.publicKey,
          config: mintResult.configPda,
          minterRole: attackerMinterRole,
          mint: mintResult.mint.publicKey,
          to: recipientAta,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([attacker])
        .rpc();
      expect.fail("Attacker without minter role should not be able to mint");
    } catch (err: any) {
      // PDA does not exist — Anchor rejects with AccountNotInitialized
      expect(err.error.errorCode.code).to.equal("AccountNotInitialized");
    }
  });

  // ─────────────────────────────────────────────────────────────
  // 2. Burn without minter role
  // ─────────────────────────────────────────────────────────────

  it("rejects burn from account without minter role", async () => {
    const [attackerBurnerRole] = deriveRolePda(
      mintResult.configPda,
      attacker.publicKey,
      ROLE_MINTER, // burn uses minter role
      coreProgram.programId,
    );

    try {
      await coreProgram.methods
        .burnTokens(new BN(100))
        .accountsPartial({
          burner: attacker.publicKey,
          config: mintResult.configPda,
          burnerRole: attackerBurnerRole,
          mint: mintResult.mint.publicKey,
          from: recipientAta,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([attacker])
        .rpc();
      expect.fail("Attacker without minter role should not be able to burn");
    } catch (err: any) {
      expect(err.error.errorCode.code).to.equal("AccountNotInitialized");
    }
  });

  // ─────────────────────────────────────────────────────────────
  // 3. Freeze without freezer role
  // ─────────────────────────────────────────────────────────────

  it("rejects freeze from account without freezer role", async () => {
    const [attackerFreezerRole] = deriveRolePda(
      mintResult.configPda,
      attacker.publicKey,
      ROLE_FREEZER,
      coreProgram.programId,
    );

    try {
      await coreProgram.methods
        .freezeAccount()
        .accountsPartial({
          freezer: attacker.publicKey,
          config: mintResult.configPda,
          freezerRole: attackerFreezerRole,
          mint: mintResult.mint.publicKey,
          tokenAccount: recipientAta,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([attacker])
        .rpc();
      expect.fail("Attacker without freezer role should not be able to freeze");
    } catch (err: any) {
      expect(err.error.errorCode.code).to.equal("AccountNotInitialized");
    }
  });

  // ─────────────────────────────────────────────────────────────
  // 4. Thaw without freezer role
  // ─────────────────────────────────────────────────────────────

  it("rejects thaw from account without freezer role", async () => {
    const [attackerFreezerRole] = deriveRolePda(
      mintResult.configPda,
      attacker.publicKey,
      ROLE_FREEZER,
      coreProgram.programId,
    );

    try {
      await coreProgram.methods
        .thawAccount()
        .accountsPartial({
          freezer: attacker.publicKey,
          config: mintResult.configPda,
          freezerRole: attackerFreezerRole,
          mint: mintResult.mint.publicKey,
          tokenAccount: recipientAta,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([attacker])
        .rpc();
      expect.fail("Attacker without freezer role should not be able to thaw");
    } catch (err: any) {
      expect(err.error.errorCode.code).to.equal("AccountNotInitialized");
    }
  });

  // ─────────────────────────────────────────────────────────────
  // 5. Pause without pauser role
  // ─────────────────────────────────────────────────────────────

  it("rejects pause from account without pauser role", async () => {
    const [attackerPauserRole] = deriveRolePda(
      mintResult.configPda,
      attacker.publicKey,
      ROLE_PAUSER,
      coreProgram.programId,
    );

    try {
      await coreProgram.methods
        .pause()
        .accountsPartial({
          pauser: attacker.publicKey,
          config: mintResult.configPda,
          pauserRole: attackerPauserRole,
        })
        .signers([attacker])
        .rpc();
      expect.fail("Attacker without pauser role should not be able to pause");
    } catch (err: any) {
      expect(err.error.errorCode.code).to.equal("AccountNotInitialized");
    }
  });

  // ─────────────────────────────────────────────────────────────
  // 6. Unpause without pauser role
  // ─────────────────────────────────────────────────────────────

  it("rejects unpause from account without pauser role", async () => {
    // First, pause legitimately via the admin (who has no pauser role,
    // so we grant one temporarily)
    const pauser = Keypair.generate();
    await airdropSol(provider.connection, pauser.publicKey, 2);

    const pauserRolePda = await grantRole(
      coreProgram,
      mintResult.configPda,
      mintResult.adminRolePda,
      pauser.publicKey,
      ROLE_PAUSER,
    );

    await coreProgram.methods
      .pause()
      .accountsPartial({
        pauser: pauser.publicKey,
        config: mintResult.configPda,
        pauserRole: pauserRolePda,
      })
      .signers([pauser])
      .rpc();

    // Now attacker tries to unpause
    const [attackerPauserRole] = deriveRolePda(
      mintResult.configPda,
      attacker.publicKey,
      ROLE_PAUSER,
      coreProgram.programId,
    );

    try {
      await coreProgram.methods
        .unpause()
        .accountsPartial({
          pauser: attacker.publicKey,
          config: mintResult.configPda,
          pauserRole: attackerPauserRole,
        })
        .signers([attacker])
        .rpc();
      expect.fail("Attacker without pauser role should not be able to unpause");
    } catch (err: any) {
      expect(err.error.errorCode.code).to.equal("AccountNotInitialized");
    }

    // Clean up: unpause so subsequent tests can run
    await coreProgram.methods
      .unpause()
      .accountsPartial({
        pauser: pauser.publicKey,
        config: mintResult.configPda,
        pauserRole: pauserRolePda,
      })
      .signers([pauser])
      .rpc();
  });

  // ─────────────────────────────────────────────────────────────
  // 7. Grant role without admin
  // ─────────────────────────────────────────────────────────────

  it("rejects grant role from account without admin role", async () => {
    const someUser = Keypair.generate();

    const [attackerAdminRole] = deriveRolePda(
      mintResult.configPda,
      attacker.publicKey,
      ROLE_ADMIN,
      coreProgram.programId,
    );
    const [targetRolePda] = deriveRolePda(
      mintResult.configPda,
      someUser.publicKey,
      ROLE_MINTER,
      coreProgram.programId,
    );

    try {
      await coreProgram.methods
        .grantRole(ROLE_MINTER)
        .accountsPartial({
          admin: attacker.publicKey,
          config: mintResult.configPda,
          adminRole: attackerAdminRole,
          grantee: someUser.publicKey,
          roleAccount: targetRolePda,
          systemProgram: SystemProgram.programId,
        })
        .signers([attacker])
        .rpc();
      expect.fail("Attacker without admin role should not be able to grant roles");
    } catch (err: any) {
      expect(err.error.errorCode.code).to.equal("AccountNotInitialized");
    }
  });

  // ─────────────────────────────────────────────────────────────
  // 8. Revoke role without admin
  // ─────────────────────────────────────────────────────────────

  it("rejects revoke role from account without admin role", async () => {
    const [attackerAdminRole] = deriveRolePda(
      mintResult.configPda,
      attacker.publicKey,
      ROLE_ADMIN,
      coreProgram.programId,
    );

    try {
      await coreProgram.methods
        .revokeRole()
        .accountsPartial({
          admin: attacker.publicKey,
          config: mintResult.configPda,
          adminRole: attackerAdminRole,
          roleAccount: minterRolePda, // try to revoke the legitimate minter
        })
        .signers([attacker])
        .rpc();
      expect.fail("Attacker without admin role should not be able to revoke roles");
    } catch (err: any) {
      expect(err.error.errorCode.code).to.equal("AccountNotInitialized");
    }
  });

  // ─────────────────────────────────────────────────────────────
  // 9. Seize without admin
  // ─────────────────────────────────────────────────────────────

  it("rejects seize from account without admin role", async () => {
    // Create an ATA for the attacker to receive seized tokens
    const attackerAta = await createTokenAccount(
      provider,
      mintResult.mint.publicKey,
      attacker.publicKey,
    );

    const [attackerAdminRole] = deriveRolePda(
      mintResult.configPda,
      attacker.publicKey,
      ROLE_ADMIN,
      coreProgram.programId,
    );

    try {
      await coreProgram.methods
        .seize(new BN(100))
        .accountsPartial({
          admin: attacker.publicKey,
          config: mintResult.configPda,
          adminRole: attackerAdminRole,
          mint: mintResult.mint.publicKey,
          from: recipientAta,
          to: attackerAta,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([attacker])
        .rpc();
      expect.fail("Attacker without admin role should not be able to seize tokens");
    } catch (err: any) {
      expect(err.error.errorCode.code).to.equal("AccountNotInitialized");
    }
  });
});
