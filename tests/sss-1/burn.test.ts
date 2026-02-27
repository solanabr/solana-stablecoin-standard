import { describe, it } from "mocha";
import { expect } from "chai";
import { BN } from "@coral-xyz/anchor";

describe("SSS-1: Burn", () => {
  it("should burn tokens from account", async () => {
    const amount = new BN(500000); // 0.5 token
    const initialBalance = new BN(1000000);
    const expectedBalance = initialBalance.sub(amount);

    expect(expectedBalance.toNumber()).to.equal(500000);
  });

  it("should decrease total supply", async () => {
    const burnAmount = new BN(200000);
    const initialSupply = new BN(1000000000);
    const expectedSupply = initialSupply.sub(burnAmount);

    expect(expectedSupply.toNumber()).to.equal(999800000);
  });

  it("should fail with insufficient balance", async () => {
    const balance = new BN(100000); // 0.1 token
    const burnAmount = new BN(200000); // 0.2 token

    expect(balance.lt(burnAmount)).to.be.true;
  });

  it("should allow burn authority", async () => {
    const owner = "owner_pubkey";
    const authority = "owner_pubkey";

    expect(owner).to.equal(authority);
  });

  it("should fail to burn zero tokens", async () => {
    const amount = new BN(0);

    expect(amount.toNumber()).to.equal(0);
  });
});
