import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Keypair, SystemProgram } from "@solana/web3.js";
import { expect } from "chai";
import { SssCore } from "../target/types/sss_core";
import {
  createSss1Mint,
  deriveRolePda,
  fetchConfig,
  airdropSol,
  ROLE_ADMIN,
  ROLE_MINTER,
  CreateSss1MintResult,
} from "./helpers";

describe("Transfer Authority", () => {
  const provider = anchor.AnchorProvider.env();
  provider.opts.commitment = "confirmed";
  anchor.setProvider(provider);

  const coreProgram = anchor.workspace.SssCore as Program<SssCore>;

  let mintResult: CreateSss1MintResult;
  const newAdmin = Keypair.generate();
  const nonAdmin = Keypair.generate();

  before(async () => {
    await airdropSol(provider.connection, newAdmin.publicKey, 5);
    await airdropSol(provider.connection, nonAdmin.publicKey, 5);

    mintResult = await createSss1Mint(provider, coreProgram, {
      name: "Transfer Auth Test",
      symbol: "TAT",
      uri: "",
      decimals: 6,
      supplyCap: null,
    });
  });

  // Test 1: Happy path - admin transfers authority to newAdmin
  it("transfers authority to a new admin", async () => {
    const { configPda, adminRolePda } = mintResult;

    const [newAdminRolePda] = deriveRolePda(
      configPda,
      newAdmin.publicKey,
      ROLE_ADMIN,
      coreProgram.programId,
    );

    await coreProgram.methods
      .transferAuthority()
      .accountsPartial({
        admin: provider.publicKey,
        config: configPda,
        adminRole: adminRolePda,
        newAuthority: newAdmin.publicKey,
        newAdminRole: newAdminRolePda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    // Verify config.authority updated
    const config = await fetchConfig(coreProgram, configPda);
    expect(config.authority.toBase58()).to.equal(newAdmin.publicKey.toBase58());

    // Verify new admin role PDA exists
    const newRole = await coreProgram.account.roleAccount.fetch(newAdminRolePda);
    expect(newRole.address.toBase58()).to.equal(newAdmin.publicKey.toBase58());
    expect(newRole.role).to.deep.equal({ admin: {} });

    // Verify old admin role PDA was closed (no longer exists)
    const oldRole = await coreProgram.account.roleAccount.fetchNullable(adminRolePda);
    expect(oldRole).to.be.null;
  });

  // Test 2: New admin can perform admin actions (grant roles)
  it("new admin can grant roles", async () => {
    const { configPda } = mintResult;

    const [newAdminRolePda] = deriveRolePda(
      configPda,
      newAdmin.publicKey,
      ROLE_ADMIN,
      coreProgram.programId,
    );

    const minter = Keypair.generate();
    const [minterRolePda] = deriveRolePda(
      configPda,
      minter.publicKey,
      ROLE_MINTER,
      coreProgram.programId,
    );

    // Use newAdmin as signer
    await coreProgram.methods
      .grantRole(ROLE_MINTER)
      .accountsPartial({
        admin: newAdmin.publicKey,
        config: configPda,
        adminRole: newAdminRolePda,
        grantee: minter.publicKey,
        roleAccount: minterRolePda,
        systemProgram: SystemProgram.programId,
      })
      .signers([newAdmin])
      .rpc();

    const role = await coreProgram.account.roleAccount.fetch(minterRolePda);
    expect(role.address.toBase58()).to.equal(minter.publicKey.toBase58());
  });

  // Test 3: Old admin can no longer perform admin actions
  it("old admin cannot perform admin actions", async () => {
    const { configPda, adminRolePda } = mintResult;

    // Old admin's role PDA was closed in test 1
    // Trying to grant a role with old admin should fail
    const randomUser = Keypair.generate();
    const [randomRolePda] = deriveRolePda(
      configPda,
      randomUser.publicKey,
      ROLE_MINTER,
      coreProgram.programId,
    );

    try {
      await coreProgram.methods
        .grantRole(ROLE_MINTER)
        .accountsPartial({
          admin: provider.publicKey,
          config: configPda,
          adminRole: adminRolePda,
          grantee: randomUser.publicKey,
          roleAccount: randomRolePda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      expect.fail("Should have thrown");
    } catch (err: any) {
      // The admin role PDA was closed, so AccountNotInitialized or similar
      expect(err.toString()).to.include("AccountNotInitialized");
    }
  });

  // Test 4: Non-admin cannot transfer authority
  it("rejects transfer from non-admin", async () => {
    // Create a fresh stablecoin for this test
    const freshMint = await createSss1Mint(provider, coreProgram, {
      name: "Fresh Auth Test",
      symbol: "FAT",
      uri: "",
      decimals: 6,
      supplyCap: null,
    });

    const attacker = nonAdmin;
    const [attackerAdminRolePda] = deriveRolePda(
      freshMint.configPda,
      attacker.publicKey,
      ROLE_ADMIN,
      coreProgram.programId,
    );
    const target = Keypair.generate();
    const [targetAdminRolePda] = deriveRolePda(
      freshMint.configPda,
      target.publicKey,
      ROLE_ADMIN,
      coreProgram.programId,
    );

    try {
      await coreProgram.methods
        .transferAuthority()
        .accountsPartial({
          admin: attacker.publicKey,
          config: freshMint.configPda,
          adminRole: attackerAdminRolePda,
          newAuthority: target.publicKey,
          newAdminRole: targetAdminRolePda,
          systemProgram: SystemProgram.programId,
        })
        .signers([attacker])
        .rpc();
      expect.fail("Should have thrown");
    } catch (err: any) {
      // Attacker has no admin role PDA — seed validation fails
      expect(err.toString()).to.include("AccountNotInitialized");
    }
  });
});
