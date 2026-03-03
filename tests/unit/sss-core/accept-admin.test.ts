import * as anchor from "@coral-xyz/anchor";
import { Keypair, PublicKey } from "@solana/web3.js";
import { expect } from "chai";
import {
  coreProgram,
  admin,
  createSSS1Mint,
  airdropSol,
} from "../../helpers/setup";

describe("sss-core: accept_admin", () => {
  let configPda: PublicKey;
  let newAdminKeypair: Keypair;

  beforeEach(async () => {
    const result = await createSSS1Mint();
    configPda = result.configPda;
    newAdminKeypair = Keypair.generate();
    await airdropSol(newAdminKeypair.publicKey);

    await coreProgram.methods
      .transferAdmin(newAdminKeypair.publicKey)
      .accounts({ admin: admin.publicKey, config: configPda })
      .rpc();
  });

  it("pending admin accepts transfer", async () => {
    const tx = await coreProgram.methods
      .acceptAdmin()
      .accounts({ pendingAdmin: newAdminKeypair.publicKey, config: configPda })
      .signers([newAdminKeypair])
      .rpc();
    expect(tx).to.be.a("string");
  });

  it("admin changes to new admin", async () => {
    await coreProgram.methods
      .acceptAdmin()
      .accounts({ pendingAdmin: newAdminKeypair.publicKey, config: configPda })
      .signers([newAdminKeypair])
      .rpc();

    const config = await coreProgram.account.stablecoinConfig.fetch(configPda);
    expect(config.admin.toBase58()).to.equal(newAdminKeypair.publicKey.toBase58());
  });

  it("pending_admin resets to default", async () => {
    await coreProgram.methods
      .acceptAdmin()
      .accounts({ pendingAdmin: newAdminKeypair.publicKey, config: configPda })
      .signers([newAdminKeypair])
      .rpc();

    const config = await coreProgram.account.stablecoinConfig.fetch(configPda);
    expect(config.pendingAdmin.toBase58()).to.equal(PublicKey.default.toBase58());
  });

  it("rejects non-pending-admin", async () => {
    const random = Keypair.generate();
    await airdropSol(random.publicKey);
    try {
      await coreProgram.methods
        .acceptAdmin()
        .accounts({ pendingAdmin: random.publicKey, config: configPda })
        .signers([random])
        .rpc();
      expect.fail("Should have failed");
    } catch (error) {
      expect(error).to.exist;
    }
  });

  it("rejects when no pending admin", async () => {
    // Accept first
    await coreProgram.methods
      .acceptAdmin()
      .accounts({ pendingAdmin: newAdminKeypair.publicKey, config: configPda })
      .signers([newAdminKeypair])
      .rpc();

    // Try accept again with no pending
    const random = Keypair.generate();
    await airdropSol(random.publicKey);
    try {
      await coreProgram.methods
        .acceptAdmin()
        .accounts({ pendingAdmin: random.publicKey, config: configPda })
        .signers([random])
        .rpc();
      expect.fail("Should have failed");
    } catch (error) {
      expect(error).to.exist;
    }
  });

  it("old admin loses privileges after acceptance", async () => {
    await coreProgram.methods
      .acceptAdmin()
      .accounts({ pendingAdmin: newAdminKeypair.publicKey, config: configPda })
      .signers([newAdminKeypair])
      .rpc();

    try {
      await coreProgram.methods
        .pause()
        .accounts({ authority: admin.publicKey, config: configPda, roleAccount: null })
        .rpc();
      expect.fail("Should have failed");
    } catch (error) {
      expect(error).to.exist;
    }
  });

  it("new admin can perform admin actions", async () => {
    await coreProgram.methods
      .acceptAdmin()
      .accounts({ pendingAdmin: newAdminKeypair.publicKey, config: configPda })
      .signers([newAdminKeypair])
      .rpc();

    const tx = await coreProgram.methods
      .pause()
      .accounts({ authority: newAdminKeypair.publicKey, config: configPda, roleAccount: null })
      .signers([newAdminKeypair])
      .rpc();
    expect(tx).to.be.a("string");
  });
});
