import * as anchor from "@coral-xyz/anchor";
import { Keypair, PublicKey } from "@solana/web3.js";
import { expect } from "chai";
import {
  coreProgram,
  admin,
  createSSS1Mint,
  airdropSol,
  findRolePda,
} from "../helpers/setup";

describe("e2e: admin transfer lifecycle", () => {
  let configPda: PublicKey;

  beforeEach(async () => {
    const result = await createSSS1Mint();
    configPda = result.configPda;
  });

  it("full two-step admin transfer: initiate → accept → old loses access", async () => {
    const newAdmin = Keypair.generate();
    await airdropSol(newAdmin.publicKey);

    // 1. Current admin initiates transfer
    await coreProgram.methods
      .transferAdmin(newAdmin.publicKey)
      .accounts({ admin: admin.publicKey, config: configPda })
      .rpc();

    let config = await coreProgram.account.stablecoinConfig.fetch(configPda);
    expect(config.pendingAdmin.toBase58()).to.equal(newAdmin.publicKey.toBase58());
    expect(config.admin.toBase58()).to.equal(admin.publicKey.toBase58());

    // 2. New admin accepts
    await coreProgram.methods
      .acceptAdmin()
      .accounts({ pendingAdmin: newAdmin.publicKey, config: configPda })
      .signers([newAdmin])
      .rpc();

    config = await coreProgram.account.stablecoinConfig.fetch(configPda);
    expect(config.admin.toBase58()).to.equal(newAdmin.publicKey.toBase58());
    expect(config.pendingAdmin.toBase58()).to.equal(PublicKey.default.toBase58());

    // 3. Old admin cannot perform admin actions
    try {
      await coreProgram.methods
        .pause()
        .accounts({ authority: admin.publicKey, config: configPda, roleAccount: null })
        .rpc();
      expect.fail("Old admin should not be able to pause");
    } catch (error) {
      expect(error).to.exist;
    }

    // 4. New admin can perform admin actions
    const tx = await coreProgram.methods
      .pause()
      .accounts({ authority: newAdmin.publicKey, config: configPda, roleAccount: null })
      .signers([newAdmin])
      .rpc();
    expect(tx).to.be.a("string");
  });

  it("admin can change pending admin before acceptance", async () => {
    const first = Keypair.generate();
    const second = Keypair.generate();
    await airdropSol(first.publicKey);
    await airdropSol(second.publicKey);

    await coreProgram.methods
      .transferAdmin(first.publicKey)
      .accounts({ admin: admin.publicKey, config: configPda })
      .rpc();

    await coreProgram.methods
      .transferAdmin(second.publicKey)
      .accounts({ admin: admin.publicKey, config: configPda })
      .rpc();

    const config = await coreProgram.account.stablecoinConfig.fetch(configPda);
    expect(config.pendingAdmin.toBase58()).to.equal(second.publicKey.toBase58());

    // First admin candidate cannot accept
    try {
      await coreProgram.methods
        .acceptAdmin()
        .accounts({ pendingAdmin: first.publicKey, config: configPda })
        .signers([first])
        .rpc();
      expect.fail("First pending admin should not be able to accept");
    } catch (error) {
      expect(error).to.exist;
    }

    // Second admin candidate can accept
    await coreProgram.methods
      .acceptAdmin()
      .accounts({ pendingAdmin: second.publicKey, config: configPda })
      .signers([second])
      .rpc();

    const updatedConfig = await coreProgram.account.stablecoinConfig.fetch(configPda);
    expect(updatedConfig.admin.toBase58()).to.equal(second.publicKey.toBase58());
  });

  it("transfer back to original admin works", async () => {
    const newAdmin = Keypair.generate();
    await airdropSol(newAdmin.publicKey);

    // Transfer to new admin
    await coreProgram.methods
      .transferAdmin(newAdmin.publicKey)
      .accounts({ admin: admin.publicKey, config: configPda })
      .rpc();
    await coreProgram.methods
      .acceptAdmin()
      .accounts({ pendingAdmin: newAdmin.publicKey, config: configPda })
      .signers([newAdmin])
      .rpc();

    // Transfer back to original
    await coreProgram.methods
      .transferAdmin(admin.publicKey)
      .accounts({ admin: newAdmin.publicKey, config: configPda })
      .signers([newAdmin])
      .rpc();
    await coreProgram.methods
      .acceptAdmin()
      .accounts({ pendingAdmin: admin.publicKey, config: configPda })
      .rpc();

    const config = await coreProgram.account.stablecoinConfig.fetch(configPda);
    expect(config.admin.toBase58()).to.equal(admin.publicKey.toBase58());
  });

  it("pending admin cannot perform admin actions before acceptance", async () => {
    const newAdmin = Keypair.generate();
    await airdropSol(newAdmin.publicKey);

    await coreProgram.methods
      .transferAdmin(newAdmin.publicKey)
      .accounts({ admin: admin.publicKey, config: configPda })
      .rpc();

    try {
      await coreProgram.methods
        .pause()
        .accounts({ authority: newAdmin.publicKey, config: configPda, roleAccount: null })
        .signers([newAdmin])
        .rpc();
      expect.fail("Pending admin should not have privileges yet");
    } catch (error) {
      expect(error).to.exist;
    }
  });

  it("transfer to self works (admin accepts own transfer)", async () => {
    await coreProgram.methods
      .transferAdmin(admin.publicKey)
      .accounts({ admin: admin.publicKey, config: configPda })
      .rpc();

    await coreProgram.methods
      .acceptAdmin()
      .accounts({ pendingAdmin: admin.publicKey, config: configPda })
      .rpc();

    const config = await coreProgram.account.stablecoinConfig.fetch(configPda);
    expect(config.admin.toBase58()).to.equal(admin.publicKey.toBase58());
  });

  it("new admin can grant roles after transfer", async () => {
    const newAdmin = Keypair.generate();
    await airdropSol(newAdmin.publicKey);

    await coreProgram.methods
      .transferAdmin(newAdmin.publicKey)
      .accounts({ admin: admin.publicKey, config: configPda })
      .rpc();
    await coreProgram.methods
      .acceptAdmin()
      .accounts({ pendingAdmin: newAdmin.publicKey, config: configPda })
      .signers([newAdmin])
      .rpc();

    // New admin grants a role
    const minter = Keypair.generate();
    const [roleAccount] = findRolePda(configPda, minter.publicKey, 0);

    const tx = await coreProgram.methods
      .grantRole({ minter: {} }, new anchor.BN(1000))
      .accounts({
        admin: newAdmin.publicKey,
        config: configPda,
        holder: minter.publicKey,
        roleAccount,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([newAdmin])
      .rpc();
    expect(tx).to.be.a("string");
  });

  it("multiple sequential admin transfers work", async () => {
    const admin1 = Keypair.generate();
    const admin2 = Keypair.generate();
    await airdropSol(admin1.publicKey);
    await airdropSol(admin2.publicKey);

    // admin → admin1
    await coreProgram.methods.transferAdmin(admin1.publicKey).accounts({ admin: admin.publicKey, config: configPda }).rpc();
    await coreProgram.methods.acceptAdmin().accounts({ pendingAdmin: admin1.publicKey, config: configPda }).signers([admin1]).rpc();

    // admin1 → admin2
    await coreProgram.methods.transferAdmin(admin2.publicKey).accounts({ admin: admin1.publicKey, config: configPda }).signers([admin1]).rpc();
    await coreProgram.methods.acceptAdmin().accounts({ pendingAdmin: admin2.publicKey, config: configPda }).signers([admin2]).rpc();

    const config = await coreProgram.account.stablecoinConfig.fetch(configPda);
    expect(config.admin.toBase58()).to.equal(admin2.publicKey.toBase58());
  });
});
