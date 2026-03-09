import * as anchor from "@coral-xyz/anchor";
import { Keypair, PublicKey } from "@solana/web3.js";
import { expect } from "chai";
import {
  coreProgram,
  admin,
  createSSS1Mint,
  airdropSol,
} from "../../helpers/setup";

describe("sss-core: transfer_admin", () => {
  let configPda: PublicKey;

  beforeEach(async () => {
    const result = await createSSS1Mint();
    configPda = result.configPda;
  });

  it("admin initiates transfer", async () => {
    const newAdmin = Keypair.generate().publicKey;
    const tx = await coreProgram.methods
      .transferAdmin(newAdmin)
      .accounts({ admin: admin.publicKey, config: configPda })
      .rpc();
    expect(tx).to.be.a("string");
  });

  it("sets pending_admin correctly", async () => {
    const newAdmin = Keypair.generate().publicKey;
    await coreProgram.methods
      .transferAdmin(newAdmin)
      .accounts({ admin: admin.publicKey, config: configPda })
      .rpc();

    const config = await coreProgram.account.stablecoinConfig.fetch(configPda);
    expect(config.pendingAdmin.toBase58()).to.equal(newAdmin.toBase58());
  });

  it("rejects non-admin", async () => {
    const random = Keypair.generate();
    await airdropSol(random.publicKey);
    try {
      await coreProgram.methods
        .transferAdmin(random.publicKey)
        .accounts({ admin: random.publicKey, config: configPda })
        .signers([random])
        .rpc();
      expect.fail("Should have failed");
    } catch (error) {
      expect(error).to.exist;
    }
  });

  it("can change pending_admin before acceptance", async () => {
    const first = Keypair.generate().publicKey;
    const second = Keypair.generate().publicKey;

    await coreProgram.methods.transferAdmin(first).accounts({ admin: admin.publicKey, config: configPda }).rpc();
    await coreProgram.methods.transferAdmin(second).accounts({ admin: admin.publicKey, config: configPda }).rpc();

    const config = await coreProgram.account.stablecoinConfig.fetch(configPda);
    expect(config.pendingAdmin.toBase58()).to.equal(second.toBase58());
  });

  it("admin retains control until accepted", async () => {
    const newAdmin = Keypair.generate().publicKey;
    await coreProgram.methods.transferAdmin(newAdmin).accounts({ admin: admin.publicKey, config: configPda }).rpc();

    // Admin can still pause
    const tx = await coreProgram.methods
      .pause()
      .accounts({ authority: admin.publicKey, config: configPda, roleAccount: null })
      .rpc();
    expect(tx).to.be.a("string");
  });

  it("transfer to self works", async () => {
    await coreProgram.methods
      .transferAdmin(admin.publicKey)
      .accounts({ admin: admin.publicKey, config: configPda })
      .rpc();

    const config = await coreProgram.account.stablecoinConfig.fetch(configPda);
    expect(config.pendingAdmin.toBase58()).to.equal(admin.publicKey.toBase58());
  });

  it("succeeds when paused (governance exempt from pause)", async () => {
    await coreProgram.methods
      .pause()
      .accounts({ authority: admin.publicKey, config: configPda, roleAccount: null })
      .rpc();

    const newAdmin = Keypair.generate().publicKey;
    await coreProgram.methods
      .transferAdmin(newAdmin)
      .accounts({ admin: admin.publicKey, config: configPda })
      .rpc();

    const config = await coreProgram.account.stablecoinConfig.fetch(configPda);
    expect(config.pendingAdmin.toBase58()).to.equal(newAdmin.toBase58());
  });

  it("rejects transfer to zero address", async () => {
    try {
      await coreProgram.methods
        .transferAdmin(PublicKey.default)
        .accounts({ admin: admin.publicKey, config: configPda })
        .rpc();
      expect.fail("Should have failed with InvalidInput");
    } catch (err: any) {
      expect(err.toString()).to.include("InvalidInput");
    }
  });

  it("admin does not change until accepted", async () => {
    const newAdmin = Keypair.generate().publicKey;
    await coreProgram.methods
      .transferAdmin(newAdmin)
      .accounts({ admin: admin.publicKey, config: configPda })
      .rpc();

    const config = await coreProgram.account.stablecoinConfig.fetch(configPda);
    expect(config.admin.toBase58()).to.equal(admin.publicKey.toBase58());
    expect(config.pendingAdmin.toBase58()).to.equal(newAdmin.toBase58());
  });
});
