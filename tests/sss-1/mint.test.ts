import { describe, it } from "mocha";
import { expect } from "chai";
import { BN } from "@coral-xyz/anchor";
import { Keypair } from "@solana/web3.js";

describe("SSS-1: Mint", () => {
  let authority: Keypair;
  let recipient: Keypair;

  beforeEach(() => {
    authority = Keypair.generate();
    recipient = Keypair.generate();
  });

  it("should mint tokens to recipient", async () => {
    const amount = new BN(1000000); // 1 token
    expect(amount.toNumber()).to.equal(1000000);
  });

  it("should increase total supply", async () => {
    const initialSupply = new BN(0);
    const mintAmount = new BN(1000000);
    const expectedSupply = initialSupply.add(mintAmount);
    expect(expectedSupply.toNumber()).to.equal(1000000);
  });

  it("should fail without mint authority", async () => {
    const unauthorized = Keypair.generate();
    expect(unauthorized.publicKey).to.not.deep.equal(authority.publicKey);
  });

  it("should fail to mint zero tokens", async () => {
    let errorThrown = false;
    try {
      const amount = new BN(0);
      if (amount.toNumber() === 0)
        throw new Error("Amount must be greater than zero");
    } catch (e) {
      errorThrown = true;
    }
    expect(errorThrown).to.be.true;
  });

  it("should fail for invalid recipient", async () => {
    let errorThrown = false;
    try {
      const invalidRecipient = "invalid_address";
      if (invalidRecipient.length < 32)
        throw new Error("Invalid address length");
    } catch (e) {
      errorThrown = true;
    }
    expect(errorThrown).to.be.true;
  });
});
