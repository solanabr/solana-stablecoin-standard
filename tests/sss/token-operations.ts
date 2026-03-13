import * as anchor from "@coral-xyz/anchor";
import {
  getFreezeAuthorityPda,
  getMintAuthorityPda,
  getMinterAccountPda,
  getMasterRolePda,
  getRoleAccountPda,
  getEventAuthorityPda,
} from "../helpers/pda";
import {
  createTransferCheckedInstruction,
  createAssociatedTokenAccountIdempotentInstruction,
  getAccount,
  getMint,
  getAssociatedTokenAddressSync,
  TOKEN_2022_PROGRAM_ID,
} from "@solana/spl-token";
import { expect } from "chai";
import type { SssContext } from "./context";
import { BURNER_ROLE } from "./context";

export function registerTokenOperations(ctx: SssContext): void {
  const { program, programId, admin, provider, otherUser } = ctx;

  describe("mint", () => {
    let mintPda: anchor.web3.PublicKey;
    let minterAccountPda: anchor.web3.PublicKey;
    let mintAuthorityPda: anchor.web3.PublicKey;
    let adminAta: anchor.web3.PublicKey;
    let otherUserAta: anchor.web3.PublicKey;

    before(async () => {
      mintPda = ctx.mintTs1Pk;
      [minterAccountPda] = getMinterAccountPda(
        programId,
        mintPda,
        admin.publicKey,
      );
      [mintAuthorityPda] = getMintAuthorityPda(programId, mintPda);
      adminAta = getAssociatedTokenAddressSync(
        mintPda,
        admin.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID,
      );
      otherUserAta = getAssociatedTokenAddressSync(
        mintPda,
        otherUser.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID,
      );
      const createAdminAtaIx =
        createAssociatedTokenAccountIdempotentInstruction(
          admin.publicKey,
          adminAta,
          admin.publicKey,
          mintPda,
          TOKEN_2022_PROGRAM_ID,
        );
      const createOtherAtaIx =
        createAssociatedTokenAccountIdempotentInstruction(
          admin.publicKey,
          otherUserAta,
          otherUser.publicKey,
          mintPda,
          TOKEN_2022_PROGRAM_ID,
        );
      const tx = new anchor.web3.Transaction().add(
        createAdminAtaIx,
        createOtherAtaIx,
      );
      await provider.sendAndConfirm(tx, [], { commitment: "confirmed" });
    });

    it("allows minter to mint tokens", async () => {
      const amount = 100_000;
      const beforeMint = await getMint(
        provider.connection,
        mintPda,
        "confirmed",
        TOKEN_2022_PROGRAM_ID,
      );
      await program.methods
        .mintTokens(new anchor.BN(amount))
        .accountsStrict({
          minter: admin.publicKey,
          mint: mintPda,
          to: adminAta,
          minterAccount: minterAccountPda,
          mintAuthority: mintAuthorityPda,
          eventAuthority: getEventAuthorityPda(programId),
          program: program.programId,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .rpc();

      const minterAccount = await program.account.minterAccount.fetch(
        minterAccountPda,
      );
      expect(minterAccount.minted.toNumber()).to.equal(amount);
      const adminAccount = await getAccount(
        provider.connection,
        adminAta,
        "confirmed",
        TOKEN_2022_PROGRAM_ID,
      );
      const afterMint = await getMint(
        provider.connection,
        mintPda,
        "confirmed",
        TOKEN_2022_PROGRAM_ID,
      );
      expect(Number(adminAccount.amount)).to.be.greaterThanOrEqual(amount);
      expect(Number(afterMint.supply)).to.equal(Number(beforeMint.supply) + amount);
    });

    it("rejects mint when non-minter tries to mint", async () => {
      const [otherMinterAccountPda] = getMinterAccountPda(
        programId,
        mintPda,
        otherUser.publicKey,
      );
      try {
        await program.methods
          .mintTokens(new anchor.BN(1))
          .accountsStrict({
            minter: otherUser.publicKey,
            mint: mintPda,
            to: otherUserAta,
            minterAccount: otherMinterAccountPda,
            mintAuthority: mintAuthorityPda,
            eventAuthority: getEventAuthorityPda(programId),
            program: program.programId,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .signers([otherUser])
          .rpc();
        expect.fail("Expected mint to fail for non-minter");
      } catch (err: unknown) {
        const msg = (err as { message?: string })?.message ?? String(err);
        expect(msg).to.match(
          /AccountNotInitialized|constraint|invalid account/,
        );
      }
    });

    it("rejects mint when amount exceeds allowance", async () => {
      const minterAccount = await program.account.minterAccount.fetch(
        minterAccountPda,
      );
      const overAllowance = minterAccount.allowance.toNumber() + 1;
      try {
        await program.methods
          .mintTokens(new anchor.BN(overAllowance))
          .accountsStrict({
            minter: admin.publicKey,
            mint: mintPda,
            to: adminAta,
            minterAccount: minterAccountPda,
            mintAuthority: mintAuthorityPda,
            eventAuthority: getEventAuthorityPda(programId),
            program: program.programId,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .rpc();
        expect.fail("Expected mint to fail when quota exceeded");
      } catch (err: unknown) {
        const msg = (err as { message?: string })?.message ?? String(err);
        expect(msg).to.match(/QuotaExceeded|0x1771|quota/);
      }
    });
  });

  describe("burn", () => {
    let mintPda: anchor.web3.PublicKey;
    let adminAta: anchor.web3.PublicKey;

    before(async () => {
      mintPda = ctx.mintTs1Pk;
      adminAta = getAssociatedTokenAddressSync(
        mintPda,
        admin.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID,
      );
    });

    it("allows burner to burn own tokens after role is granted", async () => {
      const [burnerRolePda] = getRoleAccountPda(
        programId,
        mintPda,
        BURNER_ROLE,
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
            role: "burner",
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
          { pubkey: burnerRolePda, isWritable: true, isSigner: false },
        ])
        .rpc();

      const burnAmount = 10_000;
      const beforeMint = await getMint(
        provider.connection,
        mintPda,
        "confirmed",
        TOKEN_2022_PROGRAM_ID,
      );
      const beforeAccount = await getAccount(
        provider.connection,
        adminAta,
        "confirmed",
        TOKEN_2022_PROGRAM_ID,
      );
      await program.methods
        .burnTokens(new anchor.BN(burnAmount))
        .accountsStrict({
          burner: admin.publicKey,
          mint: mintPda,
          from: adminAta,
          burnerRole: burnerRolePda,
          eventAuthority: getEventAuthorityPda(programId),
          program: program.programId,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .rpc();
      const afterMint = await getMint(
        provider.connection,
        mintPda,
        "confirmed",
        TOKEN_2022_PROGRAM_ID,
      );
      const afterAccount = await getAccount(
        provider.connection,
        adminAta,
        "confirmed",
        TOKEN_2022_PROGRAM_ID,
      );
      expect(Number(afterMint.supply)).to.equal(Number(beforeMint.supply) - burnAmount);
      expect(Number(afterAccount.amount)).to.equal(
        Number(beforeAccount.amount) - burnAmount,
      );
    });

    it("rejects burn when non-burner tries to burn", async () => {
      const otherUserAta = getAssociatedTokenAddressSync(
        mintPda,
        otherUser.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID,
      );
      const [burnerRolePdaOther] = getRoleAccountPda(
        programId,
        mintPda,
        BURNER_ROLE,
        otherUser.publicKey,
      );
      try {
        await program.methods
          .burnTokens(new anchor.BN(1))
          .accountsStrict({
            burner: otherUser.publicKey,
            mint: mintPda,
            from: otherUserAta,
            burnerRole: burnerRolePdaOther,
            eventAuthority: getEventAuthorityPda(programId),
            program: program.programId,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .signers([otherUser])
          .rpc();
        expect.fail("Expected burn to fail for non-burner");
      } catch (err: unknown) {
        const msg = (err as { message?: string })?.message ?? String(err);
        expect(msg).to.match(
          /AccountNotInitialized|constraint|invalid account/,
        );
      }
    });
  });

  describe("freeze_account", () => {
    let mintPda: anchor.web3.PublicKey;
    let freezeAuthorityPda: anchor.web3.PublicKey;
    let masterRolePda: anchor.web3.PublicKey;
    let otherUserAta: anchor.web3.PublicKey;

    before(async () => {
      mintPda = ctx.mintTs1Pk;
      [freezeAuthorityPda] = getFreezeAuthorityPda(programId, mintPda);
      [masterRolePda] = getMasterRolePda(programId, mintPda, admin.publicKey);
      otherUserAta = getAssociatedTokenAddressSync(
        mintPda,
        otherUser.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID,
      );
    });

    it("allows master to freeze a token account", async () => {
      await program.methods
        .freezeAccount()
        .accountsStrict({
          master: admin.publicKey,
          mint: mintPda,
          ataToFreeze: otherUserAta,
          masterRole: masterRolePda,
          freezeAuthority: freezeAuthorityPda,
          eventAuthority: getEventAuthorityPda(programId),
          program: program.programId,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .rpc();
      const frozen = await getAccount(
        provider.connection,
        otherUserAta,
        "confirmed",
        TOKEN_2022_PROGRAM_ID,
      );
      expect(frozen.isFrozen).to.equal(true);
    });

    it("rejects freeze when non-master tries to freeze", async () => {
      const [otherMasterRolePda] = getMasterRolePda(
        programId,
        mintPda,
        otherUser.publicKey,
      );
      const adminAta = getAssociatedTokenAddressSync(
        mintPda,
        admin.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID,
      );
      try {
        await program.methods
          .freezeAccount()
          .accountsStrict({
            master: otherUser.publicKey,
            mint: mintPda,
            ataToFreeze: adminAta,
            masterRole: otherMasterRolePda,
            freezeAuthority: freezeAuthorityPda,
            eventAuthority: getEventAuthorityPda(programId),
            program: program.programId,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .signers([otherUser])
          .rpc();
        expect.fail("Expected freeze to fail for non-master");
      } catch (err: unknown) {
        const msg = (err as { message?: string })?.message ?? String(err);
        expect(msg).to.match(
          /AccountNotInitialized|constraint|invalid account/,
        );
      }
    });
  });

  describe("thaw_account", () => {
    let mintPda: anchor.web3.PublicKey;
    let freezeAuthorityPda: anchor.web3.PublicKey;
    let masterRolePda: anchor.web3.PublicKey;
    let otherUserAta: anchor.web3.PublicKey;

    before(async () => {
      mintPda = ctx.mintTs1Pk;
      [freezeAuthorityPda] = getFreezeAuthorityPda(programId, mintPda);
      [masterRolePda] = getMasterRolePda(programId, mintPda, admin.publicKey);
      otherUserAta = getAssociatedTokenAddressSync(
        mintPda,
        otherUser.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID,
      );
    });

    it("allows master to thaw a token account", async () => {
      await program.methods
        .thawAccount()
        .accountsStrict({
          master: admin.publicKey,
          mint: mintPda,
          ataToThaw: otherUserAta,
          masterRole: masterRolePda,
          freezeAuthority: freezeAuthorityPda,
          eventAuthority: getEventAuthorityPda(programId),
          program: program.programId,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .rpc();
      const thawed = await getAccount(
        provider.connection,
        otherUserAta,
        "confirmed",
        TOKEN_2022_PROGRAM_ID,
      );
      expect(thawed.isFrozen).to.equal(false);
    });

    it("rejects thaw when non-master tries to thaw", async () => {
      const [otherMasterRolePda] = getMasterRolePda(
        programId,
        mintPda,
        otherUser.publicKey,
      );
      const adminAta = getAssociatedTokenAddressSync(
        mintPda,
        admin.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID,
      );
      try {
        await program.methods
          .thawAccount()
          .accountsStrict({
            master: otherUser.publicKey,
            mint: mintPda,
            ataToThaw: adminAta,
            masterRole: otherMasterRolePda,
            freezeAuthority: freezeAuthorityPda,
            eventAuthority: getEventAuthorityPda(programId),
            program: program.programId,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .signers([otherUser])
          .rpc();
        expect.fail("Expected thaw to fail for non-master");
      } catch (err: unknown) {
        const msg = (err as { message?: string })?.message ?? String(err);
        expect(msg).to.match(
          /AccountNotInitialized|constraint|invalid account/,
        );
      }
    });
  });

  describe("transfer behavior with freeze/thaw", () => {
    let mintPda: anchor.web3.PublicKey;
    let senderAta: anchor.web3.PublicKey;
    let receiverAta: anchor.web3.PublicKey;
    let freezeAuthorityPda: anchor.web3.PublicKey;
    let masterRolePda: anchor.web3.PublicKey;

    before(async () => {
      mintPda = ctx.mintTs1Pk;
      senderAta = getAssociatedTokenAddressSync(
        mintPda,
        admin.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID,
      );
      receiverAta = getAssociatedTokenAddressSync(
        mintPda,
        otherUser.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID,
      );
      [freezeAuthorityPda] = getFreezeAuthorityPda(programId, mintPda);
      [masterRolePda] = getMasterRolePda(programId, mintPda, admin.publicKey);
    });

    it("blocks transfer while frozen, then allows after thaw", async () => {
      await program.methods
        .freezeAccount()
        .accountsStrict({
          master: admin.publicKey,
          mint: mintPda,
          ataToFreeze: senderAta,
          masterRole: masterRolePda,
          freezeAuthority: freezeAuthorityPda,
          eventAuthority: getEventAuthorityPda(programId),
          program: program.programId,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .rpc();

      const mintAccount = await getMint(
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
        mintAccount.decimals,
        [],
        TOKEN_2022_PROGRAM_ID,
      );
      try {
        await provider.sendAndConfirm(new anchor.web3.Transaction().add(transferIx));
        expect.fail("Expected transfer to fail while sender ATA is frozen");
      } catch (err: unknown) {
        const msg = (err as { message?: string })?.message ?? String(err);
        expect(msg).to.match(/frozen|account state|custom program error/i);
      }

      await program.methods
        .thawAccount()
        .accountsStrict({
          master: admin.publicKey,
          mint: mintPda,
          ataToThaw: senderAta,
          masterRole: masterRolePda,
          freezeAuthority: freezeAuthorityPda,
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
