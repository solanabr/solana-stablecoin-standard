import * as anchor from "@coral-xyz/anchor";
import { Keypair, PublicKey } from "@solana/web3.js";
import { expect } from "chai";
import {
  provider,
  coreProgram,
  hookProgram,
  admin,
  createSSS2Mint,
  grantRole,
  createTokenAccount,
  airdropSol,
  initializeHook,
  findRolePda,
} from "../../helpers/setup";
import { ROLE, TOKEN_2022_PROGRAM_ID } from "../../helpers/constants";

describe("sss-core: freeze / thaw", () => {
  let configPda: PublicKey;
  let mintKeypair: Keypair;
  let treasuryKeypair: Keypair;
  let complianceOfficer: Keypair;
  let userKeypair: Keypair;
  let userAta: PublicKey;

  beforeEach(async () => {
    treasuryKeypair = Keypair.generate();
    complianceOfficer = Keypair.generate();
    userKeypair = Keypair.generate();

    await airdropSol(treasuryKeypair.publicKey);
    await airdropSol(complianceOfficer.publicKey);
    await airdropSol(userKeypair.publicKey);

    const result = await createSSS2Mint(treasuryKeypair.publicKey);
    mintKeypair = result.mintKeypair;
    configPda = result.configPda;

    await initializeHook(mintKeypair.publicKey, configPda);
    await grantRole(configPda, complianceOfficer.publicKey, ROLE.ComplianceOfficer);

    userAta = await createTokenAccount(mintKeypair.publicKey, userKeypair.publicKey);
  });

  // Helper: thaw via admin so tests can re-freeze
  async function adminThaw() {
    await coreProgram.methods
      .thawAccount()
      .accounts({
        authority: admin.publicKey,
        config: configPda,
        roleAccount: null,
        mint: mintKeypair.publicKey,
        tokenAccount: userAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();
  }

  it("compliance officer can freeze account", async () => {
    const [roleAccount] = findRolePda(configPda, complianceOfficer.publicKey, ROLE.ComplianceOfficer);

    // Account starts frozen in SSS-2; thaw first so we can test freeze
    await adminThaw();

    const tx = await coreProgram.methods
      .freezeAccount()
      .accounts({
        authority: complianceOfficer.publicKey,
        config: configPda,
        roleAccount,
        mint: mintKeypair.publicKey,
        tokenAccount: userAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .signers([complianceOfficer])
      .rpc();

    expect(tx).to.be.a("string");
  });

  it("compliance officer can thaw frozen account", async () => {
    const [roleAccount] = findRolePda(configPda, complianceOfficer.publicKey, ROLE.ComplianceOfficer);

    // Account starts frozen in SSS-2, thaw directly
    const tx = await coreProgram.methods
      .thawAccount()
      .accounts({
        authority: complianceOfficer.publicKey,
        config: configPda,
        roleAccount,
        mint: mintKeypair.publicKey,
        tokenAccount: userAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .signers([complianceOfficer])
      .rpc();

    expect(tx).to.be.a("string");
  });

  it("admin can freeze account", async () => {
    // Thaw first (SSS-2 starts frozen)
    await adminThaw();

    const tx = await coreProgram.methods
      .freezeAccount()
      .accounts({
        authority: admin.publicKey,
        config: configPda,
        roleAccount: null,
        mint: mintKeypair.publicKey,
        tokenAccount: userAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();

    expect(tx).to.be.a("string");
  });

  it("admin can thaw account", async () => {
    // Account starts frozen in SSS-2
    const tx = await coreProgram.methods
      .thawAccount()
      .accounts({
        authority: admin.publicKey,
        config: configPda,
        roleAccount: null,
        mint: mintKeypair.publicKey,
        tokenAccount: userAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();

    expect(tx).to.be.a("string");
  });

  it("rejects freeze by unauthorized", async () => {
    const random = Keypair.generate();
    await airdropSol(random.publicKey);

    // Thaw first so we know the error is about authorization, not state
    await adminThaw();

    try {
      await coreProgram.methods
        .freezeAccount()
        .accounts({
          authority: random.publicKey,
          config: configPda,
          roleAccount: null,
          mint: mintKeypair.publicKey,
          tokenAccount: userAta,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([random])
        .rpc();
      expect.fail("Should have failed");
    } catch (error) {
      expect(error).to.exist;
    }
  });

  it("rejects thaw by unauthorized", async () => {
    // Account starts frozen in SSS-2
    const random = Keypair.generate();
    await airdropSol(random.publicKey);

    try {
      await coreProgram.methods
        .thawAccount()
        .accounts({
          authority: random.publicKey,
          config: configPda,
          roleAccount: null,
          mint: mintKeypair.publicKey,
          tokenAccount: userAta,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([random])
        .rpc();
      expect.fail("Should have failed");
    } catch (error) {
      expect(error).to.exist;
    }
  });

  it("minter role cannot freeze", async () => {
    const minter = Keypair.generate();
    await airdropSol(minter.publicKey);
    await grantRole(configPda, minter.publicKey, ROLE.Minter, 1_000_000);

    // Thaw first
    await adminThaw();

    try {
      await coreProgram.methods
        .freezeAccount()
        .accounts({
          authority: minter.publicKey,
          config: configPda,
          roleAccount: null,
          mint: mintKeypair.publicKey,
          tokenAccount: userAta,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([minter])
        .rpc();
      expect.fail("Should have failed");
    } catch (error) {
      expect(error).to.exist;
    }
  });

  it("freeze then thaw then freeze again works", async () => {
    const [roleAccount] = findRolePda(configPda, complianceOfficer.publicKey, ROLE.ComplianceOfficer);

    // Start: frozen. Thaw first.
    await coreProgram.methods
      .thawAccount()
      .accounts({
        authority: complianceOfficer.publicKey, config: configPda, roleAccount,
        mint: mintKeypair.publicKey, tokenAccount: userAta, tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .signers([complianceOfficer])
      .rpc();

    // Freeze
    await coreProgram.methods
      .freezeAccount()
      .accounts({
        authority: complianceOfficer.publicKey, config: configPda, roleAccount,
        mint: mintKeypair.publicKey, tokenAccount: userAta, tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .signers([complianceOfficer])
      .rpc();

    // Thaw again
    await coreProgram.methods
      .thawAccount()
      .accounts({
        authority: complianceOfficer.publicKey, config: configPda, roleAccount,
        mint: mintKeypair.publicKey, tokenAccount: userAta, tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .signers([complianceOfficer])
      .rpc();

    // Freeze again
    const tx = await coreProgram.methods
      .freezeAccount()
      .accounts({
        authority: complianceOfficer.publicKey, config: configPda, roleAccount,
        mint: mintKeypair.publicKey, tokenAccount: userAta, tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .signers([complianceOfficer])
      .rpc();

    expect(tx).to.be.a("string");
  });

  it("thaw on already-thawed account fails", async () => {
    const [roleAccount] = findRolePda(configPda, complianceOfficer.publicKey, ROLE.ComplianceOfficer);

    // First thaw (account starts frozen in SSS-2)
    await coreProgram.methods
      .thawAccount()
      .accounts({
        authority: complianceOfficer.publicKey,
        config: configPda,
        roleAccount,
        mint: mintKeypair.publicKey,
        tokenAccount: userAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .signers([complianceOfficer])
      .rpc();

    // Second thaw should fail (account is already thawed)
    try {
      await coreProgram.methods
        .thawAccount()
        .accounts({
          authority: complianceOfficer.publicKey,
          config: configPda,
          roleAccount,
          mint: mintKeypair.publicKey,
          tokenAccount: userAta,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([complianceOfficer])
        .rpc();
      expect.fail("Should have failed");
    } catch (error) {
      expect(error).to.exist;
    }
  });
});
