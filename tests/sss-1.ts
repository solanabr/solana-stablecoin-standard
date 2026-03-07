/**
 * SSS-1 Integration Tests
 * Full lifecycle: initialize → update_minter → mint → transfer → freeze → thaw → burn → pause
 */
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  getAccount,
  getMint,
  transfer,
  createTransferCheckedInstruction,
} from "@solana/spl-token";
import * as assert from "assert";
import {
  airdrop,
  makeProgram,
  createAta,
  assertThrows,
  SSS_PROGRAM_ID,
} from "./helpers";
import { findConfigPda, findMinterPda, findBlacklistPda } from "../sdk/core/src/pda";

describe("SSS-1 Minimal Stablecoin", () => {
  const connection = new Connection("http://localhost:8899", "confirmed");

  let authority: Keypair;
  let minterKp: Keypair;
  let alice: Keypair;
  let bob: Keypair;

  let mintKp: Keypair;
  let program: Program;
  let configPda: PublicKey;
  let configBump: number;

  before(async () => {
    authority = Keypair.generate();
    minterKp = Keypair.generate();
    alice = Keypair.generate();
    bob = Keypair.generate();

    await Promise.all([
      airdrop(connection, authority.publicKey),
      airdrop(connection, minterKp.publicKey),
      airdrop(connection, alice.publicKey),
      airdrop(connection, bob.publicKey),
    ]);

    program = makeProgram(connection, authority);
    mintKp = Keypair.generate();
    [configPda, configBump] = findConfigPda(mintKp.publicKey, SSS_PROGRAM_ID);
  });

  it("initializes SSS-1 stablecoin", async () => {
    await program.methods
      .initialize({
        name: "Test USD",
        symbol: "TUSD",
        uri: "https://example.com/tusd.json",
        decimals: 6,
        enablePermanentDelegate: false,
        enableTransferHook: false,
        defaultAccountFrozen: false,
        transferHookProgramId: null,
        burner: null,
        pauser: null,
        blacklister: null,
        seizer: null,
      })
      .accounts({
        authority: authority.publicKey,
        mint: mintKp.publicKey,
        config: configPda,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .signers([authority, mintKp])
      .rpc();

    const config = await program.account.stablecoinConfig.fetch(configPda);
    assert.equal(config.name, "Test USD");
    assert.equal(config.symbol, "TUSD");
    assert.equal(config.decimals, 6);
    assert.equal(config.preset, 1); // SSS-1
    assert.equal(config.paused, false);
    assert.equal(config.enableTransferHook, false);
    assert.ok(config.authority.equals(authority.publicKey));
  });

  it("adds a minter with quota", async () => {
    const [minterInfoPda] = findMinterPda(
      mintKp.publicKey,
      minterKp.publicKey,
      SSS_PROGRAM_ID
    );

    await program.methods
      .updateMinter({
        minter: minterKp.publicKey,
        quota: new anchor.BN(1_000_000_000), // 1000 TUSD
        active: true,
      })
      .accounts({
        authority: authority.publicKey,
        config: configPda,
        minterInfo: minterInfoPda,
        systemProgram: SystemProgram.programId,
      })
      .signers([authority])
      .rpc();

    const info = await program.account.minterInfo.fetch(minterInfoPda);
    assert.equal(info.active, true);
    assert.ok(info.quota.eq(new anchor.BN(1_000_000_000)));
  });

  it("mints tokens to alice", async () => {
    const [minterInfoPda] = findMinterPda(
      mintKp.publicKey,
      minterKp.publicKey,
      SSS_PROGRAM_ID
    );
    const aliceAta = getAssociatedTokenAddressSync(
      mintKp.publicKey,
      alice.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID
    );

    await program.methods
      .mintTokens(new anchor.BN(500_000_000)) // 500 TUSD
      .accounts({
        minter: minterKp.publicKey,
        config: configPda,
        minterInfo: minterInfoPda,
        mint: mintKp.publicKey,
        recipientTokenAccount: aliceAta,
        recipient: alice.publicKey,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([minterKp])
      .rpc();

    const aliceAccount = await getAccount(
      connection,
      aliceAta,
      "confirmed",
      TOKEN_2022_PROGRAM_ID
    );
    assert.equal(aliceAccount.amount, BigInt(500_000_000));
  });

  it("rejects minting over quota", async () => {
    const [minterInfoPda] = findMinterPda(
      mintKp.publicKey,
      minterKp.publicKey,
      SSS_PROGRAM_ID
    );
    const aliceAta = getAssociatedTokenAddressSync(
      mintKp.publicKey,
      alice.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID
    );

    await assertThrows(async () => {
      await program.methods
        .mintTokens(new anchor.BN(600_000_000)) // would exceed 1000 TUSD quota
        .accounts({
          minter: minterKp.publicKey,
          config: configPda,
          minterInfo: minterInfoPda,
          mint: mintKp.publicKey,
          recipientTokenAccount: aliceAta,
          recipient: alice.publicKey,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([minterKp])
        .rpc();
    }, "QuotaExceeded");
  });

  it("freezes and thaws alice's account", async () => {
    const aliceAta = getAssociatedTokenAddressSync(
      mintKp.publicKey,
      alice.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID
    );

    await program.methods
      .freezeTokenAccount()
      .accounts({
        authority: authority.publicKey,
        config: configPda,
        mint: mintKp.publicKey,
        tokenAccount: aliceAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .signers([authority])
      .rpc();

    let aliceAccount = await getAccount(
      connection,
      aliceAta,
      "confirmed",
      TOKEN_2022_PROGRAM_ID
    );
    assert.equal(aliceAccount.isFrozen, true);

    await program.methods
      .thawTokenAccount()
      .accounts({
        authority: authority.publicKey,
        config: configPda,
        mint: mintKp.publicKey,
        tokenAccount: aliceAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .signers([authority])
      .rpc();

    aliceAccount = await getAccount(
      connection,
      aliceAta,
      "confirmed",
      TOKEN_2022_PROGRAM_ID
    );
    assert.equal(aliceAccount.isFrozen, false);
  });

  it("pauses and unpauses the contract", async () => {
    await program.methods
      .pause()
      .accounts({
        authority: authority.publicKey,
        config: configPda,
      })
      .signers([authority])
      .rpc();

    let config = await program.account.stablecoinConfig.fetch(configPda);
    assert.equal(config.paused, true);

    await program.methods
      .unpause()
      .accounts({
        authority: authority.publicKey,
        config: configPda,
      })
      .signers([authority])
      .rpc();

    config = await program.account.stablecoinConfig.fetch(configPda);
    assert.equal(config.paused, false);
  });

  it("rejects mint when paused", async () => {
    // Pause first
    await program.methods
      .pause()
      .accounts({ authority: authority.publicKey, config: configPda })
      .signers([authority])
      .rpc();

    const [minterInfoPda] = findMinterPda(
      mintKp.publicKey,
      minterKp.publicKey,
      SSS_PROGRAM_ID
    );
    const aliceAta = getAssociatedTokenAddressSync(
      mintKp.publicKey,
      alice.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID
    );

    await assertThrows(async () => {
      await program.methods
        .mintTokens(new anchor.BN(1_000))
        .accounts({
          minter: minterKp.publicKey,
          config: configPda,
          minterInfo: minterInfoPda,
          mint: mintKp.publicKey,
          recipientTokenAccount: aliceAta,
          recipient: alice.publicKey,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([minterKp])
        .rpc();
    }, "ContractPaused");

    // Unpause for subsequent tests
    await program.methods
      .unpause()
      .accounts({ authority: authority.publicKey, config: configPda })
      .signers([authority])
      .rpc();
  });

  it("transfers authority", async () => {
    const newAuthority = Keypair.generate();
    await airdrop(connection, newAuthority.publicKey, 2);

    await program.methods
      .transferAuthority(newAuthority.publicKey)
      .accounts({
        authority: authority.publicKey,
        config: configPda,
      })
      .signers([authority])
      .rpc();

    const config = await program.account.stablecoinConfig.fetch(configPda);
    assert.ok(config.authority.equals(newAuthority.publicKey));

    // Transfer back for cleanup
    await program.methods
      .transferAuthority(authority.publicKey)
      .accounts({
        authority: newAuthority.publicKey,
        config: configPda,
      })
      .signers([newAuthority])
      .rpc();
  });

  it("rejects blacklist operations on SSS-1", async () => {
    await assertThrows(async () => {
      const targetAddress = Keypair.generate().publicKey;
      const [blacklistEntryPda] = findBlacklistPda(
        mintKp.publicKey,
        targetAddress,
        SSS_PROGRAM_ID
      );
      await program.methods
        .addToBlacklist(targetAddress, "test")
        .accounts({
          blacklister: authority.publicKey,
          config: configPda,
          blacklistEntry: blacklistEntryPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([authority])
        .rpc();
    }, "InvalidPreset");
  });
});
