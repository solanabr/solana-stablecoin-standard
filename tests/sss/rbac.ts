import * as anchor from "@coral-xyz/anchor";
import {
  getEventAuthorityPda,
  getMasterRolePda,
  getMinterAccountPda,
  getRoleAccountPda,
} from "../helpers/pda";
import { expect } from "chai";
import type { SssContext } from "./context";
import { BURNER_ROLE, MASTER_ROLE } from "./context";

export function registerRbac(ctx: SssContext): void {
  const { program, programId, admin, otherUser, newMasterKeypair } = ctx;

  describe("update_minter", () => {
    // API: updateMinter(operation, minter, allowance) with operation "add" | "remove".
    // Single account: updateMinter (the minter PDA for that mint + minter pubkey).
    let mintPda: anchor.web3.PublicKey;
    let masterRolePda: anchor.web3.PublicKey;
    let adminMinterAccountPda: anchor.web3.PublicKey;

    before(async () => {
      mintPda = ctx.mintTs1Pk;
      [masterRolePda] = getMasterRolePda(programId, mintPda, admin.publicKey);
      [adminMinterAccountPda] = getMinterAccountPda(
        programId,
        mintPda,
        admin.publicKey,
      );
    });

    it("allows master to remove minter and add new minter with allowance", async () => {
      // Remove admin as minter
      await program.methods
        .updateMinter("remove", admin.publicKey, new anchor.BN(0))
        .accountsStrict({
          master: admin.publicKey,
          mint: mintPda,
          masterRole: masterRolePda,
          updateMinter: adminMinterAccountPda,
          eventAuthority: getEventAuthorityPda(programId),
          program: program.programId,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();

      // Add otherUser as minter with new allowance
      const newAllowance = 500_000;
      const [newMinterAccountPda] = getMinterAccountPda(
        programId,
        mintPda,
        otherUser.publicKey,
      );
      await program.methods
        .updateMinter("add", otherUser.publicKey, new anchor.BN(newAllowance))
        .accountsStrict({
          master: admin.publicKey,
          mint: mintPda,
          masterRole: masterRolePda,
          updateMinter: newMinterAccountPda,
          eventAuthority: getEventAuthorityPda(programId),
          program: program.programId,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();

      const newMinterAccount = await program.account.minterAccount.fetch(
        newMinterAccountPda,
      );
      expect(newMinterAccount.allowance.toNumber()).to.equal(newAllowance);
      expect(newMinterAccount.minted.toNumber()).to.equal(0);
    });

    after(async () => {
      // Restore admin as minter so later tests (blacklist, seize) can mint
      const [otherUserMinterPda] = getMinterAccountPda(
        programId,
        mintPda,
        otherUser.publicKey,
      );
      const [adminMinterPda] = getMinterAccountPda(
        programId,
        mintPda,
        admin.publicKey,
      );
      await program.methods
        .updateMinter("remove", otherUser.publicKey, new anchor.BN(0))
        .accountsStrict({
          master: admin.publicKey,
          mint: mintPda,
          masterRole: masterRolePda,
          updateMinter: otherUserMinterPda,
          eventAuthority: getEventAuthorityPda(programId),
          program: program.programId,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
      await program.methods
        .updateMinter("add", admin.publicKey, new anchor.BN(2_000_000))
        .accountsStrict({
          master: admin.publicKey,
          mint: mintPda,
          masterRole: masterRolePda,
          updateMinter: adminMinterPda,
          eventAuthority: getEventAuthorityPda(programId),
          program: program.programId,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
    });

    it("rejects update_minter when non-master tries", async () => {
      const [masterRolePdaOther] = getMasterRolePda(
        programId,
        mintPda,
        otherUser.publicKey,
      );
      const [newMinterAccountPda] = getMinterAccountPda(
        programId,
        mintPda,
        newMasterKeypair.publicKey,
      );
      try {
        await program.methods
          .updateMinter("add", newMasterKeypair.publicKey, new anchor.BN(100))
          .accountsStrict({
            master: otherUser.publicKey,
            mint: mintPda,
            masterRole: masterRolePdaOther,
            updateMinter: newMinterAccountPda,
            eventAuthority: getEventAuthorityPda(programId),
            program: program.programId,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .signers([otherUser])
          .rpc();
        expect.fail("Expected update_minter to fail for non-master");
      } catch (err: unknown) {
        const msg = (err as { message?: string })?.message ?? String(err);
        expect(msg).to.match(
          /AccountNotInitialized|constraint|invalid account/,
        );
      }
    });

    it("rejects update_minter when operation is not add or remove", async () => {
      const [otherMinterPda] = getMinterAccountPda(
        programId,
        mintPda,
        otherUser.publicKey,
      );
      try {
        await program.methods
          .updateMinter("replace", otherUser.publicKey, new anchor.BN(100))
          .accountsStrict({
            master: admin.publicKey,
            mint: mintPda,
            masterRole: masterRolePda,
            updateMinter: otherMinterPda,
            eventAuthority: getEventAuthorityPda(programId),
            program: program.programId,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .rpc();
        expect.fail("Expected update_minter to fail for invalid operation");
      } catch (err: unknown) {
        const msg = (err as { message?: string })?.message ?? String(err);
        expect(msg).to.include("Operation not allowed");
      }
    });
  });

  describe("update_roles", () => {
    let mintPda: anchor.web3.PublicKey;
    let masterRolePda: anchor.web3.PublicKey;

    before(async () => {
      mintPda = ctx.mintTs1Pk;
      [masterRolePda] = getMasterRolePda(programId, mintPda, admin.publicKey);
    });

    it("allows master to grant a new role (e.g. burner)", async () => {
      const [burnerRolePda] = getRoleAccountPda(
        programId,
        mintPda,
        BURNER_ROLE,
        otherUser.publicKey,
      );
      await program.methods
        .updateRoles([
          {
            role: "burner",
            oldKey: null,
            newKey: otherUser.publicKey,
            allowance: new anchor.BN(0),
          },
        ])
        .accountsStrict({
          master: admin.publicKey,
          mint: mintPda,
          masterRole: masterRolePda,
          eventAuthority: getEventAuthorityPda(programId),
          program: program.programId,
          systemProgram: anchor.web3.SystemProgram.programId,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .remainingAccounts([
          { pubkey: burnerRolePda, isWritable: true, isSigner: false },
        ])
        .rpc();

      const roleAccount = await program.account.roleAccount.fetch(
        burnerRolePda,
      );
      expect(roleAccount.bump).to.be.a("number");
    });

    it("rejects update_roles when non-master tries", async () => {
      const [masterRolePdaOther] = getMasterRolePda(
        programId,
        mintPda,
        otherUser.publicKey,
      );
      const [someRolePda] = getRoleAccountPda(
        programId,
        mintPda,
        MASTER_ROLE,
        newMasterKeypair.publicKey,
      );
      try {
        await program.methods
          .updateRoles([
            {
              role: "master",
              oldKey: null,
              newKey: newMasterKeypair.publicKey,
              allowance: new anchor.BN(0),
            },
          ])
          .accountsStrict({
            master: otherUser.publicKey,
            mint: mintPda,
            masterRole: masterRolePdaOther,
            eventAuthority: getEventAuthorityPda(programId),
            program: program.programId,
            systemProgram: anchor.web3.SystemProgram.programId,
            rent: anchor.web3.SYSVAR_RENT_PUBKEY,
          })
          .remainingAccounts([
            { pubkey: someRolePda, isWritable: true, isSigner: false },
          ])
          .signers([otherUser])
          .rpc();
        expect.fail("Expected update_roles to fail for non-master");
      } catch (err: unknown) {
        const msg = (err as { message?: string })?.message ?? String(err);
        expect(msg).to.match(
          /AccountNotInitialized|constraint|invalid account/,
        );
      }
    });
  });

  describe("transfer_authority", () => {
    let mintPda: anchor.web3.PublicKey;
    let masterRolePda: anchor.web3.PublicKey;
    let newMasterRolePda: anchor.web3.PublicKey;

    before(async () => {
      mintPda = ctx.mintTs1Pk;
      [masterRolePda] = getMasterRolePda(programId, mintPda, admin.publicKey);
      [newMasterRolePda] = getMasterRolePda(
        programId,
        mintPda,
        newMasterKeypair.publicKey,
      );
    });

    it("allows current master to transfer authority to new master", async () => {
      await program.methods
        .transferAuthority(newMasterKeypair.publicKey)
        .accountsStrict({
          master: admin.publicKey,
          mint: mintPda,
          masterRole: masterRolePda,
          newMasterRole: newMasterRolePda,
          eventAuthority: getEventAuthorityPda(programId),
          program: program.programId,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();

      const newRoleAccount = await program.account.roleAccount.fetch(
        newMasterRolePda,
      );
      expect(newRoleAccount.bump).to.be.a("number");
    });

    it("rejects transfer_authority when non-master tries", async () => {
      const [nonExistentMasterRolePda] = getMasterRolePda(
        programId,
        mintPda,
        otherUser.publicKey,
      );
      const [newMasterRolePdaForOther] = getMasterRolePda(
        programId,
        mintPda,
        newMasterKeypair.publicKey,
      );
      try {
        await program.methods
          .transferAuthority(newMasterKeypair.publicKey)
          .accountsStrict({
            master: otherUser.publicKey,
            mint: mintPda,
            masterRole: nonExistentMasterRolePda,
            newMasterRole: newMasterRolePdaForOther,
            eventAuthority: getEventAuthorityPda(programId),
            program: program.programId,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .signers([otherUser])
          .rpc();
        expect.fail("Expected transfer_authority to fail for non-master");
      } catch (err: unknown) {
        const msg = (err as { message?: string })?.message ?? String(err);
        expect(msg).to.match(
          /AccountNotInitialized|constraint|invalid account/,
        );
      }
    });
  });
}
