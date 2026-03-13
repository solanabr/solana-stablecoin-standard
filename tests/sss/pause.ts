import * as anchor from "@coral-xyz/anchor";
import {
  getEventAuthorityPda,
  getMasterRolePda,
  getMinterAccountPda,
  getMintAuthorityPda,
  getPauseAuthorityPda,
  getRoleAccountPda,
} from "../helpers/pda";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAccount,
  getAssociatedTokenAddressSync,
  getMint,
  TOKEN_2022_PROGRAM_ID,
} from "@solana/spl-token";
import { expect } from "chai";
import type { SssContext } from "./context";
import { PAUSER_ROLE } from "./context";

export function registerPause(ctx: SssContext): void {
  const { program, programId, admin, otherUser, provider } = ctx;

  describe("pause / unpause (SSS2)", () => {
    let mintPda: anchor.web3.PublicKey;
    let pauseAuthorityPda: anchor.web3.PublicKey;

    before(async () => {
      mintPda = ctx.mintTs2Pk;
      [pauseAuthorityPda] = getPauseAuthorityPda(programId, mintPda);
    });

    it("allows pauser to pause after role is granted", async () => {
      const [pauserRolePda] = getRoleAccountPda(
        programId,
        mintPda,
        PAUSER_ROLE,
        admin.publicKey,
      );
      const [masterRolePda] = getMasterRolePda(
        programId,
        mintPda,
        admin.publicKey,
      );
      await program.methods
        .updateRoles([
          {
            role: "pauser",
            oldKey: null,
            newKey: admin.publicKey,
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
          { pubkey: pauserRolePda, isWritable: true, isSigner: false },
        ])
        .rpc();

      await program.methods
        .pause()
        .accountsStrict({
          pauser: admin.publicKey,
          mint: mintPda,
          pauserRole: pauserRolePda,
          pauseAuthority: pauseAuthorityPda,
          eventAuthority: getEventAuthorityPda(programId),
          program: program.programId,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .rpc();
    });

    it("allows pauser to unpause", async () => {
      const [pauserRolePda] = getRoleAccountPda(
        programId,
        mintPda,
        PAUSER_ROLE,
        admin.publicKey,
      );
      await program.methods
        .unpause()
        .accountsStrict({
          pauser: admin.publicKey,
          mint: mintPda,
          pauserRole: pauserRolePda,
          pauseAuthority: pauseAuthorityPda,
          eventAuthority: getEventAuthorityPda(programId),
          program: program.programId,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .rpc();
    });

    it("rejects pause when non-pauser tries to pause", async () => {
      const [otherPauserRolePda] = getRoleAccountPda(
        programId,
        mintPda,
        PAUSER_ROLE,
        otherUser.publicKey,
      );
      try {
        await program.methods
          .pause()
          .accountsStrict({
            pauser: otherUser.publicKey,
            mint: mintPda,
            pauserRole: otherPauserRolePda,
            pauseAuthority: pauseAuthorityPda,
            eventAuthority: getEventAuthorityPda(programId),
            program: program.programId,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .signers([otherUser])
          .rpc();
        expect.fail("Expected pause to fail for non-pauser");
      } catch (err: unknown) {
        const msg = (err as { message?: string })?.message ?? String(err);
        expect(msg).to.match(
          /AccountNotInitialized|constraint|invalid account/,
        );
      }
    });

    it("blocks token transfer while paused and allows after unpause", async () => {
      const senderAta = getAssociatedTokenAddressSync(
        mintPda,
        admin.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID,
      );
      const receiverAta = getAssociatedTokenAddressSync(
        mintPda,
        otherUser.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID,
      );
      const createSenderAtaIx = createAssociatedTokenAccountIdempotentInstruction(
        admin.publicKey,
        senderAta,
        admin.publicKey,
        mintPda,
        TOKEN_2022_PROGRAM_ID,
      );
      const createReceiverAtaIx = createAssociatedTokenAccountIdempotentInstruction(
        admin.publicKey,
        receiverAta,
        otherUser.publicKey,
        mintPda,
        TOKEN_2022_PROGRAM_ID,
      );
      await provider.sendAndConfirm(
        new anchor.web3.Transaction().add(createSenderAtaIx, createReceiverAtaIx),
      );

      const [minterAccountPda] = getMinterAccountPda(
        programId,
        mintPda,
        admin.publicKey,
      );
      const [mintAuthorityPda] = getMintAuthorityPda(programId, mintPda);
      await program.methods
        .mintTokens(new anchor.BN(10_000))
        .accountsStrict({
          minter: admin.publicKey,
          mint: mintPda,
          to: senderAta,
          minterAccount: minterAccountPda,
          mintAuthority: mintAuthorityPda,
          eventAuthority: getEventAuthorityPda(programId),
          program: program.programId,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .rpc();

      const [pauserRolePda] = getRoleAccountPda(
        programId,
        mintPda,
        PAUSER_ROLE,
        admin.publicKey,
      );
      await program.methods
        .pause()
        .accountsStrict({
          pauser: admin.publicKey,
          mint: mintPda,
          pauserRole: pauserRolePda,
          pauseAuthority: pauseAuthorityPda,
          eventAuthority: getEventAuthorityPda(programId),
          program: program.programId,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .rpc();

      const mintInfo = await getMint(
        provider.connection,
        mintPda,
        "confirmed",
        TOKEN_2022_PROGRAM_ID,
      );
      const transferIx = createTransferCheckedInstruction(
        senderAta,
        mintPda,
        receiverAta,
        admin.publicKey,
        1,
        mintInfo.decimals,
        [],
        TOKEN_2022_PROGRAM_ID,
      );
      try {
        await provider.sendAndConfirm(new anchor.web3.Transaction().add(transferIx));
        expect.fail("Expected transfer to fail while mint is paused");
      } catch (err: unknown) {
        const msg = (err as { message?: string })?.message ?? String(err);
        expect(msg).to.match(/paused|custom program error/i);
      }

      await program.methods
        .unpause()
        .accountsStrict({
          pauser: admin.publicKey,
          mint: mintPda,
          pauserRole: pauserRolePda,
          pauseAuthority: pauseAuthorityPda,
          eventAuthority: getEventAuthorityPda(programId),
          program: program.programId,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .rpc();

      const beforeReceiver = await getAccount(
        provider.connection,
        receiverAta,
        "confirmed",
        TOKEN_2022_PROGRAM_ID,
      );
      await provider.sendAndConfirm(new anchor.web3.Transaction().add(transferIx));
      const afterReceiver = await getAccount(
        provider.connection,
        receiverAta,
        "confirmed",
        TOKEN_2022_PROGRAM_ID,
      );
      expect(Number(afterReceiver.amount)).to.equal(Number(beforeReceiver.amount) + 1);
    });
  });
}
