import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { SssToken } from "../target/types/sss_token";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
} from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  getAccount,
  createAssociatedTokenAccount,
} from "@solana/spl-token";
import { expect } from "chai";

const HOOK_PROGRAM_ID = new PublicKey(
  "6tULvFAJ7HfaMsjqcUyS7G3kJyncrBsth9kp2UGramiY"
);

describe("SSS-2: compliant stablecoin lifecycle", () => {
  const rawProvider = anchor.AnchorProvider.env();
  const provider = new anchor.AnchorProvider(
    rawProvider.connection,
    rawProvider.wallet,
    { commitment: "confirmed", preflightCommitment: "confirmed" }
  );
  anchor.setProvider(provider);

  const sssToken = anchor.workspace.SssToken as Program<SssToken>;
  const authority = provider.wallet as anchor.Wallet;

  let mint: Keypair;
  let stablecoinConfig: PublicKey;
  let roleManager: PublicKey;
  let minterInfo: PublicKey;
  let extraAccountMetaList: PublicKey;

  const minter = Keypair.generate();
  const user = Keypair.generate();
  const treasury = Keypair.generate();
  const DECIMALS = 6;
  const MINT_AMOUNT = 5_000_000;

  function configPda(mintKey: PublicKey) {
    const [config] = PublicKey.findProgramAddressSync(
      [Buffer.from("stablecoin"), mintKey.toBuffer()],
      sssToken.programId
    );
    const [roles] = PublicKey.findProgramAddressSync(
      [Buffer.from("roles"), config.toBuffer()],
      sssToken.programId
    );
    return { config, roles };
  }

  before(async () => {
    await provider.connection.requestAirdrop(minter.publicKey, 2e9);
    await provider.connection.requestAirdrop(user.publicKey, 2e9);
    await provider.connection.requestAirdrop(treasury.publicKey, 2e9);
    await new Promise((r) => setTimeout(r, 1500));
  });

  it("initialize SSS-2 token", async () => {
    mint = Keypair.generate();
    const { config, roles } = configPda(mint.publicKey);
    stablecoinConfig = config;
    roleManager = roles;

    const [extraMetas] = PublicKey.findProgramAddressSync(
      [Buffer.from("extra-account-metas"), mint.publicKey.toBuffer()],
      HOOK_PROGRAM_ID
    );
    extraAccountMetaList = extraMetas;

    await sssToken.methods
      .initialize({
        name: "RegUSD",
        symbol: "RUSD",
        uri: "https://example.com/rusd.json",
        decimals: DECIMALS,
        enablePermanentDelegate: true,
        enableTransferHook: true,
        enableDefaultFrozen: true,
        transferHookProgramId: HOOK_PROGRAM_ID,
      })
      .accountsPartial({
        authority: authority.publicKey,
        mint: mint.publicKey,
        stablecoinConfig,
        roleManager,
        token2022Program: TOKEN_2022_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .remainingAccounts([
        { pubkey: HOOK_PROGRAM_ID, isWritable: false, isSigner: false },
        { pubkey: extraAccountMetaList, isWritable: true, isSigner: false },
      ])
      .signers([mint])
      .rpc();

    const cfg = await sssToken.account.stablecoinConfig.fetch(stablecoinConfig);
    expect(cfg.enablePermanentDelegate).to.be.true;
    expect(cfg.enableTransferHook).to.be.true;
    expect(cfg.enableDefaultFrozen).to.be.true;
    expect(cfg.uri).to.equal("https://example.com/rusd.json");
  });

  it("SSS-2 instructions fail on SSS-1 token (ComplianceNotEnabled)", async () => {
    const sss1Mint = Keypair.generate();
    const { config: sss1Config, roles: sss1Roles } = configPda(
      sss1Mint.publicKey
    );

    await sssToken.methods
      .initialize({
        name: "TestUSD",
        symbol: "TUSD",
        uri: "",
        decimals: 6,
        enablePermanentDelegate: false,
        enableTransferHook: false,
        enableDefaultFrozen: false,
        transferHookProgramId: null,
      })
      .accountsPartial({
        authority: authority.publicKey,
        mint: sss1Mint.publicKey,
        stablecoinConfig: sss1Config,
        roleManager: sss1Roles,
        token2022Program: TOKEN_2022_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .signers([sss1Mint])
      .rpc();

    const dummyAddress = Keypair.generate().publicKey;
    const [blacklistEntry] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("blacklist"),
        sss1Mint.publicKey.toBuffer(),
        dummyAddress.toBuffer(),
      ],
      sssToken.programId
    );

    try {
      await sssToken.methods
        .addToBlacklist(dummyAddress, "test")
        .accountsPartial({
          blacklister: authority.publicKey,
          stablecoinConfig: sss1Config,
          roleManager: sss1Roles,
          blacklistEntry,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      expect.fail("should have thrown ComplianceNotEnabled");
    } catch (e: any) {
      expect(e.error?.errorCode?.code).to.equal("ComplianceNotEnabled");
    }
  });

  it("add minter, thaw recipient ATA, then mint", async () => {
    const [info] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("minter"),
        stablecoinConfig.toBuffer(),
        minter.publicKey.toBuffer(),
      ],
      sssToken.programId
    );
    minterInfo = info;

    await sssToken.methods
      .addMinter(minter.publicKey, new BN(100_000_000))
      .accountsPartial({
        authority: authority.publicKey,
        stablecoinConfig,
        roleManager,
        minterInfo,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const userATA = getAssociatedTokenAddressSync(
      mint.publicKey,
      user.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID
    );

    // Create the ATA — it starts frozen due to DefaultAccountState extension
    await createAssociatedTokenAccount(
      provider.connection,
      (authority as any).payer,
      mint.publicKey,
      user.publicKey,
      { commitment: "confirmed" },
      TOKEN_2022_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );

    const created = await getAccount(
      provider.connection,
      userATA,
      "confirmed",
      TOKEN_2022_PROGRAM_ID
    );
    expect(created.isFrozen).to.be.true;

    // Thaw before minting — required for default-frozen accounts
    await sssToken.methods
      .thawAccount()
      .accountsPartial({
        authority: authority.publicKey,
        stablecoinConfig,
        roleManager,
        mint: mint.publicKey,
        tokenAccount: userATA,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();

    await sssToken.methods
      .mintTokens(new BN(MINT_AMOUNT))
      .accountsPartial({
        minter: minter.publicKey,
        stablecoinConfig,
        roleManager,
        minterInfo,
        mint: mint.publicKey,
        recipientTokenAccount: userATA,
        recipient: user.publicKey,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([minter])
      .rpc();

    const account = await getAccount(
      provider.connection,
      userATA,
      "confirmed",
      TOKEN_2022_PROGRAM_ID
    );
    expect(Number(account.amount)).to.equal(MINT_AMOUNT);
  });

  it("blacklist add + remove lifecycle", async () => {
    const victim = Keypair.generate().publicKey;

    const [blacklistEntry] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("blacklist"),
        mint.publicKey.toBuffer(),
        victim.toBuffer(),
      ],
      sssToken.programId
    );

    await sssToken.methods
      .addToBlacklist(victim, "OFAC match")
      .accountsPartial({
        blacklister: authority.publicKey,
        stablecoinConfig,
        roleManager,
        blacklistEntry,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const entry = await sssToken.account.blacklistEntry.fetch(blacklistEntry);
    expect(entry.address.toBase58()).to.equal(victim.toBase58());
    expect(entry.reason).to.equal("OFAC match");

    await sssToken.methods
      .removeFromBlacklist(victim)
      .accountsPartial({
        blacklister: authority.publicKey,
        stablecoinConfig,
        roleManager,
        blacklistEntry,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    try {
      await sssToken.account.blacklistEntry.fetch(blacklistEntry);
      expect.fail("blacklist entry should have been closed");
    } catch (_) {
      // expected — account closed
    }
  });

  it("seize tokens from frozen account", async () => {
    const treasuryATA = getAssociatedTokenAddressSync(
      mint.publicKey,
      treasury.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID
    );
    const userATA = getAssociatedTokenAddressSync(
      mint.publicKey,
      user.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID
    );

    // Create and thaw treasury ATA before minting to it
    await createAssociatedTokenAccount(
      provider.connection,
      (authority as any).payer,
      mint.publicKey,
      treasury.publicKey,
      { commitment: "confirmed" },
      TOKEN_2022_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );

    await sssToken.methods
      .thawAccount()
      .accountsPartial({
        authority: authority.publicKey,
        stablecoinConfig,
        roleManager,
        mint: mint.publicKey,
        tokenAccount: treasuryATA,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();

    await sssToken.methods
      .mintTokens(new BN(1_000_000))
      .accountsPartial({
        minter: minter.publicKey,
        stablecoinConfig,
        roleManager,
        minterInfo,
        mint: mint.publicKey,
        recipientTokenAccount: treasuryATA,
        recipient: treasury.publicKey,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([minter])
      .rpc();

    await sssToken.methods
      .freezeAccount()
      .accountsPartial({
        authority: authority.publicKey,
        stablecoinConfig,
        roleManager,
        mint: mint.publicKey,
        tokenAccount: userATA,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();

    const before = await getAccount(
      provider.connection,
      userATA,
      "confirmed",
      TOKEN_2022_PROGRAM_ID
    );
    const seizeAmount = Number(before.amount);

    // Pass all accounts needed by invoke_transfer_checked to resolve the
    // ExtraAccountMetaList: hook program, validation PDA, sss-token program,
    // sender blacklist PDA (keyed on permanent delegate), recipient blacklist PDA.
    const [senderBlacklistPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("blacklist"),
        mint.publicKey.toBuffer(),
        stablecoinConfig.toBuffer(),
      ],
      sssToken.programId
    );
    const [recipientBlacklistPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("blacklist"),
        mint.publicKey.toBuffer(),
        treasury.publicKey.toBuffer(),
      ],
      sssToken.programId
    );

    await sssToken.methods
      .seize(new BN(seizeAmount))
      .accountsPartial({
        seizer: authority.publicKey,
        stablecoinConfig,
        roleManager,
        mint: mint.publicKey,
        sourceTokenAccount: userATA,
        destinationTokenAccount: treasuryATA,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .remainingAccounts([
        { pubkey: HOOK_PROGRAM_ID, isWritable: false, isSigner: false },
        { pubkey: extraAccountMetaList, isWritable: false, isSigner: false },
        { pubkey: sssToken.programId, isWritable: false, isSigner: false },
        { pubkey: senderBlacklistPda, isWritable: false, isSigner: false },
        { pubkey: recipientBlacklistPda, isWritable: false, isSigner: false },
      ])
      .rpc();

    const after = await getAccount(
      provider.connection,
      userATA,
      "confirmed",
      TOKEN_2022_PROGRAM_ID
    );
    expect(Number(after.amount)).to.equal(0);

    const treasuryAccount = await getAccount(
      provider.connection,
      treasuryATA,
      "confirmed",
      TOKEN_2022_PROGRAM_ID
    );
    expect(Number(treasuryAccount.amount)).to.equal(1_000_000 + seizeAmount);
  });

  it("seize fails if source account not frozen", async () => {
    const userATA = getAssociatedTokenAddressSync(
      mint.publicKey,
      user.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID
    );
    const treasuryATA = getAssociatedTokenAddressSync(
      mint.publicKey,
      treasury.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID
    );

    await sssToken.methods
      .thawAccount()
      .accountsPartial({
        authority: authority.publicKey,
        stablecoinConfig,
        roleManager,
        mint: mint.publicKey,
        tokenAccount: userATA,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();

    try {
      await sssToken.methods
        .seize(new BN(100))
        .accountsPartial({
          seizer: authority.publicKey,
          stablecoinConfig,
          roleManager,
          mint: mint.publicKey,
          sourceTokenAccount: userATA,
          destinationTokenAccount: treasuryATA,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .rpc();
      expect.fail("should have thrown AccountNotFrozen");
    } catch (e: any) {
      expect(e.error?.errorCode?.code).to.equal("AccountNotFrozen");
    }
  });
});
