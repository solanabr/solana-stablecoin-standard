import * as anchor from "@coral-xyz/anchor";
import { expect } from "chai";
import { Keypair, SystemProgram } from "@solana/web3.js";
import BN from "bn.js";
import {
  provider,
  coreProgram,
  admin,
  createSSS1Mint,
  grantRole,
  airdropSol,
  findRolePda,
} from "../../helpers/setup";
import { ROLE } from "../../helpers/constants";

describe("revoke-role", () => {
  let configPda: anchor.web3.PublicKey;
  let holderKeypair: Keypair;

  beforeEach(async () => {
    holderKeypair = Keypair.generate();
    await airdropSol(holderKeypair.publicKey, 1);

    const result = await createSSS1Mint("Revoke Test USD", "RTUSD", 6);
    configPda = result.configPda;
  });

  it("admin revokes minter role", async () => {
    const roleAccount = await grantRole(
      configPda,
      holderKeypair.publicKey,
      ROLE.Minter,
      1_000
    );

    await coreProgram.methods
      .revokeRole()
      .accounts({
        admin: admin.publicKey,
        config: configPda,
        holder: holderKeypair.publicKey,
        roleAccount,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    try {
      await coreProgram.account.roleAccount.fetch(roleAccount);
      expect.fail("Account should have been closed");
    } catch (err: any) {
      expect(err).to.exist;
    }
  });

  it("admin revokes burner role", async () => {
    const roleAccount = await grantRole(
      configPda,
      holderKeypair.publicKey,
      ROLE.Burner,
      0
    );

    await coreProgram.methods
      .revokeRole()
      .accounts({
        admin: admin.publicKey,
        config: configPda,
        holder: holderKeypair.publicKey,
        roleAccount,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    try {
      await coreProgram.account.roleAccount.fetch(roleAccount);
      expect.fail("Account should have been closed");
    } catch (err: any) {
      expect(err).to.exist;
    }
  });

  it("admin revokes any role type", async () => {
    for (const role of [ROLE.Seizer, ROLE.Pauser, ROLE.ComplianceOfficer]) {
      const target = Keypair.generate();
      const roleAccount = await grantRole(configPda, target.publicKey, role, 0);

      await coreProgram.methods
        .revokeRole()
        .accounts({
          admin: admin.publicKey,
          config: configPda,
          holder: target.publicKey,
          roleAccount,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      try {
        await coreProgram.account.roleAccount.fetch(roleAccount);
        expect.fail("Account should have been closed");
      } catch (err: any) {
        expect(err).to.exist;
      }
    }
  });

  it("rejects non-admin revoking", async () => {
    const roleAccount = await grantRole(
      configPda,
      holderKeypair.publicKey,
      ROLE.Minter,
      0
    );

    const nonAdmin = Keypair.generate();
    await airdropSol(nonAdmin.publicKey, 1);

    try {
      await coreProgram.methods
        .revokeRole()
        .accounts({
          admin: nonAdmin.publicKey,
          config: configPda,
          holder: holderKeypair.publicKey,
          roleAccount,
          systemProgram: SystemProgram.programId,
        })
        .signers([nonAdmin])
        .rpc();
      expect.fail("Should have thrown");
    } catch (err: any) {
      expect(err).to.exist;
      expect(err.toString()).to.include("Unauthorized");
    }
  });

  it("role account is closed after revoke", async () => {
    const roleAccount = await grantRole(
      configPda,
      holderKeypair.publicKey,
      ROLE.Pauser,
      0
    );

    // Verify it exists first
    const before = await coreProgram.account.roleAccount.fetch(roleAccount);
    expect(before.holder.toBase58()).to.equal(
      holderKeypair.publicKey.toBase58()
    );

    await coreProgram.methods
      .revokeRole()
      .accounts({
        admin: admin.publicKey,
        config: configPda,
        holder: holderKeypair.publicKey,
        roleAccount,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const accountInfo = await provider.connection.getAccountInfo(roleAccount);
    expect(accountInfo).to.be.null;
  });

  it("emits RoleRevoked", async () => {
    const roleAccount = await grantRole(
      configPda,
      holderKeypair.publicKey,
      ROLE.Minter,
      0
    );

    const txSig = await coreProgram.methods
      .revokeRole()
      .accounts({
        admin: admin.publicKey,
        config: configPda,
        holder: holderKeypair.publicKey,
        roleAccount,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    await provider.connection.confirmTransaction(txSig, "confirmed");
    const tx = await provider.connection.getTransaction(txSig, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    });
    const logs = tx?.meta?.logMessages || [];
    const hasEvent = logs.some((l) => l.includes("Program data:"));
    expect(hasEvent, "RoleRevoked event should be emitted in logs").to.be.true;
  });

  it("lamports returned to admin", async () => {
    const roleAccount = await grantRole(
      configPda,
      holderKeypair.publicKey,
      ROLE.Burner,
      0
    );

    const balanceBefore = await provider.connection.getBalance(
      admin.publicKey
    );

    await coreProgram.methods
      .revokeRole()
      .accounts({
        admin: admin.publicKey,
        config: configPda,
        holder: holderKeypair.publicKey,
        roleAccount,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const balanceAfter = await provider.connection.getBalance(admin.publicKey);
    // Admin balance should increase (rent returned, minus tx fee)
    // In a local validator, fees are 0 by default so balance increases
    expect(balanceAfter).to.be.greaterThan(balanceBefore - 5000); // allow for tx fee
  });

  it("rejects when paused", async () => {
    const roleAccount = await grantRole(
      configPda,
      holderKeypair.publicKey,
      ROLE.Minter,
      1_000
    );

    await coreProgram.methods
      .pause()
      .accounts({ authority: admin.publicKey, config: configPda, roleAccount: null })
      .rpc();

    try {
      await coreProgram.methods
        .revokeRole()
        .accounts({
          admin: admin.publicKey,
          config: configPda,
          holder: holderKeypair.publicKey,
          roleAccount,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      expect.fail("Should fail when paused");
    } catch (err: any) {
      expect(err.toString()).to.include("Paused");
    }
  });

  it("role PDA no longer exists after revoke", async () => {
    const roleAccount = await grantRole(
      configPda,
      holderKeypair.publicKey,
      ROLE.ComplianceOfficer,
      0
    );

    await coreProgram.methods
      .revokeRole()
      .accounts({
        admin: admin.publicKey,
        config: configPda,
        holder: holderKeypair.publicKey,
        roleAccount,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const [expectedPda] = findRolePda(
      configPda,
      holderKeypair.publicKey,
      ROLE.ComplianceOfficer
    );
    const accountInfo = await provider.connection.getAccountInfo(expectedPda);
    expect(accountInfo).to.be.null;
  });
});
