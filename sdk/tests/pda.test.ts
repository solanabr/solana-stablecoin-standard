import { describe, it, expect } from "vitest";
import { PublicKey } from "@solana/web3.js";
import {
  deriveConfigPda,
  deriveRolePda,
  deriveBlacklistPda,
  deriveExtraAccountMetasPda,
  SSS_CORE_PROGRAM_ID,
  SSS_HOOK_PROGRAM_ID,
} from "../src/pda";

describe("PDA derivation", () => {
  it("derives config PDA deterministically", () => {
    const mint = PublicKey.unique();
    const [pda1, bump1] = deriveConfigPda(mint, SSS_CORE_PROGRAM_ID);
    const [pda2, bump2] = deriveConfigPda(mint, SSS_CORE_PROGRAM_ID);
    expect(pda1.equals(pda2)).toBe(true);
    expect(bump1).toBe(bump2);
  });

  it("derives different PDAs for different mints", () => {
    const mint1 = PublicKey.unique();
    const mint2 = PublicKey.unique();
    const [pda1] = deriveConfigPda(mint1, SSS_CORE_PROGRAM_ID);
    const [pda2] = deriveConfigPda(mint2, SSS_CORE_PROGRAM_ID);
    expect(pda1.equals(pda2)).toBe(false);
  });

  it("config PDA is off-curve", () => {
    const mint = PublicKey.unique();
    const [pda] = deriveConfigPda(mint, SSS_CORE_PROGRAM_ID);
    expect(PublicKey.isOnCurve(pda.toBuffer())).toBe(false);
  });

  it("derives role PDA deterministically", () => {
    const config = PublicKey.unique();
    const address = PublicKey.unique();
    const [pda1] = deriveRolePda(config, address, "minter", SSS_CORE_PROGRAM_ID);
    const [pda2] = deriveRolePda(config, address, "minter", SSS_CORE_PROGRAM_ID);
    expect(pda1.equals(pda2)).toBe(true);
  });

  it("derives different role PDAs for different roles", () => {
    const config = PublicKey.unique();
    const address = PublicKey.unique();
    const [minterPda] = deriveRolePda(config, address, "minter", SSS_CORE_PROGRAM_ID);
    const [freezerPda] = deriveRolePda(config, address, "freezer", SSS_CORE_PROGRAM_ID);
    expect(minterPda.equals(freezerPda)).toBe(false);
  });

  it("derives different role PDAs for different addresses", () => {
    const config = PublicKey.unique();
    const address1 = PublicKey.unique();
    const address2 = PublicKey.unique();
    const [pda1] = deriveRolePda(config, address1, "admin", SSS_CORE_PROGRAM_ID);
    const [pda2] = deriveRolePda(config, address2, "admin", SSS_CORE_PROGRAM_ID);
    expect(pda1.equals(pda2)).toBe(false);
  });

  it("derives all four role types without error", () => {
    const config = PublicKey.unique();
    const address = PublicKey.unique();
    const roles = ["admin", "minter", "freezer", "pauser"] as const;
    const pdas = roles.map((r) => deriveRolePda(config, address, r, SSS_CORE_PROGRAM_ID));
    // All should be unique
    const pdaSet = new Set(pdas.map(([pda]) => pda.toBase58()));
    expect(pdaSet.size).toBe(4);
  });

  it("derives blacklist PDA deterministically", () => {
    const mint = PublicKey.unique();
    const address = PublicKey.unique();
    const [pda1] = deriveBlacklistPda(mint, address, SSS_HOOK_PROGRAM_ID);
    const [pda2] = deriveBlacklistPda(mint, address, SSS_HOOK_PROGRAM_ID);
    expect(pda1.equals(pda2)).toBe(true);
  });

  it("blacklist PDA is off-curve", () => {
    const mint = PublicKey.unique();
    const address = PublicKey.unique();
    const [pda] = deriveBlacklistPda(mint, address, SSS_HOOK_PROGRAM_ID);
    expect(PublicKey.isOnCurve(pda.toBuffer())).toBe(false);
  });

  it("derives different blacklist PDAs for different addresses", () => {
    const mint = PublicKey.unique();
    const address1 = PublicKey.unique();
    const address2 = PublicKey.unique();
    const [pda1] = deriveBlacklistPda(mint, address1, SSS_HOOK_PROGRAM_ID);
    const [pda2] = deriveBlacklistPda(mint, address2, SSS_HOOK_PROGRAM_ID);
    expect(pda1.equals(pda2)).toBe(false);
  });

  it("derives extra account metas PDA deterministically", () => {
    const mint = PublicKey.unique();
    const [pda1] = deriveExtraAccountMetasPda(mint, SSS_HOOK_PROGRAM_ID);
    const [pda2] = deriveExtraAccountMetasPda(mint, SSS_HOOK_PROGRAM_ID);
    expect(pda1.equals(pda2)).toBe(true);
  });

  it("extra account metas PDA is off-curve", () => {
    const mint = PublicKey.unique();
    const [pda] = deriveExtraAccountMetasPda(mint, SSS_HOOK_PROGRAM_ID);
    expect(PublicKey.isOnCurve(pda.toBuffer())).toBe(false);
  });

  it("uses correct default program IDs", () => {
    const mint = PublicKey.unique();
    // Default should use SSS_CORE_PROGRAM_ID
    const [pdaDefault] = deriveConfigPda(mint);
    const [pdaExplicit] = deriveConfigPda(mint, SSS_CORE_PROGRAM_ID);
    expect(pdaDefault.equals(pdaExplicit)).toBe(true);

    // Blacklist default should use SSS_HOOK_PROGRAM_ID
    const address = PublicKey.unique();
    const [blDefault] = deriveBlacklistPda(mint, address);
    const [blExplicit] = deriveBlacklistPda(mint, address, SSS_HOOK_PROGRAM_ID);
    expect(blDefault.equals(blExplicit)).toBe(true);
  });
});
