import * as anchor from "@coral-xyz/anchor";
import {
  getConfigPda,
  getFreezeAuthorityPda,
  getMintAuthorityPda,
  getMinterAccountPda,
  getMasterRolePda,
  getPauseAuthorityPda,
  getSeizerAuthorityPda,
  getEventAuthorityPda,
} from "../helpers/pda";
import { TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import { expect } from "chai";
import type { SssContext } from "./context";

export function registerInitialize(ctx: SssContext): void {
  const { program, programId, admin } = ctx;

  describe("initialize", () => {
    it("correctly initializes config for SSS1 (Token-2022 base + Metaplex metadata)", async () => {
      const symbol = "TS12";
      const mint = anchor.web3.Keypair.generate();
      const mintPk = mint.publicKey;
      const [configPda] = getConfigPda(programId, mintPk);
      const [masterRolePda] = getMasterRolePda(programId, mintPk, admin.publicKey);
      const [mintAuthorityPda] = getMintAuthorityPda(programId, mintPk);
      const [freezeAuthorityPda] = getFreezeAuthorityPda(programId, mintPk);
      const [pauseAuthorityPda] = getPauseAuthorityPda(programId, mintPk);
      const [seizerAuthorityPda] = getSeizerAuthorityPda(programId, mintPk);
      const [minterAccountPda] = getMinterAccountPda(
        programId,
        mintPk,
        admin.publicKey,
      );

      const initialAllowance = 1_000_000;

      const initTx = await program.methods
        .initialize(
          { sss1: {} },
          "Test Stablecoin SSS1",
          symbol,
          "https://example.com/metadata.json",
          6,
          admin.publicKey,
          admin.publicKey,
          new anchor.BN(initialAllowance),
          null,
          null,
          null,
        )
        .accountsStrict({
          admin: admin.publicKey,
          mint: mintPk,
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
        .signers([mint])
        .rpc();

      expect(initTx).to.be.a("string");

      const configAccount = await program.account.stablecoinConfig.fetch(
        configPda,
      );
      expect(configAccount.standard).to.deep.equal({ sss1: {} });
      expect(configAccount.name).to.equal("Test Stablecoin SSS1");
      expect(configAccount.symbol).to.equal(symbol);
      expect(configAccount.uri).to.equal("https://example.com/metadata.json");
      expect(configAccount.decimals).to.equal(6);
      expect(configAccount.enablePermanentDelegate).to.equal(false);
      expect(configAccount.enableTransferHook).to.equal(false);
      expect(configAccount.defaultAccountFrozen).to.equal(false);

      const masterRoleAccount =
        await program.account.roleAccount.fetch(masterRolePda);
      expect(masterRoleAccount.bump).to.be.a("number");

      const minterAccount = await program.account.minterAccount.fetch(
        minterAccountPda,
      );
      expect(minterAccount.allowance.toNumber()).to.equal(initialAllowance);
      expect(minterAccount.minted.toNumber()).to.equal(0);
    });

    it("correctly initializes config for SSS2 (SPL Token-2022)", async () => {
      const symbol = "TS22";
      const mint = anchor.web3.Keypair.generate();
      const mintPk = mint.publicKey;
      const [configPda] = getConfigPda(programId, mintPk);
      const [masterRolePda] = getMasterRolePda(programId, mintPk, admin.publicKey);
      const [mintAuthorityPda] = getMintAuthorityPda(programId, mintPk);
      const [freezeAuthorityPda] = getFreezeAuthorityPda(programId, mintPk);
      const [pauseAuthorityPda] = getPauseAuthorityPda(programId, mintPk);
      const [seizerAuthorityPda] = getSeizerAuthorityPda(programId, mintPk);
      const [minterAccountPda] = getMinterAccountPda(
        programId,
        mintPk,
        admin.publicKey,
      );

      const initialAllowance = 2_000_000;

      const initTx = await program.methods
        .initialize(
          { sss2: {} },
          "Test Stablecoin SSS2",
          symbol,
          "https://example.com/metadata-2022.json",
          6,
          admin.publicKey,
          admin.publicKey,
          new anchor.BN(initialAllowance),
          true,
          false,
          false,
        )
        .accountsStrict({
          admin: admin.publicKey,
          mint: mintPk,
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
        .signers([mint])
        .rpc();

      expect(initTx).to.be.a("string");

      const configAccount = await program.account.stablecoinConfig.fetch(
        configPda,
      );
      expect(configAccount.standard).to.deep.equal({ sss2: {} });
      expect(configAccount.name).to.equal("Test Stablecoin SSS2");
      expect(configAccount.symbol).to.equal(symbol);
      expect(configAccount.uri).to.equal(
        "https://example.com/metadata-2022.json",
      );
      expect(configAccount.decimals).to.equal(6);
      expect(configAccount.enablePermanentDelegate).to.equal(true);
      expect(configAccount.enableTransferHook).to.equal(false);
      expect(configAccount.defaultAccountFrozen).to.equal(false);

      const masterRoleAccount =
        await program.account.roleAccount.fetch(masterRolePda);
      expect(masterRoleAccount.bump).to.be.a("number");

      const minterAccount = await program.account.minterAccount.fetch(
        minterAccountPda,
      );
      expect(minterAccount.allowance.toNumber()).to.equal(initialAllowance);
      expect(minterAccount.minted.toNumber()).to.equal(0);
    });
  });
}
