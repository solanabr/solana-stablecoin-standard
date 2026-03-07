import * as anchor from "@coral-xyz/anchor";
import {
  getConfigPda,
  getFreezeAuthorityPda,
  getMintAuthorityPda,
  getMinterAccountPda,
  getMasterRolePda,
  getPauseAuthorityPda,
  getSeizerAuthorityPda,
  getBlacklistedEntryPda,
  getEventAuthorityPda,
} from "../helpers/pda";
import { TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import { expect } from "chai";
import type { SssContext } from "./context";

export function registerBlacklist(ctx: SssContext): void {
  const { program, programId, admin, otherUser, newMasterKeypair } = ctx;

  describe("add_to_blacklist", () => {
    let sss2Mint: anchor.web3.Keypair;
    let sss2MintPk: anchor.web3.PublicKey;
    let configPda: anchor.web3.PublicKey;

    before(async () => {
      sss2Mint = anchor.web3.Keypair.generate();
      sss2MintPk = sss2Mint.publicKey;
      [configPda] = getConfigPda(programId, sss2MintPk);
      const [masterRolePda] = getMasterRolePda(
        programId,
        sss2MintPk,
        admin.publicKey,
      );
      const [mintAuthorityPda] = getMintAuthorityPda(programId, sss2MintPk);
      const [freezeAuthorityPda] = getFreezeAuthorityPda(programId, sss2MintPk);
      const [pauseAuthorityPda] = getPauseAuthorityPda(programId, sss2MintPk);
      const [seizerAuthorityPda] = getSeizerAuthorityPda(programId, sss2MintPk);
      const [minterAccountPda] = getMinterAccountPda(
        programId,
        sss2MintPk,
        admin.publicKey,
      );
      await program.methods
        .initialize(
          { sss2: {} },
          "SSS2 Blacklist Test",
          "TS2BL",
          "https://example.com/sss2bl.json",
          6,
          admin.publicKey,
          admin.publicKey,
          new anchor.BN(1_000_000),
          true,
          true,
          false,
        )
        .accountsStrict({
          admin: admin.publicKey,
          mint: sss2MintPk,
          config: configPda,
          mintAuthority: mintAuthorityPda,
          freezeAuthority: freezeAuthorityPda,
          pauseAuthority: pauseAuthorityPda,
          seizerAuthority: seizerAuthorityPda,
          masterRole: masterRolePda,
          minterAccount: minterAccountPda,
          eventAuthority: getEventAuthorityPda(programId),
          program: program.programId,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          systemProgram: anchor.web3.SystemProgram.programId,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .signers([sss2Mint])
        .rpc();
    });

    it("adds wallet to blacklist when SSS2 and transfer hook enabled", async () => {
      const walletToBlacklist = otherUser.publicKey;
      const [blacklistedEntryPda] = getBlacklistedEntryPda(
        programId,
        sss2MintPk,
        walletToBlacklist,
      );
      const tx = await program.methods
        .addToBlacklist(walletToBlacklist, "OFAC match")
        .accountsStrict({
          blacklister: admin.publicKey,
          mint: sss2MintPk,
          config: configPda,
          blacklistedEntry: blacklistedEntryPda,
          eventAuthority: getEventAuthorityPda(programId),
          program: program.programId,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
      expect(tx).to.be.a("string");
      const entry = await program.account.blacklistedEntry.fetch(
        blacklistedEntryPda,
      );
      expect(entry.isBlacklisted).to.equal(true);
      expect(entry.reason).to.equal("OFAC match");
    });

    it("throws ComplianceNotEnabled when mint is SSS1", async () => {
      const sss1Mint = anchor.web3.Keypair.generate();
      const sss1Pk = sss1Mint.publicKey;
      const [sss1ConfigPda] = getConfigPda(programId, sss1Pk);
      const [masterRolePda] = getMasterRolePda(
        programId,
        sss1Pk,
        admin.publicKey,
      );
      const [mintAuthorityPda] = getMintAuthorityPda(programId, sss1Pk);
      const [freezeAuthorityPda] = getFreezeAuthorityPda(programId, sss1Pk);
      const [pauseAuthorityPda] = getPauseAuthorityPda(programId, sss1Pk);
      const [seizerAuthorityPda] = getSeizerAuthorityPda(programId, sss1Pk);
      const [minterAccountPda] = getMinterAccountPda(
        programId,
        sss1Pk,
        admin.publicKey,
      );
      await program.methods
        .initialize(
          { sss1: {} },
          "SSS1",
          "TS1B",
          "https://example.com/s1.json",
          6,
          admin.publicKey,
          admin.publicKey,
          new anchor.BN(100),
          null,
          null,
          null,
        )
        .accountsStrict({
          admin: admin.publicKey,
          mint: sss1Pk,
          config: sss1ConfigPda,
          mintAuthority: mintAuthorityPda,
          freezeAuthority: freezeAuthorityPda,
          pauseAuthority: pauseAuthorityPda,
          seizerAuthority: seizerAuthorityPda,
          masterRole: masterRolePda,
          minterAccount: minterAccountPda,
          eventAuthority: getEventAuthorityPda(programId),
          program: program.programId,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          systemProgram: anchor.web3.SystemProgram.programId,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .signers([sss1Mint])
        .rpc();
      const [blacklistedEntryPda] = getBlacklistedEntryPda(
        programId,
        sss1Pk,
        otherUser.publicKey,
      );
      try {
        await program.methods
          .addToBlacklist(otherUser.publicKey, "")
          .accountsStrict({
            blacklister: admin.publicKey,
            mint: sss1Pk,
            config: sss1ConfigPda,
            blacklistedEntry: blacklistedEntryPda,
            eventAuthority: getEventAuthorityPda(programId),
            program: program.programId,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .rpc();
        expect.fail(
          "Expected addToBlacklist to fail with ComplianceNotEnabled",
        );
      } catch (err: unknown) {
        const msg = (err as { message?: string })?.message ?? String(err);
        expect(msg).to.match(
          /Compliance is not enabled|0x1770|ComplianceNotEnabled/,
        );
      }
    });

    it("throws TransferHookNotEnabled when SSS2 but transfer hook disabled", async () => {
      const sss2NoHookMint = anchor.web3.Keypair.generate();
      const sss2NoHookPk = sss2NoHookMint.publicKey;
      const [noHookConfigPda] = getConfigPda(programId, sss2NoHookPk);
      const [masterRolePda] = getMasterRolePda(
        programId,
        sss2NoHookPk,
        admin.publicKey,
      );
      const [mintAuthorityPda] = getMintAuthorityPda(programId, sss2NoHookPk);
      const [freezeAuthorityPda] = getFreezeAuthorityPda(
        programId,
        sss2NoHookPk,
      );
      const [pauseAuthorityPda] = getPauseAuthorityPda(programId, sss2NoHookPk);
      const [seizerAuthorityPda] = getSeizerAuthorityPda(
        programId,
        sss2NoHookPk,
      );
      const [minterAccountPda] = getMinterAccountPda(
        programId,
        sss2NoHookPk,
        admin.publicKey,
      );
      await program.methods
        .initialize(
          { sss2: {} },
          "SSS2 No Hook",
          "TS2NH",
          "https://example.com/sss2nh.json",
          6,
          admin.publicKey,
          admin.publicKey,
          new anchor.BN(100),
          true,
          false,
          false,
        )
        .accountsStrict({
          admin: admin.publicKey,
          mint: sss2NoHookPk,
          config: noHookConfigPda,
          mintAuthority: mintAuthorityPda,
          freezeAuthority: freezeAuthorityPda,
          pauseAuthority: pauseAuthorityPda,
          seizerAuthority: seizerAuthorityPda,
          masterRole: masterRolePda,
          minterAccount: minterAccountPda,
          eventAuthority: getEventAuthorityPda(programId),
          program: program.programId,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          systemProgram: anchor.web3.SystemProgram.programId,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .signers([sss2NoHookMint])
        .rpc();
      const [blacklistedEntryPda] = getBlacklistedEntryPda(
        programId,
        sss2NoHookPk,
        otherUser.publicKey,
      );
      try {
        await program.methods
          .addToBlacklist(otherUser.publicKey, "")
          .accountsStrict({
            blacklister: admin.publicKey,
            mint: sss2NoHookPk,
            config: noHookConfigPda,
            blacklistedEntry: blacklistedEntryPda,
            eventAuthority: getEventAuthorityPda(programId),
            program: program.programId,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .rpc();
        expect.fail(
          "Expected addToBlacklist to fail with TransferHookNotEnabled",
        );
      } catch (err: unknown) {
        const msg = (err as { message?: string })?.message ?? String(err);
        expect(msg).to.match(
          /Transfer hook is not enabled|0x1776|TransferHookNotEnabled/,
        );
      }
    });
  });

  describe("remove_from_blacklist", () => {
    let sss2MintPk: anchor.web3.PublicKey;
    let configPda: anchor.web3.PublicKey;

    before(async () => {
      const sss2Mint = anchor.web3.Keypair.generate();
      sss2MintPk = sss2Mint.publicKey;
      [configPda] = getConfigPda(programId, sss2MintPk);
      const [masterRolePda] = getMasterRolePda(
        programId,
        sss2MintPk,
        admin.publicKey,
      );
      const [mintAuthorityPda] = getMintAuthorityPda(programId, sss2MintPk);
      const [freezeAuthorityPda] = getFreezeAuthorityPda(programId, sss2MintPk);
      const [pauseAuthorityPda] = getPauseAuthorityPda(programId, sss2MintPk);
      const [seizerAuthorityPda] = getSeizerAuthorityPda(programId, sss2MintPk);
      const [minterAccountPda] = getMinterAccountPda(
        programId,
        sss2MintPk,
        admin.publicKey,
      );
      await program.methods
        .initialize(
          { sss2: {} },
          "SSS2 Remove BL Test",
          "TS2RBL",
          "https://example.com/sss2rbl.json",
          6,
          admin.publicKey,
          admin.publicKey,
          new anchor.BN(1_000_000),
          true,
          true,
          false,
        )
        .accountsStrict({
          admin: admin.publicKey,
          mint: sss2MintPk,
          config: configPda,
          mintAuthority: mintAuthorityPda,
          freezeAuthority: freezeAuthorityPda,
          pauseAuthority: pauseAuthorityPda,
          seizerAuthority: seizerAuthorityPda,
          masterRole: masterRolePda,
          minterAccount: minterAccountPda,
          eventAuthority: getEventAuthorityPda(programId),
          program: program.programId,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          systemProgram: anchor.web3.SystemProgram.programId,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .signers([sss2Mint])
        .rpc();
    });

    it("removes wallet from blacklist when wallet is on blacklist", async () => {
      const walletToRemove = otherUser.publicKey;
      const [blacklistedEntryPda] = getBlacklistedEntryPda(
        programId,
        sss2MintPk,
        walletToRemove,
      );
      await program.methods
        .addToBlacklist(walletToRemove, "test reason")
        .accountsStrict({
          blacklister: admin.publicKey,
          mint: sss2MintPk,
          config: configPda,
          blacklistedEntry: blacklistedEntryPda,
          eventAuthority: getEventAuthorityPda(programId),
          program: program.programId,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
      await program.methods
        .removeFromBlacklist(walletToRemove)
        .accountsStrict({
          blacklister: admin.publicKey,
          mint: sss2MintPk,
          config: configPda,
          blacklistedEntry: blacklistedEntryPda,
          eventAuthority: getEventAuthorityPda(programId),
          program: program.programId,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
      const accountInfo = await ctx.provider.connection.getAccountInfo(
        blacklistedEntryPda,
      );
      expect(accountInfo).to.equal(null);
    });

    it("throws when wallet is not on blacklist (account not initialized)", async () => {
      const walletNeverAdded = newMasterKeypair.publicKey;
      const [blacklistedEntryPda] = getBlacklistedEntryPda(
        programId,
        sss2MintPk,
        walletNeverAdded,
      );
      try {
        await program.methods
          .removeFromBlacklist(walletNeverAdded)
          .accountsStrict({
            blacklister: admin.publicKey,
            mint: sss2MintPk,
            config: configPda,
            blacklistedEntry: blacklistedEntryPda,
            eventAuthority: getEventAuthorityPda(programId),
            program: program.programId,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .rpc();
        expect.fail(
          "Expected removeFromBlacklist to fail when wallet not on blacklist",
        );
      } catch (err: unknown) {
        const msg = (err as { message?: string })?.message ?? String(err);
        expect(msg).to.match(
          /AccountNotInitialized|constraint|invalid account|could not find account/,
        );
      }
    });
  });
}
