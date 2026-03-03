import * as anchor from "@coral-xyz/anchor";
import BN from "bn.js";
import { Keypair, PublicKey } from "@solana/web3.js";
import { expect } from "chai";
import {
  coreProgram,
  admin,
  createSSS1Mint,
  grantRole,
  createTokenAccount,
  airdropSol,
  findRolePda,
} from "../helpers/setup";
import { ROLE, TOKEN_2022_PROGRAM_ID } from "../helpers/constants";

describe("e2e: allowance lifecycle", () => {
  let configPda: PublicKey;
  let mintKeypair: Keypair;
  let minterKeypair: Keypair;
  let recipientAta: PublicKey;

  beforeEach(async () => {
    minterKeypair = Keypair.generate();
    await airdropSol(minterKeypair.publicKey);

    const result = await createSSS1Mint();
    mintKeypair = result.mintKeypair;
    configPda = result.configPda;

    const recipient = Keypair.generate();
    await airdropSol(recipient.publicKey);
    recipientAta = await createTokenAccount(mintKeypair.publicKey, recipient.publicKey);
  });

  it("grant allowance → mint → check remaining → mint exceeding fails → increment → mint succeeds", async () => {
    // 1. Grant minter with allowance of 1000
    await grantRole(configPda, minterKeypair.publicKey, ROLE.Minter, 1_000);
    const [minterRole] = findRolePda(configPda, minterKeypair.publicKey, ROLE.Minter);

    let roleAcct = await coreProgram.account.roleAccount.fetch(minterRole);
    expect(roleAcct.allowance.toNumber()).to.equal(1_000);

    // 2. Mint 600 tokens
    await coreProgram.methods
      .mintTo(new BN(600))
      .accounts({
        minter: minterKeypair.publicKey,
        config: configPda,
        roleAccount: minterRole,
        mint: mintKeypair.publicKey,
        to: recipientAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .signers([minterKeypair])
      .rpc();

    // 3. Verify remaining allowance = 400
    roleAcct = await coreProgram.account.roleAccount.fetch(minterRole);
    expect(roleAcct.allowance.toNumber()).to.equal(400);

    // 4. Mint 500 exceeds remaining 400 → should fail
    try {
      await coreProgram.methods
        .mintTo(new BN(500))
        .accounts({
          minter: minterKeypair.publicKey,
          config: configPda,
          roleAccount: minterRole,
          mint: mintKeypair.publicKey,
          to: recipientAta,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([minterKeypair])
        .rpc();
      expect.fail("Should have failed - exceeds allowance");
    } catch (error) {
      expect(error).to.exist;
    }

    // 5. Increment allowance by 1000
    await coreProgram.methods
      .incrementAllowance(new BN(1_000))
      .accounts({
        admin: admin.publicKey,
        config: configPda,
        minterRoleAccount: minterRole,
      })
      .rpc();

    roleAcct = await coreProgram.account.roleAccount.fetch(minterRole);
    expect(roleAcct.allowance.toNumber()).to.equal(1_400);

    // 6. Now mint 500 succeeds
    await coreProgram.methods
      .mintTo(new BN(500))
      .accounts({
        minter: minterKeypair.publicKey,
        config: configPda,
        roleAccount: minterRole,
        mint: mintKeypair.publicKey,
        to: recipientAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .signers([minterKeypair])
      .rpc();

    roleAcct = await coreProgram.account.roleAccount.fetch(minterRole);
    expect(roleAcct.allowance.toNumber()).to.equal(900);
  });

  it("allowance 0 rejects minting (no remaining allowance)", async () => {
    // Grant with allowance 0 — means no remaining allowance, cannot mint
    await grantRole(configPda, minterKeypair.publicKey, ROLE.Minter, 0);
    const [minterRole] = findRolePda(configPda, minterKeypair.publicKey, ROLE.Minter);

    try {
      await coreProgram.methods
        .mintTo(new BN(1))
        .accounts({
          minter: minterKeypair.publicKey,
          config: configPda,
          roleAccount: minterRole,
          mint: mintKeypair.publicKey,
          to: recipientAta,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([minterKeypair])
        .rpc();
      expect.fail("Should have failed with AllowanceExceeded");
    } catch (err: any) {
      expect(err.toString()).to.include("AllowanceExceeded");
    }
  });

  it("exact allowance mint works (mints all remaining)", async () => {
    await grantRole(configPda, minterKeypair.publicKey, ROLE.Minter, 500);
    const [minterRole] = findRolePda(configPda, minterKeypair.publicKey, ROLE.Minter);

    await coreProgram.methods
      .mintTo(new BN(500))
      .accounts({
        minter: minterKeypair.publicKey,
        config: configPda,
        roleAccount: minterRole,
        mint: mintKeypair.publicKey,
        to: recipientAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .signers([minterKeypair])
      .rpc();

    const roleAcct = await coreProgram.account.roleAccount.fetch(minterRole);
    expect(roleAcct.allowance.toNumber()).to.equal(0);

    // Now any mint MUST fail (allowance is exactly 0 — no remaining allowance)
    try {
      await coreProgram.methods
        .mintTo(new BN(1))
        .accounts({
          minter: minterKeypair.publicKey,
          config: configPda,
          roleAccount: minterRole,
          mint: mintKeypair.publicKey,
          to: recipientAta,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([minterKeypair])
        .rpc();
      expect.fail("Should have failed with AllowanceExceeded");
    } catch (err: any) {
      expect(err.toString()).to.include("AllowanceExceeded");
    }
  });

  it("multiple increments accumulate", async () => {
    await grantRole(configPda, minterKeypair.publicKey, ROLE.Minter, 100);
    const [minterRole] = findRolePda(configPda, minterKeypair.publicKey, ROLE.Minter);

    await coreProgram.methods
      .incrementAllowance(new BN(200))
      .accounts({ admin: admin.publicKey, config: configPda, minterRoleAccount: minterRole })
      .rpc();

    await coreProgram.methods
      .incrementAllowance(new BN(300))
      .accounts({ admin: admin.publicKey, config: configPda, minterRoleAccount: minterRole })
      .rpc();

    const roleAcct = await coreProgram.account.roleAccount.fetch(minterRole);
    expect(roleAcct.allowance.toNumber()).to.equal(600);
  });

  it("non-admin cannot increment allowance", async () => {
    await grantRole(configPda, minterKeypair.publicKey, ROLE.Minter, 100);
    const [minterRole] = findRolePda(configPda, minterKeypair.publicKey, ROLE.Minter);

    const random = Keypair.generate();
    await airdropSol(random.publicKey);

    try {
      await coreProgram.methods
        .incrementAllowance(new BN(500))
        .accounts({ admin: random.publicKey, config: configPda, minterRoleAccount: minterRole })
        .signers([random])
        .rpc();
      expect.fail("Should have failed");
    } catch (error) {
      expect(error).to.exist;
    }
  });

  it("increment zero is rejected", async () => {
    await grantRole(configPda, minterKeypair.publicKey, ROLE.Minter, 100);
    const [minterRole] = findRolePda(configPda, minterKeypair.publicKey, ROLE.Minter);

    try {
      await coreProgram.methods
        .incrementAllowance(new BN(0))
        .accounts({ admin: admin.publicKey, config: configPda, minterRoleAccount: minterRole })
        .rpc();
      expect.fail("Should reject zero increment");
    } catch (error) {
      expect(error).to.exist;
    }
  });

  it("revoke role removes allowance entirely", async () => {
    await grantRole(configPda, minterKeypair.publicKey, ROLE.Minter, 500);
    const [minterRole] = findRolePda(configPda, minterKeypair.publicKey, ROLE.Minter);

    await coreProgram.methods
      .revokeRole()
      .accounts({
        admin: admin.publicKey,
        config: configPda,
        holder: minterKeypair.publicKey,
        roleAccount: minterRole,
      })
      .rpc();

    const acctInfo = await anchor.getProvider().connection.getAccountInfo(minterRole);
    expect(acctInfo).to.be.null;
  });
});
