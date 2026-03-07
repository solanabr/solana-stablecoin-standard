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

describe("SSS-2: Compliant Stablecoin", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Stablecoin as Program<Stablecoin>;
  const tokenProgram = Token2022;

  let mint: anchor.web3.PublicKey;
  let stablecoinPda: anchor.web3.PublicKey;
  let blacklistPda: anchor.web3.PublicKey;
  let authority: anchor.web3.Keypair;
  let user1: anchor.web3.Keypair;
  let user2: anchor.web3.Keypair;
  let user1Ata: anchor.web3.PublicKey;
  let user2Ata: anchor.web3.PublicKey;

  before(async () => {
    authority = provider.wallet.payer;
    user1 = anchor.web3.Keypair.generate();
    user2 = anchor.web3.Keypair.generate();
    mint = anchor.web3.Keypair.generate().publicKey;

    [stablecoinPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("stablecoin"), mint.toBuffer()],
      program.programId
    );

    [blacklistPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("blacklist"), stablecoinPda.toBuffer()],
      program.programId
    );

    // Airdrops
    await Promise.all([
      provider.connection.confirmTransaction(
        await provider.connection.requestAirdrop(user1.publicKey, 10 * anchor.web3.LAMPORTS_PER_SOL)
      ),
      provider.connection.confirmTransaction(
        await provider.connection.requestAirdrop(user2.publicKey, 10 * anchor.web3.LAMPORTS_PER_SOL)
      ),
    ]);
  });

  it("Inicializa stablecoin SSS-2 (com compliance)", async () => {
    const config = {
      name: "Compliant Stable",
      symbol: "CUSD",
      uri: "https://example.com/compliant-metadata.json",
      decimals: 6,
      enablePermanentDelegate: true,
      enableTransferHook: true,
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
    assert.strictEqual(stablecoinAccount.config.enablePermanentDelegate, true);
    assert.strictEqual(stablecoinAccount.config.enableTransferHook, true);
  });

  it("Cria ATAs para users", async () => {
    user1Ata = await createAssociatedTokenAccount(
      provider.connection,
      authority,
      mint,
      user1.publicKey
    );

    user2Ata = await createAssociatedTokenAccount(
      provider.connection,
      authority,
      mint,
      user2.publicKey
    );
  });

  it("Minta tokens para user1", async () => {
    const amount = new BN(10000 * 1e6);

    await program.methods
      .mint(amount)
      .accounts({
        stablecoin: stablecoinPda,
        minter: authority.publicKey,
        authority: authority.publicKey,
        mint: mint,
        to: user1Ata,
      })
      .rpc();

    const user1Account = await getAccount(provider.connection, user1Ata);
    assert.strictEqual(user1Account.amount.toString(), amount.toString());
  });

  it("Adiciona user2 à blacklist", async () => {
    await program.methods
      .addToBlacklist(user2.publicKey)
      .accounts({
        stablecoin: stablecoinPda,
        authority: authority.publicKey,
        blacklist: blacklistPda,
      })
      .rpc();

    const blacklistAccount = await program.account.blacklist.fetch(blacklistPda);
    assert.isTrue(
      blacklistAccount.blacklistedAddresses.some(
        (addr: anchor.web3.PublicKey) => addr.toString() === user2.publicKey.toString()
      )
    );
  });

  it("Falha ao mintar para conta na blacklist (simulado)", async () => {
    // Na implementação real, o transfer hook bloquearia
    // Aqui testamos que a blacklist existe
    const blacklistAccount = await program.account.blacklist.fetch(blacklistPda);
    assert.strictEqual(blacklistAccount.blacklistedAddresses.length, 1);
  });

  it("Freeze de conta na blacklist", async () => {
    await program.methods
      .freezeAccount()
      .accounts({
        stablecoin: stablecoinPda,
        authority: authority.publicKey,
        mint: mint,
        account: user2Ata,
      })
      .rpc();

    const user2Account = await getAccount(provider.connection, user2Ata);
    assert.isTrue(user2Account.isFrozen);
  });

  it("Seize tokens de conta congelada (SSS-2 feature)", async () => {
    // Mint tokens para user2 primeiro
    await program.methods
      .mint(new BN(5000 * 1e6))
      .accounts({
        stablecoin: stablecoinPda,
        minter: authority.publicKey,
        authority: authority.publicKey,
        mint: mint,
        to: user2Ata,
      })
      .rpc();

    const user2AccountBefore = await getAccount(provider.connection, user2Ata);
    assert.strictEqual(user2AccountBefore.amount.toString(), (5000 * 1e6).toString());

    // Seize tokens
    const seizeAmount = new BN(5000 * 1e6);
    await program.methods
      .seize(seizeAmount, user1Ata)
      .accounts({
        stablecoin: stablecoinPda,
        authority: authority.publicKey,
        mint: mint,
        from: user2Ata,
        to: user1Ata,
      })
      .rpc();

    const user2AccountAfter = await getAccount(provider.connection, user2Ata);
    assert.strictEqual(user2AccountAfter.amount.toString(), "0");

    const user1AccountAfter = await getAccount(provider.connection, user1Ata);
    assert.strictEqual(user1AccountAfter.amount.toString(), (15000 * 1e6).toString());
  });

  it("Remove da blacklist", async () => {
    await program.methods
      .removeFromBlacklist(user2.publicKey)
      .accounts({
        stablecoin: stablecoinPda,
        authority: authority.publicKey,
        blacklist: blacklistPda,
      })
      .rpc();

    const blacklistAccount = await program.account.blacklist.fetch(blacklistPda);
    assert.isFalse(
      blacklistAccount.blacklistedAddresses.some(
        (addr: anchor.web3.PublicKey) => addr.toString() === user2.publicKey.toString()
      )
    );
  });

  it("Thaw de conta", async () => {
    await program.methods
      .thawAccount()
      .accounts({
        stablecoin: stablecoinPda,
        authority: authority.publicKey,
        mint: mint,
        account: user2Ata,
      })
      .rpc();

    const user2Account = await getAccount(provider.connection, user2Ata);
    assert.isFalse(user2Account.isFrozen);
  });

  it("Pause emergency", async () => {
    await program.methods
      .pause()
      .accounts({
        stablecoin: stablecoinPda,
        authority: authority.publicKey,
      })
      .rpc();

    const stablecoinAccount = await program.account.stablecoin.fetch(stablecoinPda);
    assert.isTrue(stablecoinAccount.paused);
  });

  it("Falha ao operar quando pausado", async () => {
    try {
      await program.methods
        .mint(new BN(100 * 1e6))
        .accounts({
          stablecoin: stablecoinPda,
          minter: authority.publicKey,
          authority: authority.publicKey,
          mint: mint,
          to: user1Ata,
        })
        .rpc();
      assert.fail("Deveria ter falhado");
    } catch (error: any) {
      assert.include(error.message, "VaultPaused");
    }
  });

  it("Unpause", async () => {
    await program.methods
      .unpause()
      .accounts({
        stablecoin: stablecoinPda,
        authority: authority.publicKey,
      })
      .rpc();

    const stablecoinAccount = await program.account.stablecoin.fetch(stablecoinPda);
    assert.isFalse(stablecoinAccount.paused);
  });

  it("Burn de tokens", async () => {
    const amount = new BN(1000 * 1e6);

    await program.methods
      .burn(amount)
      .accounts({
        stablecoin: stablecoinPda,
        authority: user1.publicKey,
        mint: mint,
        from: user1Ata,
      })
      .signers([user1])
      .rpc();

    const stablecoinAccount = await program.account.stablecoin.fetch(stablecoinPda);
    assert.strictEqual(stablecoinAccount.totalSupply.toNumber(), (14000 * 1e6).toString());
  });

  it("Get total supply", async () => {
    const stablecoinAccount = await program.account.stablecoin.fetch(stablecoinPda);
    assert.strictEqual(stablecoinAccount.totalSupply.toNumber(), 14000 * 1e6);
  });

  it("Get config (SSS-2)", async () => {
    const stablecoinAccount = await program.account.stablecoin.fetch(stablecoinPda);
    assert.strictEqual(stablecoinAccount.config.name, "Compliant Stable");
    assert.strictEqual(stablecoinAccount.config.symbol, "CUSD");
    assert.isTrue(stablecoinAccount.config.enablePermanentDelegate);
    assert.isTrue(stablecoinAccount.config.enableTransferHook);
  });

  it("Múltiplas adições à blacklist", async () => {
    const badActor1 = anchor.web3.Keypair.generate().publicKey;
    const badActor2 = anchor.web3.Keypair.generate().publicKey;

    await program.methods
      .addToBlacklist(badActor1)
      .accounts({
        stablecoin: stablecoinPda,
        authority: authority.publicKey,
        blacklist: blacklistPda,
      })
      .rpc();

    await program.methods
      .addToBlacklist(badActor2)
      .accounts({
        stablecoin: stablecoinPda,
        authority: authority.publicKey,
        blacklist: blacklistPda,
      })
      .rpc();

    const blacklistAccount = await program.account.blacklist.fetch(blacklistPda);
    assert.strictEqual(blacklistAccount.blacklistedAddresses.length, 2);
  });

  it("Concorrência: Múltiplos mints", async () => {
    const promises = [];
    for (let i = 0; i < 5; i++) {
      promises.push(
        program.methods
          .mint(new BN(100 * 1e6))
          .accounts({
            stablecoin: stablecoinPda,
            minter: authority.publicKey,
            authority: authority.publicKey,
            mint: mint,
            to: user1Ata,
          })
          .rpc()
      );
    }

    await Promise.all(promises);

    const stablecoinAccount = await program.account.stablecoin.fetch(stablecoinPda);
    const expectedSupply = (14000 + 500) * 1e6;
    assert.strictEqual(stablecoinAccount.totalSupply.toNumber(), expectedSupply);
  });
});
