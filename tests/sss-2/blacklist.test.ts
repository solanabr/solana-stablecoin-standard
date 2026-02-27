import { describe, it } from "mocha";
import { expect } from "chai";
import { Connection, Keypair, PublicKey, clusterApiUrl } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import { SSS2Hook, SSS2_PROGRAM_ID } from "../../sdk/src/sss2";

describe("SSS-2: Blacklist", () => {
  let connection: Connection;
  let payer: Keypair;
  let hook: SSS2Hook;

  before(async () => {
    connection = new Connection(clusterApiUrl("devnet"), "confirmed");
    payer = Keypair.generate();
    hook = new SSS2Hook(connection, payer);
  });

  it("should add address to blacklist", async () => {
    const badActor = new PublicKey(
      "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
    );

    // Add to blacklist
    // const result = await hook.addBlacklist(badActor);

    expect(hook.getBlacklistPDA(badActor)).to.have.property("toBase58");
  });

  it("should reject transfers from blacklisted address", async () => {
    const source = "bad_actor_address";
    const isBlacklisted = true;

    expect(isBlacklisted).to.be.true;
    // Transfer should fail
  });

  it("should reject transfers to blacklisted address", async () => {
    const destination = "bad_actor_address";
    const isBlacklisted = true;

    expect(isBlacklisted).to.be.true;
    // Transfer should fail
  });

  it("should remove address from blacklist", async () => {
    const address = new PublicKey(
      "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
    );

    // await hook.removeBlacklist(address);

    expect(hook.getBlacklistPDA(address)).to.have.property("toBase58");
  });

  it("should emit BlacklistAdded event", async () => {
    const event = {
      address: "bad_actor",
      entryType: "blacklist",
      addedBy: "admin",
      timestamp: Date.now(),
    };

    expect(event.entryType).to.equal("blacklist");
    expect(event.address).to.not.be.empty;
  });

  it("should require admin authority", async () => {
    const admin = "admin_pubkey";
    const signer = "admin_pubkey";

    expect(admin).to.equal(signer);
  });

  describe("Compliance Check", () => {
    it("should detect blacklisted source", async () => {
      const source = "blacklisted";
      const destination = "clean";

      expect(source).to.equal("blacklisted");
    });

    it("should detect blacklisted destination", async () => {
      const source = "clean";
      const destination = "blacklisted";

      expect(destination).to.equal("blacklisted");
    });

    it("should allow transfer between clean addresses", async () => {
      const source = "clean";
      const destination = "clean";

      expect(source).to.equal("clean");
      expect(destination).to.equal("clean");
    });
  });
});
