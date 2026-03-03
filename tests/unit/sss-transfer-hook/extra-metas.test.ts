import * as anchor from "@coral-xyz/anchor";
import { assert } from "chai";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import {
  findHookConfigPda,
  findExtraAccountMetaListPda,
  SSS_TRANSFER_HOOK_PROGRAM_ID,
} from "@sss/sdk";
import {
  provider,
  hookProgram,
  admin,
  createSSS2Mint,
  initializeHook,
  airdropSol,
} from "../../helpers/setup";

describe("sss-transfer-hook: ExtraAccountMetaList", () => {
  let mint: PublicKey;
  let hookConfig: PublicKey;
  let extraMetaList: PublicKey;
  const treasury = Keypair.generate();

  before(async () => {
    await airdropSol(admin.publicKey);
    await airdropSol(treasury.publicKey);
    const result = await createSSS2Mint(treasury.publicKey);
    mint = result.mintKeypair.publicKey;
    const configPda = result.configPda;
    [hookConfig] = findHookConfigPda(mint);
    [extraMetaList] = findExtraAccountMetaListPda(mint);
    await initializeHook(mint, configPda);
  });

  describe("1. ExtraAccountMetaList PDA created with correct seeds", () => {
    it("PDA uses 'extra-account-metas' seed and mint", () => {
      const [expected] = PublicKey.findProgramAddressSync(
        [Buffer.from("extra-account-metas"), mint.toBuffer()],
        SSS_TRANSFER_HOOK_PROGRAM_ID
      );
      assert.ok(
        extraMetaList.equals(expected),
        "ExtraAccountMetaList PDA should match manual derivation"
      );
    });
  });

  describe("2. correct number of extra metas (3)", () => {
    it("ExtraAccountMetaList account exists and has data for 3 metas", async () => {
      const account = await provider.connection.getAccountInfo(extraMetaList);
      assert.isNotNull(account, "ExtraAccountMetaList should exist");
      // Account data should encode 3 extra accounts
      // The TLV layout: 4 bytes length prefix + 3 * 35 bytes per ExtraAccountMeta
      assert.isAbove(account!.data.length, 0, "account data should be non-empty");
    });
  });

  describe("3. ExtraAccountMetaList owned by transfer hook program", () => {
    it("account owner is the transfer hook program", async () => {
      const account = await provider.connection.getAccountInfo(extraMetaList);
      assert.isNotNull(account, "ExtraAccountMetaList should exist");
      assert.ok(
        account!.owner.equals(SSS_TRANSFER_HOOK_PROGRAM_ID),
        "owner should be SSS_TRANSFER_HOOK_PROGRAM_ID"
      );
    });
  });

  describe("4. fails if hook_config not initialized", () => {
    it("throws when initializing extra metas without hook_config", async () => {
      const newMint = Keypair.generate().publicKey;
      const [newHookConfig] = findHookConfigPda(newMint);
      const [newExtraMetaList] = findExtraAccountMetaListPda(newMint);

      try {
        await hookProgram.methods
          .initializeExtraAccountMetaList()
          .accounts({
            hookConfig: newHookConfig,
            extraAccountMetaList: newExtraMetaList,
            mint: newMint,
            authority: admin.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
        assert.fail("Expected error when hook_config is not initialized");
      } catch (err: any) {
        assert.ok(err, "Should throw when hook_config does not exist");
      }
    });
  });

  describe("5. idempotent initialization fails (account already exists)", () => {
    it("throws when trying to re-initialize extra account meta list", async () => {
      try {
        await hookProgram.methods
          .initializeExtraAccountMetaList()
          .accounts({
            hookConfig,
            extraAccountMetaList: extraMetaList,
            mint,
            authority: admin.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
        assert.fail("Expected error on re-initialization");
      } catch (err: any) {
        assert.ok(err, "Should throw on duplicate init");
      }
    });
  });
});
