import * as anchor from "@coral-xyz/anchor";
import { expect } from "chai";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
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

describe("grant-role", () => {
  let configPda: anchor.web3.PublicKey;
  let holderKeypair: Keypair;

  beforeEach(async () => {
    holderKeypair = Keypair.generate();
    await airdropSol(holderKeypair.publicKey, 1);

    const result = await createSSS1Mint("Grant Test USD", "GTUSD", 6);
    configPda = result.configPda;
  });

  it("admin grants minter role with allowance", async () => {
    const roleAccount = await grantRole(
      configPda,
      holderKeypair.publicKey,
      ROLE.Minter,
      1_000_000
    );

    const roleState = await coreProgram.account.roleAccount.fetch(roleAccount);
    expect(roleState.holder.toBase58()).to.equal(
      holderKeypair.publicKey.toBase58()
    );
    expect(roleState.allowance.toNumber()).to.equal(1_000_000);
  });

  it("admin grants burner role", async () => {
    const roleAccount = await grantRole(
      configPda,
      holderKeypair.publicKey,
      ROLE.Burner,
      0
    );

    const roleState = await coreProgram.account.roleAccount.fetch(roleAccount);
    expect(roleState.role).to.deep.equal({ burner: {} });
    expect(roleState.holder.toBase58()).to.equal(
      holderKeypair.publicKey.toBase58()
    );
  });

  it("admin grants seizer role", async () => {
    const roleAccount = await grantRole(
      configPda,
      holderKeypair.publicKey,
      ROLE.Seizer,
      0
    );

    const roleState = await coreProgram.account.roleAccount.fetch(roleAccount);
    expect(roleState.role).to.deep.equal({ seizer: {} });
  });

  it("admin grants pauser role", async () => {
    const roleAccount = await grantRole(
      configPda,
      holderKeypair.publicKey,
      ROLE.Pauser,
      0
    );

    const roleState = await coreProgram.account.roleAccount.fetch(roleAccount);
    expect(roleState.role).to.deep.equal({ pauser: {} });
  });

  it("admin grants compliance officer role", async () => {
    const roleAccount = await grantRole(
      configPda,
      holderKeypair.publicKey,
      ROLE.ComplianceOfficer,
      0
    );

    const roleState = await coreProgram.account.roleAccount.fetch(roleAccount);
    expect(roleState.role).to.deep.equal({ complianceOfficer: {} });
  });

  it("rejects non-admin granting role", async () => {
    const nonAdmin = Keypair.generate();
    await airdropSol(nonAdmin.publicKey, 2);
    const target = Keypair.generate();
    const [roleAccount] = findRolePda(configPda, target.publicKey, ROLE.Minter);

    try {
      await coreProgram.methods
        .grantRole({ minter: {} }, new BN(100))
        .accounts({
          admin: nonAdmin.publicKey,
          config: configPda,
          holder: target.publicKey,
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

  it("rejects duplicate role grant", async () => {
    await grantRole(configPda, holderKeypair.publicKey, ROLE.Minter, 500);
    const [roleAccount] = findRolePda(
      configPda,
      holderKeypair.publicKey,
      ROLE.Minter
    );

    try {
      await coreProgram.methods
        .grantRole({ minter: {} }, new BN(500))
        .accounts({
          admin: admin.publicKey,
          config: configPda,
          holder: holderKeypair.publicKey,
          roleAccount,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      expect.fail("Should have thrown");
    } catch (err: any) {
      expect(err).to.exist;
    }
  });

  it("sets correct allowance on minter role", async () => {
    const allowance = 9_999_999;
    const roleAccount = await grantRole(
      configPda,
      holderKeypair.publicKey,
      ROLE.Minter,
      allowance
    );

    const roleState = await coreProgram.account.roleAccount.fetch(roleAccount);
    expect(roleState.allowance.toNumber()).to.equal(allowance);
  });

  it("sets allowance to 0 for non-minter roles", async () => {
    const roleAccount = await grantRole(
      configPda,
      holderKeypair.publicKey,
      ROLE.Burner,
      0
    );

    const roleState = await coreProgram.account.roleAccount.fetch(roleAccount);
    expect(roleState.allowance.toNumber()).to.equal(0);
  });

  it("rejects when paused", async () => {
    await coreProgram.methods
      .pause()
      .accounts({ authority: admin.publicKey, config: configPda, roleAccount: null })
      .rpc();

    const target = Keypair.generate();
    const [roleAccount] = findRolePda(configPda, target.publicKey, ROLE.Minter);

    try {
      await coreProgram.methods
        .grantRole({ minter: {} }, new BN(100))
        .accounts({
          admin: admin.publicKey,
          config: configPda,
          holder: target.publicKey,
          roleAccount,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      expect.fail("Should fail when paused");
    } catch (err: any) {
      expect(err.toString()).to.include("Paused");
    }
  });

  it("rejects Pubkey::default() as holder", async () => {
    const zeroKey = PublicKey.default;
    const [roleAccount] = findRolePda(configPda, zeroKey, ROLE.Minter);

    try {
      await coreProgram.methods
        .grantRole({ minter: {} }, new BN(100))
        .accounts({
          admin: admin.publicKey,
          config: configPda,
          holder: zeroKey,
          roleAccount,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      expect.fail("Should fail with InvalidInput");
    } catch (err: any) {
      expect(err.toString()).to.include("InvalidInput");
    }
  });

  it("emits RoleGranted with allowance", async () => {
    const [roleAccount] = findRolePda(configPda, holderKeypair.publicKey, ROLE.Minter);

    const txSig = await coreProgram.methods
      .grantRole({ minter: {} }, new BN(777_000))
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
    expect(hasEvent, "RoleGranted event should be emitted in logs").to.be.true;
  });
});
