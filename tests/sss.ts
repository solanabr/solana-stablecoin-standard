/**
 * SSS test suite – main runner.
 *
 * Shared setup (provider, program, TS1/TS2 mints) runs once; then each part
 * registers its describe blocks and uses the shared context.
 *
 * Parts (in tests/sss/):
 * - context.ts     – SssContext type and role constants
 * - initialize.ts  – initialize (SSS1 & SSS2)
 * - token-operations.ts – mint, burn, freeze_account, thaw_account
 * - pause.ts      – pause / unpause (SSS2), pause on SSS1 (MintNotPausable)
 * - rbac.ts       – update_minter, update_roles, transfer_authority
 * - blacklist.ts  – add_to_blacklist, remove_from_blacklist
 * - seize.ts      – seize, seize errors (ComplianceNotEnabled / PermanentDelegateNotEnabled)
 */

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Sss } from "../target/types/sss";
import {
  getConfigPda,
  getFreezeAuthorityPda,
  getMintAuthorityPda,
  getMinterAccountPda,
  getMasterRolePda,
  getPauseAuthorityPda,
  getSeizerAuthorityPda,
  getEventAuthorityPda,
} from "./helpers/pda";
import { TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import type { SssContext } from "./sss/context";
import { registerInitialize } from "./sss/initialize";
import { registerTokenOperations } from "./sss/token-operations";
import { registerPause } from "./sss/pause";
import { registerRbac } from "./sss/rbac";
import { registerBlacklist } from "./sss/blacklist";
import { registerSeize } from "./sss/seize";

describe("sss", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Sss as Program<Sss>;
  const programId = program.programId;
  const admin = provider.wallet;
  const otherUser = anchor.web3.Keypair.generate();
  const newMasterKeypair = anchor.web3.Keypair.generate();

  const ctx: SssContext = {
    provider,
    program,
    programId,
    admin: admin as SssContext["admin"],
    otherUser,
    newMasterKeypair,
    mintTs1Pk: new anchor.web3.PublicKey(new Uint8Array(32)),
    mintTs2Pk: new anchor.web3.PublicKey(new Uint8Array(32)),
  };

  before(async () => {
    await provider.connection.requestAirdrop(
      otherUser.publicKey,
      10 * anchor.web3.LAMPORTS_PER_SOL,
    );
    await provider.connection.requestAirdrop(
      newMasterKeypair.publicKey,
      10 * anchor.web3.LAMPORTS_PER_SOL,
    );

    const mintTs1 = anchor.web3.Keypair.generate();
    const mintTs2 = anchor.web3.Keypair.generate();
    ctx.mintTs1Pk = mintTs1.publicKey;
    ctx.mintTs2Pk = mintTs2.publicKey;

    const [configTs1] = getConfigPda(programId, ctx.mintTs1Pk);
    const [masterRoleTs1] = getMasterRolePda(
      programId,
      ctx.mintTs1Pk,
      admin.publicKey,
    );
    const [mintAuthorityTs1] = getMintAuthorityPda(programId, ctx.mintTs1Pk);
    const [freezeAuthorityTs1] = getFreezeAuthorityPda(
      programId,
      ctx.mintTs1Pk,
    );
    const [pauseAuthorityTs1] = getPauseAuthorityPda(programId, ctx.mintTs1Pk);
    const [seizerAuthorityTs1] = getSeizerAuthorityPda(
      programId,
      ctx.mintTs1Pk,
    );
    const [minterAccountTs1] = getMinterAccountPda(
      programId,
      ctx.mintTs1Pk,
      admin.publicKey,
    );
    await program.methods
      .initialize(
        { sss1: {} },
        "Test Stablecoin TS1",
        "TS1",
        "https://example.com/ts1.json",
        6,
        admin.publicKey,
        admin.publicKey,
        new anchor.BN(2_000_000),
        null,
        null,
        null,
      )
      .accountsStrict({
        admin: admin.publicKey,
        mint: ctx.mintTs1Pk,
        config: configTs1,
        mintAuthority: mintAuthorityTs1,
        freezeAuthority: freezeAuthorityTs1,
        pauseAuthority: pauseAuthorityTs1,
        seizerAuthority: seizerAuthorityTs1,
        masterRole: masterRoleTs1,
        minterAccount: minterAccountTs1,
        eventAuthority: getEventAuthorityPda(programId),
        program: program.programId,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .signers([mintTs1])
      .rpc();

    const [configTs2] = getConfigPda(programId, ctx.mintTs2Pk);
    const [masterRoleTs2] = getMasterRolePda(
      programId,
      ctx.mintTs2Pk,
      admin.publicKey,
    );
    const [mintAuthorityTs2] = getMintAuthorityPda(programId, ctx.mintTs2Pk);
    const [freezeAuthorityTs2] = getFreezeAuthorityPda(
      programId,
      ctx.mintTs2Pk,
    );
    const [pauseAuthorityTs2] = getPauseAuthorityPda(programId, ctx.mintTs2Pk);
    const [seizerAuthorityTs2] = getSeizerAuthorityPda(
      programId,
      ctx.mintTs2Pk,
    );
    const [minterAccountTs2] = getMinterAccountPda(
      programId,
      ctx.mintTs2Pk,
      admin.publicKey,
    );
    await program.methods
      .initialize(
        { sss2: {} },
        "Test Stablecoin TS2",
        "TS2",
        "https://example.com/ts2.json",
        6,
        admin.publicKey,
        admin.publicKey,
        new anchor.BN(2_000_000),
        true,
        false,
        false,
      )
      .accountsStrict({
        admin: admin.publicKey,
        mint: ctx.mintTs2Pk,
        config: configTs2,
        mintAuthority: mintAuthorityTs2,
        freezeAuthority: freezeAuthorityTs2,
        pauseAuthority: pauseAuthorityTs2,
        seizerAuthority: seizerAuthorityTs2,
        masterRole: masterRoleTs2,
        minterAccount: minterAccountTs2,
        eventAuthority: getEventAuthorityPda(programId),
        program: program.programId,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .signers([mintTs2])
      .rpc();
  });

  registerInitialize(ctx);
  registerTokenOperations(ctx);
  registerPause(ctx);
  registerRbac(ctx);
  registerBlacklist(ctx);
  registerSeize(ctx);
});
