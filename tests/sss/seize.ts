import * as anchor from "@coral-xyz/anchor";
import {
  getConfigPda,
  getFreezeAuthorityPda,
  getMintAuthorityPda,
  getMinterAccountPda,
  getMasterRolePda,
  getPauseAuthorityPda,
  getRoleAccountPda,
  getSeizerAuthorityPda,
  getEventAuthorityPda,
} from "../helpers/pda";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
  TOKEN_2022_PROGRAM_ID,
} from "@solana/spl-token";
import { expect } from "chai";
import type { SssContext } from "./context";
import { SEIZER_ROLE } from "./context";

export function registerSeize(ctx: SssContext): void {
  const { program, programId, admin, provider, otherUser } = ctx;

  describe("seize", () => {
    let sss2MintPk: anchor.web3.PublicKey;
    let configPda: anchor.web3.PublicKey;
    let seizerAuthorityPda: anchor.web3.PublicKey;
    let seizerRolePda: anchor.web3.PublicKey;
    let fromAta: anchor.web3.PublicKey;
    let toAta: anchor.web3.PublicKey;

    before(async () => {
      const sss2Mint = anchor.web3.Keypair.generate();
      sss2MintPk = sss2Mint.publicKey;
      [configPda] = getConfigPda(programId, sss2MintPk);
      [seizerAuthorityPda] = getSeizerAuthorityPda(programId, sss2MintPk);
      [seizerRolePda] = getRoleAccountPda(
        programId,
        sss2MintPk,
        SEIZER_ROLE,
        admin.publicKey,
      );
      const [masterRolePda] = getMasterRolePda(
        programId,
        sss2MintPk,
        admin.publicKey,
      );
      const [mintAuthorityPda] = getMintAuthorityPda(programId, sss2MintPk);
      const [freezeAuthorityPda] = getFreezeAuthorityPda(programId, sss2MintPk);
      const [pauseAuthorityPda] = getPauseAuthorityPda(programId, sss2MintPk);
      const [minterAccountPda] = getMinterAccountPda(
        programId,
        sss2MintPk,
        admin.publicKey,
      );
      await program.methods
        .initialize(
          { sss2: {} },
          "SSS2 Seize Test",
          "TS2SEIZE",
          "https://example.com/sss2seize.json",
          6,
          admin.publicKey,
          admin.publicKey,
          new anchor.BN(1_000_000),
          true,
          false,
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
      await program.methods
        .updateRoles([
          {
            role: "seizer",
            oldKey: null,
            newKey: admin.publicKey,
            allowance: new anchor.BN(0),
          },
        ])
        .accountsStrict({
          master: admin.publicKey,
          mint: sss2MintPk,
          masterRole: masterRolePda,
          eventAuthority: getEventAuthorityPda(programId),
          program: program.programId,
          systemProgram: anchor.web3.SystemProgram.programId,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .remainingAccounts([
          { pubkey: seizerRolePda, isWritable: true, isSigner: false },
        ])
        .rpc();
      fromAta = getAssociatedTokenAddressSync(
        sss2MintPk,
        otherUser.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID,
      );
      toAta = getAssociatedTokenAddressSync(
        sss2MintPk,
        admin.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID,
      );
      const createFromIx = createAssociatedTokenAccountIdempotentInstruction(
        admin.publicKey,
        fromAta,
        otherUser.publicKey,
        sss2MintPk,
        TOKEN_2022_PROGRAM_ID,
      );
      const createToIx = createAssociatedTokenAccountIdempotentInstruction(
        admin.publicKey,
        toAta,
        admin.publicKey,
        sss2MintPk,
        TOKEN_2022_PROGRAM_ID,
      );
      await provider.sendAndConfirm(
        new anchor.web3.Transaction().add(createFromIx, createToIx),
        [],
        { commitment: "confirmed" },
      );
      await program.methods
        .mintTokens(new anchor.BN(50_000))
        .accountsStrict({
          minter: admin.publicKey,
          mint: sss2MintPk,
          to: fromAta,
          minterAccount: minterAccountPda,
          mintAuthority: mintAuthorityPda,
          eventAuthority: getEventAuthorityPda(programId),
          program: program.programId,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .rpc();
    });

    it("seizes tokens when SSS2, permanent delegate enabled, and seizer has role", async () => {
      const amount = 10_000;
      const tx = await program.methods
        .seize(new anchor.BN(amount))
        .accountsStrict({
          seizer: admin.publicKey,
          seizerAuthority: seizerAuthorityPda,
          seizerRole: seizerRolePda,
          stablecoinConfig: configPda,
          from: fromAta,
          to: toAta,
          mint: sss2MintPk,
          eventAuthority: getEventAuthorityPda(programId),
          program: program.programId,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .rpc();
      expect(tx).to.be.a("string");
    });

    it("throws InvalidAmount when amount is zero", async () => {
      try {
        await program.methods
          .seize(new anchor.BN(0))
          .accountsStrict({
            seizer: admin.publicKey,
            seizerAuthority: seizerAuthorityPda,
            seizerRole: seizerRolePda,
            stablecoinConfig: configPda,
            from: fromAta,
            to: toAta,
            mint: sss2MintPk,
            eventAuthority: getEventAuthorityPda(programId),
            program: program.programId,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .rpc();
        expect.fail("Expected seize to fail with InvalidAmount");
      } catch (err: unknown) {
        const msg = (err as { message?: string })?.message ?? String(err);
        expect(msg).to.match(
          /Amount must be greater than zero|0x1778|InvalidAmount/,
        );
      }
    });

    it("rejects seize when non-seizer tries", async () => {
      const [otherSeizerRolePda] = getRoleAccountPda(
        programId,
        sss2MintPk,
        SEIZER_ROLE,
        otherUser.publicKey,
      );
      try {
        await program.methods
          .seize(new anchor.BN(1))
          .accountsStrict({
            seizer: otherUser.publicKey,
            seizerAuthority: seizerAuthorityPda,
            seizerRole: otherSeizerRolePda,
            stablecoinConfig: configPda,
            from: fromAta,
            to: toAta,
            mint: sss2MintPk,
            eventAuthority: getEventAuthorityPda(programId),
            program: program.programId,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .signers([otherUser])
          .rpc();
        expect.fail("Expected seize to fail for non-seizer");
      } catch (err: unknown) {
        const msg = (err as { message?: string })?.message ?? String(err);
        expect(msg).to.match(
          /AccountNotInitialized|constraint|invalid account/,
        );
      }
    });
  });

  describe("seize errors (ComplianceNotEnabled / PermanentDelegateNotEnabled)", () => {
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
          "SSS1 Seize",
          "TS1S",
          "https://example.com/s1s.json",
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
      const [seizerRolePda] = getRoleAccountPda(
        programId,
        sss1Pk,
        SEIZER_ROLE,
        admin.publicKey,
      );
      await program.methods
        .updateRoles([
          {
            role: "seizer",
            oldKey: null,
            newKey: admin.publicKey,
            allowance: new anchor.BN(0),
          },
        ])
        .accountsStrict({
          master: admin.publicKey,
          mint: sss1Pk,
          masterRole: masterRolePda,
          eventAuthority: getEventAuthorityPda(programId),
          program: program.programId,
          systemProgram: anchor.web3.SystemProgram.programId,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .remainingAccounts([
          { pubkey: seizerRolePda, isWritable: true, isSigner: false },
        ])
        .rpc();
      const fromAta = getAssociatedTokenAddressSync(
        sss1Pk,
        otherUser.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID,
      );
      const toAta = getAssociatedTokenAddressSync(
        sss1Pk,
        admin.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID,
      );
      const createFromIx = createAssociatedTokenAccountIdempotentInstruction(
        admin.publicKey,
        fromAta,
        otherUser.publicKey,
        sss1Pk,
        TOKEN_2022_PROGRAM_ID,
      );
      const createToIx = createAssociatedTokenAccountIdempotentInstruction(
        admin.publicKey,
        toAta,
        admin.publicKey,
        sss1Pk,
        TOKEN_2022_PROGRAM_ID,
      );
      await provider.sendAndConfirm(
        new anchor.web3.Transaction().add(createFromIx, createToIx),
        [],
        { commitment: "confirmed" },
      );
      try {
        await program.methods
          .seize(new anchor.BN(1))
          .accountsStrict({
            seizer: admin.publicKey,
            seizerAuthority: seizerAuthorityPda,
            seizerRole: seizerRolePda,
            stablecoinConfig: sss1ConfigPda,
            from: fromAta,
            to: toAta,
            mint: sss1Pk,
            eventAuthority: getEventAuthorityPda(programId),
            program: program.programId,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .rpc();
        expect.fail("Expected seize to fail with ComplianceNotEnabled");
      } catch (err: unknown) {
        const msg = (err as { message?: string })?.message ?? String(err);
        expect(msg).to.match(
          /Compliance is not enabled|0x1770|ComplianceNotEnabled/,
        );
      }
    });

    it("throws PermanentDelegateNotEnabled when SSS2 but permanent delegate disabled", async () => {
      const sss2NoPdMint = anchor.web3.Keypair.generate();
      const sss2NoPdPk = sss2NoPdMint.publicKey;
      const [noPdConfigPda] = getConfigPda(programId, sss2NoPdPk);
      const [masterRolePda] = getMasterRolePda(
        programId,
        sss2NoPdPk,
        admin.publicKey,
      );
      const [mintAuthorityPda] = getMintAuthorityPda(programId, sss2NoPdPk);
      const [freezeAuthorityPda] = getFreezeAuthorityPda(programId, sss2NoPdPk);
      const [pauseAuthorityPda] = getPauseAuthorityPda(programId, sss2NoPdPk);
      const [seizerAuthorityPda] = getSeizerAuthorityPda(programId, sss2NoPdPk);
      const [minterAccountPda] = getMinterAccountPda(
        programId,
        sss2NoPdPk,
        admin.publicKey,
      );
      await program.methods
        .initialize(
          { sss2: {} },
          "SSS2 No PD",
          "TS2NPD",
          "https://example.com/sss2npd.json",
          6,
          admin.publicKey,
          admin.publicKey,
          new anchor.BN(100),
          false,
          true,
          false,
        )
        .accountsStrict({
          admin: admin.publicKey,
          mint: sss2NoPdPk,
          config: noPdConfigPda,
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
        .signers([sss2NoPdMint])
        .rpc();
      const [seizerRolePda] = getRoleAccountPda(
        programId,
        sss2NoPdPk,
        SEIZER_ROLE,
        admin.publicKey,
      );
      await program.methods
        .updateRoles([
          {
            role: "seizer",
            oldKey: null,
            newKey: admin.publicKey,
            allowance: new anchor.BN(0),
          },
        ])
        .accountsStrict({
          master: admin.publicKey,
          mint: sss2NoPdPk,
          masterRole: masterRolePda,
          eventAuthority: getEventAuthorityPda(programId),
          program: program.programId,
          systemProgram: anchor.web3.SystemProgram.programId,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .remainingAccounts([
          { pubkey: seizerRolePda, isWritable: true, isSigner: false },
        ])
        .rpc();
      const fromAta = getAssociatedTokenAddressSync(
        sss2NoPdPk,
        otherUser.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID,
      );
      const toAta = getAssociatedTokenAddressSync(
        sss2NoPdPk,
        admin.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID,
      );
      const createFromIx = createAssociatedTokenAccountIdempotentInstruction(
        admin.publicKey,
        fromAta,
        otherUser.publicKey,
        sss2NoPdPk,
        TOKEN_2022_PROGRAM_ID,
      );
      const createToIx = createAssociatedTokenAccountIdempotentInstruction(
        admin.publicKey,
        toAta,
        admin.publicKey,
        sss2NoPdPk,
        TOKEN_2022_PROGRAM_ID,
      );
      await provider.sendAndConfirm(
        new anchor.web3.Transaction().add(createFromIx, createToIx),
        [],
        { commitment: "confirmed" },
      );
      try {
        await program.methods
          .seize(new anchor.BN(1))
          .accountsStrict({
            seizer: admin.publicKey,
            seizerAuthority: seizerAuthorityPda,
            seizerRole: seizerRolePda,
            stablecoinConfig: noPdConfigPda,
            from: fromAta,
            to: toAta,
            mint: sss2NoPdPk,
            eventAuthority: getEventAuthorityPda(programId),
            program: program.programId,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .rpc();
        expect.fail("Expected seize to fail with PermanentDelegateNotEnabled");
      } catch (err: unknown) {
        const msg = (err as { message?: string })?.message ?? String(err);
        expect(msg).to.match(
          /Permanent delegate is not enabled|0x1777|PermanentDelegateNotEnabled/,
        );
      }
    });
  });
}
