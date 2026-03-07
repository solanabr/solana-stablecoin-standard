import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { Stablecoin } from "../target/types/stablecoin";
import {
  Token2022,
  getMint,
  getAccount,
  createAssociatedTokenAccount,
} from "@solana/spl-token";
import { assert } from "chai";

describe("SSS-1: Minimal Stablecoin", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Stablecoin as Program<Stablecoin>;
  const tokenProgram = Token2022;

  let mint: anchor.web3.PublicKey;
  let stablecoinPda: anchor.web3.PublicKey;
  let authority: anchor.web3.Keypair;
  let user: anchor.web3.Keypair;
  let userAta: anchor.web3.PublicKey;

  before(async () => {
    authority = provider.wallet.payer;
    user = anchor.web3.Keypair.generate();
    mint = anchor.web3.Keypair.generate().publicKey;

    [stablecoinPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("stablecoin"), mint.toBuffer()],
      program.programId
    );

    // Airdrop para user
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(user.publicKey, 10 * anchor.web3.LAMPORTS_PER_SOL)
    );
  });

  it("Inicializa stablecoin SSS-1", async () => {
    const config = {
      name: "Test Stable",
      symbol: "TST",
      uri: "https://example.com/metadata.json",
      decimals: 6,
      enablePermanentDelegate: false,
      enableTransferHook: false,
      defaultAccountFrozen: false,
    };

    await program.methods
      .initialize(config)
      .accounts({
        authority: authority.publicKey,
        stablecoin: stablecoinPda,
        mint: mint,
      })
      .signers([authority])
      .rpc();

    const stablecoinAccount = await program.account.stablecoin.fetch(stablecoinPda);
    assert.strictEqual(stablecoinAccount.authority.toString(), authority.publicKey.toString());
    assert.strictEqual(stablecoinAccount.mint.toString(), mint.toString());
    assert.strictEqual(stablecoinAccount.config.name, "Test Stable");
    assert.strictEqual(stablecoinAccount.config.symbol, "TST");
    assert.strictEqual(stablecoinAccount.paused, false);
    assert.strictEqual(stablecoinAccount.totalSupply.toNumber(), 0);
  });

  it("Cria ATA para user", async () => {
    userAta = await createAssociatedTokenAccount(
      provider.connection,
      authority,
      mint,
      user.publicKey
    );
  });

  it("Falha ao mintar com quantidade zero", async () => {
    try {
      await program.methods
        .mint(new BN(0))
        .accounts({
          stablecoin: stablecoinPda,
          minter: authority.publicKey,
          authority: authority.publicKey,
          mint: mint,
          to: userAta,
        })
        .rpc();
      assert.fail("Deveria ter falhado");
    } catch (error: any) {
      assert.include(error.message, "ZeroAmount");
    }
  });

  it("Minta 1000 tokens", async () => {
    const amount = new BN(1000 * 1e6); // 1000 tokens com 6 decimals

    await program.methods
      .mint(amount)
      .accounts({
        stablecoin: stablecoinPda,
        minter: authority.publicKey,
        authority: authority.publicKey,
        mint: mint,
        to: userAta,
      })
      .rpc();

    const stablecoinAccount = await program.account.stablecoin.fetch(stablecoinPda);
    assert.strictEqual(stablecoinAccount.totalSupply.toNumber(), amount.toNumber());

    const userAccount = await getAccount(provider.connection, userAta);
    assert.strictEqual(userAccount.amount.toString(), amount.toString());
  });

  it("Minta mais 500 tokens", async () => {
    const amount = new BN(500 * 1e6);

    await program.methods
      .mint(amount)
      .accounts({
        stablecoin: stablecoinPda,
        minter: authority.publicKey,
        authority: authority.publicKey,
        mint: mint,
        to: userAta,
      })
      .rpc();

    const stablecoinAccount = await program.account.stablecoin.fetch(stablecoinPda);
    assert.strictEqual(stablecoinAccount.totalSupply.toNumber(), 1500 * 1e6);
  });

  it("Falha ao burn com quantidade zero", async () => {
    try {
      await program.methods
        .burn(new BN(0))
        .accounts({
          stablecoin: stablecoinPda,
          authority: user.publicKey,
          mint: mint,
          from: userAta,
        })
        .signers([user])
        .rpc();
      assert.fail("Deveria ter falhado");
    } catch (error: any) {
      assert.include(error.message, "ZeroAmount");
    }
  });

  it("Burn de 200 tokens", async () => {
    const amount = new BN(200 * 1e6);

    await program.methods
      .burn(amount)
      .accounts({
        stablecoin: stablecoinPda,
        authority: user.publicKey,
        mint: mint,
        from: userAta,
      })
      .signers([user])
      .rpc();

    const stablecoinAccount = await program.account.stablecoin.fetch(stablecoinPda);
    assert.strictEqual(stablecoinAccount.totalSupply.toNumber(), 1300 * 1e6);

    const userAccount = await getAccount(provider.connection, userAta);
    assert.strictEqual(userAccount.amount.toString(), (1300 * 1e6).toString());
  });

  it("Pause a stablecoin", async () => {
    await program.methods
      .pause()
      .accounts({
        stablecoin: stablecoinPda,
        authority: authority.publicKey,
      })
      .rpc();

    const stablecoinAccount = await program.account.stablecoin.fetch(stablecoinPda);
    assert.strictEqual(stablecoinAccount.paused, true);
  });

  it("Falha ao mintar quando pausado", async () => {
    try {
      await program.methods
        .mint(new BN(100 * 1e6))
        .accounts({
          stablecoin: stablecoinPda,
          minter: authority.publicKey,
          authority: authority.publicKey,
          mint: mint,
          to: userAta,
        })
        .rpc();
      assert.fail("Deveria ter falhado");
    } catch (error: any) {
      assert.include(error.message, "VaultPaused");
    }
  });

  it("Unpause a stablecoin", async () => {
    await program.methods
      .unpause()
      .accounts({
        stablecoin: stablecoinPda,
        authority: authority.publicKey,
      })
      .rpc();

    const stablecoinAccount = await program.account.stablecoin.fetch(stablecoinPda);
    assert.strictEqual(stablecoinAccount.paused, false);
  });

  it("Freeze de conta", async () => {
    await program.methods
      .freezeAccount()
      .accounts({
        stablecoin: stablecoinPda,
        authority: authority.publicKey,
        mint: mint,
        account: userAta,
      })
      .rpc();

    const userAccount = await getAccount(provider.connection, userAta);
    assert.isTrue(userAccount.isFrozen);
  });

  it("Thaw de conta congelada", async () => {
    await program.methods
      .thawAccount()
      .accounts({
        stablecoin: stablecoinPda,
        authority: authority.publicKey,
        mint: mint,
        account: userAta,
      })
      .rpc();

    const userAccount = await getAccount(provider.connection, userAta);
    assert.isFalse(userAccount.isFrozen);
  });

  it("Transferir autoridade", async () => {
    const newAuthority = anchor.web3.Keypair.generate().publicKey;

    await program.methods
      .transferAuthority(newAuthority)
      .accounts({
        stablecoin: stablecoinPda,
        authority: authority.publicKey,
      })
      .rpc();

    const stablecoinAccount = await program.account.stablecoin.fetch(stablecoinPda);
    assert.strictEqual(stablecoinAccount.authority.toString(), newAuthority.toString());
  });

  it("Get total supply", async () => {
    const stablecoinAccount = await program.account.stablecoin.fetch(stablecoinPda);
    assert.strictEqual(stablecoinAccount.totalSupply.toNumber(), 1300 * 1e6);
  });

  it("Get config", async () => {
    const stablecoinAccount = await program.account.stablecoin.fetch(stablecoinPda);
    assert.strictEqual(stablecoinAccount.config.name, "Test Stable");
    assert.strictEqual(stablecoinAccount.config.symbol, "TST");
    assert.strictEqual(stablecoinAccount.config.decimals, 6);
    assert.isFalse(stablecoinAccount.config.enablePermanentDelegate);
    assert.isFalse(stablecoinAccount.config.enableTransferHook);
  });
});
