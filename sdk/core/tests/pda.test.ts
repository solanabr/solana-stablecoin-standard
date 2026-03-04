import { PublicKey } from "@solana/web3.js";
import { expect } from "chai";
import {
  getConfigAddress,
  getMinterAddress,
  getBlacklistAddress,
  SSS_TOKEN_PROGRAM_ID,
  CONFIG_SEED,
  BLACKLIST_SEED,
} from "../src";

const MOCK_MINT = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
const MOCK_WALLET = new PublicKey("7VHUFJHWu2CuExkJcJrzhQPJ2oygupTWkL2A2For4BmE");

describe("PDA Derivation", () => {
  it("derives config PDA deterministically", () => {
    const [pda1] = getConfigAddress(MOCK_MINT);
    const [pda2] = getConfigAddress(MOCK_MINT);
    expect(pda1.equals(pda2)).to.be.true;
  });

  it("config PDA is off-curve", () => {
    const [pda] = getConfigAddress(MOCK_MINT);
    expect(PublicKey.isOnCurve(pda.toBuffer())).to.be.false;
  });

  it("different mints produce different config PDAs", () => {
    const mint2 = new PublicKey("So11111111111111111111111111111111111111112");
    const [pda1] = getConfigAddress(MOCK_MINT);
    const [pda2] = getConfigAddress(mint2);
    expect(pda1.equals(pda2)).to.be.false;
  });

  it("derives minter PDA deterministically", () => {
    const [pda1] = getMinterAddress(MOCK_MINT, MOCK_WALLET);
    const [pda2] = getMinterAddress(MOCK_MINT, MOCK_WALLET);
    expect(pda1.equals(pda2)).to.be.true;
  });

  it("derives blacklist PDA deterministically", () => {
    const [pda1] = getBlacklistAddress(MOCK_MINT, MOCK_WALLET);
    const [pda2] = getBlacklistAddress(MOCK_MINT, MOCK_WALLET);
    expect(pda1.equals(pda2)).to.be.true;
  });

  it("different addresses produce different blacklist PDAs", () => {
    const addr2 = new PublicKey("So11111111111111111111111111111111111111112");
    const [pda1] = getBlacklistAddress(MOCK_MINT, MOCK_WALLET);
    const [pda2] = getBlacklistAddress(MOCK_MINT, addr2);
    expect(pda1.equals(pda2)).to.be.false;
  });
});
