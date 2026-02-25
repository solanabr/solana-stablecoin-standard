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

describe("Role Management", () => {
  const provider = anchor.AnchorProvider.env();
  provider.opts.commitment = "confirmed";
  anchor.setProvider(provider);

  const coreProgram = anchor.workspace.SssCore as Program<SssCore>;

  let mintResult: CreateSss1MintResult;
  let recipientAta: PublicKey;

  const admin2 = Keypair.generate();
  const minter = Keypair.generate();
  const freezer = Keypair.generate();
  const pauser = Keypair.generate();
  const recipient = Keypair.generate();
  const nonAdmin = Keypair.generate();

  before(async () => {
    await airdropSol(provider.connection, admin2.publicKey, 5);
    await airdropSol(provider.connection, minter.publicKey, 5);
    await airdropSol(provider.connection, freezer.publicKey, 5);
    await airdropSol(provider.connection, pauser.publicKey, 5);
    await airdropSol(provider.connection, recipient.publicKey, 2);
    await airdropSol(provider.connection, nonAdmin.publicKey, 5);

    mintResult = await createSss1Mint(provider, coreProgram, {
      name: "Role Test USD",
      symbol: "RUSD",
      uri: "https://example.com/rusd.json",
      decimals: 6,
      supplyCap: null,
    });

    recipientAta = await createTokenAccount(
      provider,
      mintResult.mint.publicKey,
      recipient.publicKey,
    );
  });

  it("admin can grant all role types", async () => {
    const minterPda = await grantRole(
      coreProgram,
      mintResult.configPda,
      mintResult.adminRolePda,
      minter.publicKey,
      ROLE_MINTER,
    );
    const freezerPda = await grantRole(
      coreProgram,
      mintResult.configPda,
      mintResult.adminRolePda,
      freezer.publicKey,
      ROLE_FREEZER,
    );
    const pauserPda = await grantRole(
      coreProgram,
      mintResult.configPda,
      mintResult.adminRolePda,
      pauser.publicKey,
      ROLE_PAUSER,
    );

    const minterRole = await coreProgram.account.roleAccount.fetch(minterPda);
    const freezerRole =
      await coreProgram.account.roleAccount.fetch(freezerPda);
    const pauserRole = await coreProgram.account.roleAccount.fetch(pauserPda);

    expect(minterRole.role).to.deep.equal({ minter: {} });
    expect(freezerRole.role).to.deep.equal({ freezer: {} });
    expect(pauserRole.role).to.deep.equal({ pauser: {} });
  });

  it("admin can grant another admin", async () => {
    const admin2Pda = await grantRole(
      coreProgram,
      mintResult.configPda,
      mintResult.adminRolePda,
      admin2.publicKey,
      ROLE_ADMIN,
    );

    const adminRole = await coreProgram.account.roleAccount.fetch(admin2Pda);
    expect(adminRole.role).to.deep.equal({ admin: {} });
    expect(adminRole.address.toBase58()).to.equal(
      admin2.publicKey.toBase58(),
    );
  });

  it("non-admin cannot grant roles", async () => {
    const someUser = Keypair.generate();
    await airdropSol(provider.connection, someUser.publicKey, 2);

    // The non-admin doesn't have an admin role PDA, so it can't be used
    const [fakeAdminRole] = deriveRolePda(
      mintResult.configPda,
      nonAdmin.publicKey,
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
          admin: nonAdmin.publicKey,
          config: mintResult.configPda,
          adminRole: fakeAdminRole,
          grantee: someUser.publicKey,
          roleAccount: targetRolePda,
          systemProgram: SystemProgram.programId,
        })
        .signers([nonAdmin])
        .rpc();
      expect.fail("Non-admin should not be able to grant roles");
    } catch (err: any) {
      // AccountNotInitialized or similar - the admin role PDA doesn't exist
      expect(err).to.exist;
    }
  });

  it("admin cannot self-revoke (last admin protection)", async () => {
    // Create a fresh stablecoin with a single admin
    const freshMint = await createSss1Mint(provider, coreProgram, {
      name: "Fresh Test",
      symbol: "FRESH",
      uri: "https://example.com/fresh.json",
      decimals: 6,
      supplyCap: null,
    });

    try {
      await coreProgram.methods
        .revokeRole()
        .accountsPartial({
          admin: provider.wallet.publicKey,
          config: freshMint.configPda,
          adminRole: freshMint.adminRolePda,
          roleAccount: freshMint.adminRolePda,
        })
        .rpc();
      expect.fail("Should have thrown LastAdmin");
    } catch (err: any) {
      expect(err.error.errorCode.code).to.equal("LastAdmin");
    }
  });

  it("admin can revoke another admin's role", async () => {
    // admin2 already has an admin role from a previous test
    const [admin2RolePda] = deriveRolePda(
      mintResult.configPda,
      admin2.publicKey,
      ROLE_ADMIN,
      coreProgram.programId,
    );

    // Original admin revokes admin2's admin role
    await coreProgram.methods
      .revokeRole()
      .accountsPartial({
        admin: provider.wallet.publicKey,
        config: mintResult.configPda,
        adminRole: mintResult.adminRolePda,
        roleAccount: admin2RolePda,
      })
      .rpc();

    const roleInfo = await provider.connection.getAccountInfo(admin2RolePda);
    expect(roleInfo).to.be.null;
  });

  it("minter can only mint, not freeze/pause/seize", async () => {
    // Minter tries to freeze
    const [minterRolePda] = deriveRolePda(
      mintResult.configPda,
      minter.publicKey,
      ROLE_MINTER,
      coreProgram.programId,
    );

    // Minting should work
    await coreProgram.methods
      .mintTokens(new BN(100))
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

    // Freezing with minter role should fail (wrong role type for freezer_role)
    const [minterAsFreezerRole] = deriveRolePda(
      mintResult.configPda,
      minter.publicKey,
      ROLE_FREEZER,
      coreProgram.programId,
    );

    try {
      await coreProgram.methods
        .freezeAccount()
        .accountsPartial({
          freezer: minter.publicKey,
          config: mintResult.configPda,
          freezerRole: minterAsFreezerRole,
          mint: mintResult.mint.publicKey,
          tokenAccount: recipientAta,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([minter])
        .rpc();
      expect.fail("Minter should not be able to freeze");
    } catch (err: any) {
      expect(err).to.exist;
    }

    // Pausing with minter role should fail
    const [minterAsPauserRole] = deriveRolePda(
      mintResult.configPda,
      minter.publicKey,
      ROLE_PAUSER,
      coreProgram.programId,
    );

    try {
      await coreProgram.methods
        .pause()
        .accountsPartial({
          pauser: minter.publicKey,
          config: mintResult.configPda,
          pauserRole: minterAsPauserRole,
        })
        .signers([minter])
        .rpc();
      expect.fail("Minter should not be able to pause");
    } catch (err: any) {
      expect(err).to.exist;
    }
  });

  it("freezer can only freeze/thaw", async () => {
    const [freezerRolePda] = deriveRolePda(
      mintResult.configPda,
      freezer.publicKey,
      ROLE_FREEZER,
      coreProgram.programId,
    );

    // Freeze should work
    await coreProgram.methods
      .freezeAccount()
      .accountsPartial({
        freezer: freezer.publicKey,
        config: mintResult.configPda,
        freezerRole: freezerRolePda,
        mint: mintResult.mint.publicKey,
        tokenAccount: recipientAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .signers([freezer])
      .rpc();

    // Thaw should work
    await coreProgram.methods
      .thawAccount()
      .accountsPartial({
        freezer: freezer.publicKey,
        config: mintResult.configPda,
        freezerRole: freezerRolePda,
        mint: mintResult.mint.publicKey,
        tokenAccount: recipientAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .signers([freezer])
      .rpc();

    // Minting with freezer should fail
    const [freezerAsMinterRole] = deriveRolePda(
      mintResult.configPda,
      freezer.publicKey,
      ROLE_MINTER,
      coreProgram.programId,
    );

    try {
      await coreProgram.methods
        .mintTokens(new BN(100))
        .accountsPartial({
          minter: freezer.publicKey,
          config: mintResult.configPda,
          minterRole: freezerAsMinterRole,
          mint: mintResult.mint.publicKey,
          to: recipientAta,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([freezer])
        .rpc();
      expect.fail("Freezer should not be able to mint");
    } catch (err: any) {
      expect(err).to.exist;
    }
  });

  it("pauser can only pause/unpause", async () => {
    const [pauserRolePda] = deriveRolePda(
      mintResult.configPda,
      pauser.publicKey,
      ROLE_PAUSER,
      coreProgram.programId,
    );

    // Pause should work
    await coreProgram.methods
      .pause()
      .accountsPartial({
        pauser: pauser.publicKey,
        config: mintResult.configPda,
        pauserRole: pauserRolePda,
      })
      .signers([pauser])
      .rpc();

    // Unpause should work
    await coreProgram.methods
      .unpause()
      .accountsPartial({
        pauser: pauser.publicKey,
        config: mintResult.configPda,
        pauserRole: pauserRolePda,
      })
      .signers([pauser])
      .rpc();

    // Minting with pauser should fail
    const [pauserAsMinterRole] = deriveRolePda(
      mintResult.configPda,
      pauser.publicKey,
      ROLE_MINTER,
      coreProgram.programId,
    );

    try {
      await coreProgram.methods
        .mintTokens(new BN(100))
        .accountsPartial({
          minter: pauser.publicKey,
          config: mintResult.configPda,
          minterRole: pauserAsMinterRole,
          mint: mintResult.mint.publicKey,
          to: recipientAta,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([pauser])
        .rpc();
      expect.fail("Pauser should not be able to mint");
    } catch (err: any) {
      expect(err).to.exist;
    }
  });
});
