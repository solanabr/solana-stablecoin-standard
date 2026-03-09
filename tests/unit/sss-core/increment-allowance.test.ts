import * as anchor from "@coral-xyz/anchor";
import BN from "bn.js";
import { Keypair, PublicKey } from "@solana/web3.js";
import { expect } from "chai";
import {
  provider,
  coreProgram,
  admin,
  createSSS1Mint,
  grantRole,
  createTokenAccount,
  airdropSol,
  findRolePda,
} from "../../helpers/setup";
import { ROLE, TOKEN_2022_PROGRAM_ID } from "../../helpers/constants";

describe("sss-core: increment_allowance", () => {
  let configPda: PublicKey;
  let mintKeypair: Keypair;
  let minterKeypair: Keypair;
  let minterRoleAccount: PublicKey;

  beforeEach(async () => {
    minterKeypair = Keypair.generate();
    await airdropSol(minterKeypair.publicKey);
    const result = await createSSS1Mint();
    mintKeypair = result.mintKeypair;
    configPda = result.configPda;
    await grantRole(configPda, minterKeypair.publicKey, ROLE.Minter, 1_000);
    [minterRoleAccount] = findRolePda(configPda, minterKeypair.publicKey, ROLE.Minter);
  });

  it("admin increments minter allowance", async () => {
    await coreProgram.methods
      .incrementAllowance(new BN(500))
      .accounts({
        admin: admin.publicKey,
        config: configPda,
        minterRoleAccount,
      })
      .rpc();

    const role = await coreProgram.account.roleAccount.fetch(minterRoleAccount);
    expect(role.allowance.toNumber()).to.equal(1_500);
  });

  it("rejects non-admin", async () => {
    const random = Keypair.generate();
    await airdropSol(random.publicKey);
    try {
      await coreProgram.methods
        .incrementAllowance(new BN(500))
        .accounts({ admin: random.publicKey, config: configPda, minterRoleAccount })
        .signers([random])
        .rpc();
      expect.fail("Should have failed");
    } catch (error) {
      expect(error).to.exist;
    }
  });

  it("rejects zero amount", async () => {
    try {
      await coreProgram.methods
        .incrementAllowance(new BN(0))
        .accounts({ admin: admin.publicKey, config: configPda, minterRoleAccount })
        .rpc();
      expect.fail("Should have failed");
    } catch (error) {
      expect(error).to.exist;
    }
  });

  it("new allowance is previous + increment", async () => {
    await coreProgram.methods
      .incrementAllowance(new BN(200))
      .accounts({ admin: admin.publicKey, config: configPda, minterRoleAccount })
      .rpc();

    await coreProgram.methods
      .incrementAllowance(new BN(300))
      .accounts({ admin: admin.publicKey, config: configPda, minterRoleAccount })
      .rpc();

    const role = await coreProgram.account.roleAccount.fetch(minterRoleAccount);
    expect(role.allowance.toNumber()).to.equal(1_500);
  });

  it("rejects for non-minter role account", async () => {
    const burner = Keypair.generate();
    await airdropSol(burner.publicKey);
    await grantRole(configPda, burner.publicKey, ROLE.Burner);
    const [burnerRole] = findRolePda(configPda, burner.publicKey, ROLE.Burner);

    try {
      await coreProgram.methods
        .incrementAllowance(new BN(100))
        .accounts({ admin: admin.publicKey, config: configPda, minterRoleAccount: burnerRole })
        .rpc();
      expect.fail("Should have failed");
    } catch (error) {
      expect(error).to.exist;
    }
  });

  it("multiple increments accumulate", async () => {
    for (let i = 0; i < 5; i++) {
      await coreProgram.methods
        .incrementAllowance(new BN(100))
        .accounts({ admin: admin.publicKey, config: configPda, minterRoleAccount })
        .rpc();
    }
    const role = await coreProgram.account.roleAccount.fetch(minterRoleAccount);
    expect(role.allowance.toNumber()).to.equal(1_500);
  });

  it("increment by 1 works (minimum non-zero)", async () => {
    const before = await coreProgram.account.roleAccount.fetch(minterRoleAccount);
    const beforeVal = before.allowance.toNumber();

    await coreProgram.methods
      .incrementAllowance(new BN(1))
      .accounts({ admin: admin.publicKey, config: configPda, minterRoleAccount })
      .rpc();

    const after = await coreProgram.account.roleAccount.fetch(minterRoleAccount);
    expect(after.allowance.toNumber()).to.equal(beforeVal + 1);
  });

  it("increment large amount", async () => {
    await coreProgram.methods
      .incrementAllowance(new BN(999_999_999))
      .accounts({ admin: admin.publicKey, config: configPda, minterRoleAccount })
      .rpc();

    const role = await coreProgram.account.roleAccount.fetch(minterRoleAccount);
    expect(role.allowance.toNumber()).to.equal(1_000 + 999_999_999);
  });

  it("succeeds when paused (governance exempt from pause)", async () => {
    await coreProgram.methods
      .pause()
      .accounts({ authority: admin.publicKey, config: configPda, roleAccount: null })
      .rpc();

    await coreProgram.methods
      .incrementAllowance(new BN(100))
      .accounts({ admin: admin.publicKey, config: configPda, minterRoleAccount })
      .rpc();

    const role = await coreProgram.account.roleAccount.fetch(minterRoleAccount);
    expect(role.allowance.toNumber()).to.equal(1_100);
  });

  it("increment after partial mint works", async () => {
    const recipient = Keypair.generate();
    await airdropSol(recipient.publicKey);

    const recipientAta = await createTokenAccount(mintKeypair.publicKey, recipient.publicKey);

    // Mint 500 of 1000 allowance
    await coreProgram.methods
      .mintTo(new BN(500))
      .accounts({
        minter: minterKeypair.publicKey, config: configPda, roleAccount: minterRoleAccount,
        mint: mintKeypair.publicKey, to: recipientAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .signers([minterKeypair])
      .rpc();

    let role = await coreProgram.account.roleAccount.fetch(minterRoleAccount);
    expect(role.allowance.toNumber()).to.equal(500);

    // Increment by 1000
    await coreProgram.methods
      .incrementAllowance(new BN(1000))
      .accounts({ admin: admin.publicKey, config: configPda, minterRoleAccount })
      .rpc();

    role = await coreProgram.account.roleAccount.fetch(minterRoleAccount);
    expect(role.allowance.toNumber()).to.equal(1_500);
  });
});
