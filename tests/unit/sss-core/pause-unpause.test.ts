import * as anchor from "@coral-xyz/anchor";
import { Keypair, PublicKey } from "@solana/web3.js";
import { expect } from "chai";
import {
  coreProgram,
  admin,
  createSSS1Mint,
  grantRole,
  airdropSol,
  findRolePda,
} from "../../helpers/setup";
import { ROLE } from "../../helpers/constants";

describe("sss-core: pause / unpause", () => {
  let configPda: PublicKey;

  beforeEach(async () => {
    const result = await createSSS1Mint();
    configPda = result.configPda;
  });

  it("admin can pause", async () => {
    await coreProgram.methods
      .pause()
      .accounts({ authority: admin.publicKey, config: configPda, roleAccount: null })
      .rpc();
    const config = await coreProgram.account.stablecoinConfig.fetch(configPda);
    expect(config.paused).to.equal(true);
  });

  it("admin can unpause", async () => {
    await coreProgram.methods.pause().accounts({ authority: admin.publicKey, config: configPda, roleAccount: null }).rpc();
    await coreProgram.methods.unpause().accounts({ authority: admin.publicKey, config: configPda, roleAccount: null }).rpc();
    const config = await coreProgram.account.stablecoinConfig.fetch(configPda);
    expect(config.paused).to.equal(false);
  });

  it("pauser role can pause", async () => {
    const pauser = Keypair.generate();
    await airdropSol(pauser.publicKey);
    await grantRole(configPda, pauser.publicKey, ROLE.Pauser);
    const [roleAccount] = findRolePda(configPda, pauser.publicKey, ROLE.Pauser);

    await coreProgram.methods
      .pause()
      .accounts({ authority: pauser.publicKey, config: configPda, roleAccount })
      .signers([pauser])
      .rpc();

    const config = await coreProgram.account.stablecoinConfig.fetch(configPda);
    expect(config.paused).to.equal(true);
  });

  it("pauser role can unpause", async () => {
    const pauser = Keypair.generate();
    await airdropSol(pauser.publicKey);
    await grantRole(configPda, pauser.publicKey, ROLE.Pauser);
    const [roleAccount] = findRolePda(configPda, pauser.publicKey, ROLE.Pauser);

    await coreProgram.methods.pause().accounts({ authority: admin.publicKey, config: configPda, roleAccount: null }).rpc();
    await coreProgram.methods
      .unpause()
      .accounts({ authority: pauser.publicKey, config: configPda, roleAccount })
      .signers([pauser])
      .rpc();

    const config = await coreProgram.account.stablecoinConfig.fetch(configPda);
    expect(config.paused).to.equal(false);
  });

  it("rejects pause by unauthorized", async () => {
    const random = Keypair.generate();
    await airdropSol(random.publicKey);
    try {
      await coreProgram.methods
        .pause()
        .accounts({ authority: random.publicKey, config: configPda, roleAccount: null })
        .signers([random])
        .rpc();
      expect.fail("Should have failed");
    } catch (error) {
      expect(error).to.exist;
    }
  });

  it("rejects unpause by unauthorized", async () => {
    await coreProgram.methods.pause().accounts({ authority: admin.publicKey, config: configPda, roleAccount: null }).rpc();
    const random = Keypair.generate();
    await airdropSol(random.publicKey);
    try {
      await coreProgram.methods
        .unpause()
        .accounts({ authority: random.publicKey, config: configPda, roleAccount: null })
        .signers([random])
        .rpc();
      expect.fail("Should have failed");
    } catch (error) {
      expect(error).to.exist;
    }
  });

  it("rejects pause when already paused", async () => {
    await coreProgram.methods.pause().accounts({ authority: admin.publicKey, config: configPda, roleAccount: null }).rpc();
    try {
      await coreProgram.methods.pause().accounts({ authority: admin.publicKey, config: configPda, roleAccount: null }).rpc();
      expect.fail("Should have failed");
    } catch (error) {
      expect(error).to.exist;
    }
  });

  it("rejects unpause when not paused", async () => {
    try {
      await coreProgram.methods.unpause().accounts({ authority: admin.publicKey, config: configPda, roleAccount: null }).rpc();
      expect.fail("Should have failed");
    } catch (error) {
      expect(error).to.exist;
    }
  });
});
