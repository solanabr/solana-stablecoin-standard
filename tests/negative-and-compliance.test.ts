/**
 * Negative cases: wrong role, compliance on SSS-1 (ComplianceNotEnabled), missing role.
 */

import * as anchor from "@coral-xyz/anchor";
import { Keypair, Transaction } from "@solana/web3.js";
import { expect } from "chai";
import { SolanaStablecoin, ComplianceNotEnabledError } from "@stbr/sss-token";
import idl from "../sdk/core/src/idl/solana_stablecoin_standard.json";
import {
  buildInitializeIx,
  buildUpdateMinterIx,
  buildUpdateRolesIx,
  findMinterPDA,
  findRolePDA,
  findStablecoinPDA,
  sendAndConfirmAndLog,
  SSS_HOOK_PROGRAM_ID,
} from "./helpers";
import { fundKeypairs, getProvider } from "./testSetup";

describe("Negative and compliance gating", () => {
  const provider = getProvider();
  const connection = provider.connection;
  const authority = provider.wallet.payer as Keypair;

  let mintKeypair: Keypair;
  let minterKeypair: Keypair;
  let otherKeypair: Keypair;
  let recipientKeypair: Keypair;

  before(async () => {
    mintKeypair = Keypair.generate();
    minterKeypair = Keypair.generate();
    otherKeypair = Keypair.generate();
    recipientKeypair = Keypair.generate();
    await fundKeypairs(provider, [minterKeypair, otherKeypair, recipientKeypair]);
  });

  it("SSS-1: compliance.blacklistAdd throws ComplianceNotEnabledError", async () => {
    const [stablecoinPDA] = findStablecoinPDA(mintKeypair.publicKey);
    const [authorityRole] = findRolePDA(stablecoinPDA, authority.publicKey);
    const ix = buildInitializeIx(
      authority.publicKey,
      stablecoinPDA,
      mintKeypair.publicKey,
      authorityRole,
      SSS_HOOK_PROGRAM_ID,
      {
        name: "No Compliance USD",
        symbol: "NCUSD",
        uri: "",
        decimals: 6,
        enablePermanentDelegate: false,
        enableTransferHook: false,
        defaultAccountFrozen: false,
      }
    );
    await sendAndConfirmAndLog(connection, new Transaction().add(ix), [authority, mintKeypair], "Init SSS-1");

    const program = new anchor.Program(idl as anchor.Idl, provider);
    const stable = await SolanaStablecoin.load(program as never, mintKeypair.publicKey);
    expect(stable.isSSS2()).to.be.false;

    const someAddress = Keypair.generate().publicKey;
    try {
      await stable.compliance.blacklistAdd(authority.publicKey, someAddress, "test");
      expect.fail("expected ComplianceNotEnabledError");
    } catch (e) {
      expect(e).to.be.instanceOf(ComplianceNotEnabledError);
    }
  });

  it("mint with signer that has no minter role fails", async () => {
    const [stablecoinPDA] = findStablecoinPDA(mintKeypair.publicKey);
    const [minterRole] = findRolePDA(stablecoinPDA, minterKeypair.publicKey);
    const [minterInfoPDA] = findMinterPDA(stablecoinPDA, minterKeypair.publicKey);
    await sendAndConfirmAndLog(
      connection,
      new Transaction()
        .add(
          buildUpdateRolesIx(authority.publicKey, stablecoinPDA, minterRole, minterKeypair.publicKey, {
            isMinter: true,
            isBurner: false,
            isPauser: false,
            isFreezer: false,
            isBlacklister: false,
            isSeizer: false,
          })
        )
        .add(buildUpdateMinterIx(authority.publicKey, stablecoinPDA, minterInfoPDA, minterKeypair.publicKey, BigInt(1_000_000))),
      [authority],
      "Grant minter to minterKeypair only"
    );

    const program = new anchor.Program(idl as anchor.Idl, provider);
    const stable = await SolanaStablecoin.load(program as never, mintKeypair.publicKey);
    try {
      await stable.mint(otherKeypair.publicKey, {
        recipient: recipientKeypair.publicKey,
        amount: BigInt(1000),
        minter: otherKeypair.publicKey,
      });
      expect.fail("expected Unauthorized or role error");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      expect(msg.toLowerCase()).to.satisfy((s: string) =>
        s.includes("unauthorized") || s.includes("role") || s.includes("6000") || s.includes("3003")
      );
    }
  });
});
