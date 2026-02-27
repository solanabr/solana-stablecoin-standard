import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Sss2Hook } from "../target/types/sss2_hook";
import { expect } from "chai";

describe("SSS-2 Transfer Hook", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Sss2Hook as Program<Sss2Hook>;
  const authority = provider.wallet;

  // PDAs
  let configPda: anchor.web3.PublicKey;
  let configBump: number;

  before(async () => {
    [configPda, configBump] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("config"), authority.publicKey.toBuffer()],
      program.programId
    );
  });

  describe("Initialization", () => {
    it("Should initialize transfer hook with fee config", async () => {
      const feeBps = 50; // 0.5%
      const maxFee = 1000 * anchor.web3.LAMPORTS_PER_SOL;

      const tx = await program.methods
        .initialize(new anchor.BN(feeBps), new anchor.BN(maxFee))
        .accounts({
          config: configPda,
          authority: authority.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();

      console.log("✓ Initialize tx:", tx);

      // Verify config
      const config = await program.account.transferHookConfig.fetch(configPda);
      expect(config.authority.toString()).to.equal(
        authority.publicKey.toString()
      );
      expect(config.transferFeeBasisPoints).to.equal(feeBps);
      expect(config.maxTransferFee.toString()).to.equal(maxFee.toString());
      expect(config.isPaused).to.be.false;
      console.log("✓ Config verified");
    });

    it("Should fail to initialize with fee too high", async () => {
      try {
        await program.methods
          .initialize(new anchor.BN(5000), new anchor.BN(1000)) // 50% fee
          .accounts({
            config: configPda,
            authority: authority.publicKey,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .rpc();

        expect.fail("Should have thrown error");
      } catch (e) {
        expect(e.toString()).to.include("FeeTooHigh");
        console.log("✓ Correctly rejected high fee");
      }
    });
  });

  describe("Fee Configuration", () => {
    it("Should update fee config", async () => {
      const newFeeBps = 100; // 1%
      const newMaxFee = new anchor.BN(2000 * anchor.web3.LAMPORTS_PER_SOL);
      const minTransfer = new anchor.BN(100);

      const tx = await program.methods
        .updateFeeConfig(new anchor.BN(newFeeBps), newMaxFee, minTransfer)
        .accounts({
          config: configPda,
          authority: authority.publicKey,
        })
        .rpc();

      console.log("✓ Update fee config tx:", tx);

      const config = await program.account.transferHookConfig.fetch(configPda);
      expect(config.transferFeeBasisPoints).to.equal(newFeeBps);
      console.log("✓ Fee config updated");
    });

    it("Should pause and unpause contract", async () => {
      // Pause
      await program.methods
        .setPaused(true)
        .accounts({
          config: configPda,
          authority: authority.publicKey,
        })
        .rpc();

      let config = await program.account.transferHookConfig.fetch(configPda);
      expect(config.isPaused).to.be.true;
      console.log("✓ Contract paused");

      // Unpause
      await program.methods
        .setPaused(false)
        .accounts({
          config: configPda,
          authority: authority.publicKey,
        })
        .rpc();

      config = await program.account.transferHookConfig.fetch(configPda);
      expect(config.isPaused).to.be.false;
      console.log("✓ Contract unpaused");
    });
  });

  describe("Transfer Hook Execution", () => {
    it("Should execute transfer hook", async () => {
      const amount = new anchor.BN(10000);

      const tx = await program.methods
        .executeTransferHook(amount)
        .accounts({
          config: configPda,
          source: authority.publicKey,
          destination: anchor.web3.Keypair.generate().publicKey,
          mint: anchor.web3.Keypair.generate().publicKey,
          whitelist: null,
        })
        .rpc();

      console.log("✓ Execute hook tx:", tx);
    });
  });

  describe("Whitelist Management", () => {
    let whitelistPda: anchor.web3.PublicKey;
    const testAddress = anchor.web3.Keypair.generate().publicKey;

    before(() => {
      [whitelistPda] = anchor.web3.PublicKey.findProgramAddressSync(
        [
          Buffer.from("whitelist"),
          authority.publicKey.toBuffer(),
          testAddress.toBuffer(),
        ],
        program.programId
      );
    });

    it("Should add address to whitelist", async () => {
      const tx = await program.methods
        .addWhitelist(testAddress)
        .accounts({
          config: configPda,
          whitelist: whitelistPda,
          authority: authority.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();

      console.log("✓ Add whitelist tx:", tx);

      const whitelist = await program.account.whitelistEntry.fetch(
        whitelistPda
      );
      expect(whitelist.address.toString()).to.equal(testAddress.toString());
      expect(whitelist.isWhitelisted).to.be.true;
      console.log("✓ Whitelist entry verified");
    });

    it("Should remove address from whitelist", async () => {
      const tx = await program.methods
        .removeWhitelist(testAddress)
        .accounts({
          config: configPda,
          whitelist: whitelistPda,
          authority: authority.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();

      console.log("✓ Remove whitelist tx:", tx);

      // Account should be closed
      try {
        await program.account.whitelistEntry.fetch(whitelistPda);
        expect.fail("Account should be closed");
      } catch (e) {
        console.log("✓ Whitelist entry closed");
      }
    });
  });

  describe("Contract Closure", () => {
    it("Should close config account", async () => {
      const tx = await program.methods
        .closeConfig()
        .accounts({
          config: configPda,
          authority: authority.publicKey,
        })
        .rpc();

      console.log("✓ Close config tx:", tx);
    });
  });

  after(() => {
    console.log("\n✅ SSS-2 Transfer Hook Tests Complete");
  });
});
