import * as anchor from "@coral-xyz/anchor";
import { Program, AnchorProvider, BN } from "@coral-xyz/anchor";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
} from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { expect } from "chai";

// ---------------------------------------------------------------------------
// Constants & PDA helpers
// ---------------------------------------------------------------------------
const SSS_CORE_PROGRAM_ID = new PublicKey(
  "G3jadBDzaF2HbTY2at5auYYQQ94zhhWaocMuWDgUy2vL",
);

const CONFIG_SEED = Buffer.from("config");
const ROLE_SEED = Buffer.from("role");
const QUOTA_SEED = Buffer.from("quota");

const ROLE_MINTER = 0x01;

function getConfigAddress(mint: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [CONFIG_SEED, mint.toBuffer()],
    SSS_CORE_PROGRAM_ID,
  );
}

function getRoleAddress(role: number, config: PublicKey, holder: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [ROLE_SEED, config.toBuffer(), Buffer.from([role]), holder.toBuffer()],
    SSS_CORE_PROGRAM_ID,
  );
}

function getQuotaAddress(
  config: PublicKey,
  minter: PublicKey,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [QUOTA_SEED, config.toBuffer(), minter.toBuffer()],
    SSS_CORE_PROGRAM_ID,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("Supply Cap: Enforcement and management", () => {
  const provider = AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.SssCore as Program;
  const authority = provider.wallet as anchor.Wallet;

  // Unauthorized user
  const unauthorizedUser = Keypair.generate();

  // ------------------------------------------------------------------
  // Mint A: Initialized WITH a supply cap
  // ------------------------------------------------------------------
  const mintAKeypair = Keypair.generate();
  const mintAKey = mintAKeypair.publicKey;
  const [configPdaA] = getConfigAddress(mintAKey);
  const [minterRoleA] = getRoleAddress(ROLE_MINTER, configPdaA, authority.publicKey);
  const [minterQuotaA] = getQuotaAddress(configPdaA, authority.publicKey);
  let authorityAtaA: PublicKey;

  // ------------------------------------------------------------------
  // Mint B: Initialized WITHOUT a supply cap (null → unlimited)
  // ------------------------------------------------------------------
  const mintBKeypair = Keypair.generate();
  const mintBKey = mintBKeypair.publicKey;
  const [configPdaB] = getConfigAddress(mintBKey);
  const [minterRoleB] = getRoleAddress(ROLE_MINTER, configPdaB, authority.publicKey);
  const [minterQuotaB] = getQuotaAddress(configPdaB, authority.publicKey);
  let authorityAtaB: PublicKey;

  // ------------------------------------------------------------------
  // Setup
  // ------------------------------------------------------------------
  before(async () => {
    const sig = await provider.connection.requestAirdrop(
      unauthorizedUser.publicKey,
      2 * anchor.web3.LAMPORTS_PER_SOL,
    );
    await provider.connection.confirmTransaction(sig);
  });

  // ==================================================================
  // 1. Initialize with supply cap
  // ==================================================================
  it("initializes a stablecoin WITH a supply cap of 1000 tokens", async () => {
    const input = {
      name: "Capped USD",
      symbol: "CUSD",
      uri: "https://example.com/cusd.json",
      decimals: 6,
      complianceEnabled: false,
      enableAllowlist: false,
      supplyCap: new BN(1_000_000_000), // 1000 tokens
    };

    await program.methods
      .initialize(input)
      .accountsPartial({
        authority: authority.publicKey,
        mint: mintAKey,
        config: configPdaA,
        transferHookProgram: null,
        systemProgram: SystemProgram.programId,
        token2022Program: TOKEN_2022_PROGRAM_ID,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .signers([mintAKeypair])
      .rpc();

    const config = await program.account.stablecoinConfig.fetch(configPdaA);
    expect(config.supplyCap.toNumber()).to.equal(1_000_000_000);
  });

  it("sets up minter role + quota + ATA for mint A", async () => {
    await program.methods
      .grantRole(ROLE_MINTER, authority.publicKey)
      .accountsPartial({
        authority: authority.publicKey,
        config: configPdaA,
        roleAssignment: minterRoleA,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    await program.methods
      .setQuota(authority.publicKey, new BN("18446744073709551615"))
      .accountsPartial({
        authority: authority.publicKey,
        config: configPdaA,
        minterRole: minterRoleA,
        minterQuota: minterQuotaA,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    authorityAtaA = getAssociatedTokenAddressSync(
      mintAKey,
      authority.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID,
    );

    const tx = new anchor.web3.Transaction().add(
      createAssociatedTokenAccountInstruction(
        authority.publicKey,
        authorityAtaA,
        authority.publicKey,
        mintAKey,
        TOKEN_2022_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID,
      ),
    );
    await provider.sendAndConfirm(tx);
  });

  // ==================================================================
  // 2. Mint within cap
  // ==================================================================
  it("mints 800 tokens (within 1000 cap)", async () => {
    await program.methods
      .mintTokens(new BN(800_000_000))
      .accountsPartial({
        minter: authority.publicKey,
        config: configPdaA,
        minterRole: minterRoleA,
        minterQuota: minterQuotaA,
        mint: mintAKey,
        recipientTokenAccount: authorityAtaA,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();

    const config = await program.account.stablecoinConfig.fetch(configPdaA);
    expect(config.totalMinted.toNumber()).to.equal(800_000_000);
  });

  // ==================================================================
  // 3. Mint at exact cap
  // ==================================================================
  it("mints 200 more tokens (exactly at 1000 cap)", async () => {
    await program.methods
      .mintTokens(new BN(200_000_000))
      .accountsPartial({
        minter: authority.publicKey,
        config: configPdaA,
        minterRole: minterRoleA,
        minterQuota: minterQuotaA,
        mint: mintAKey,
        recipientTokenAccount: authorityAtaA,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();

    const config = await program.account.stablecoinConfig.fetch(configPdaA);
    expect(config.totalMinted.toNumber()).to.equal(1_000_000_000);
  });

  // ==================================================================
  // 4. Exceed cap fails
  // ==================================================================
  it("fails to mint 1 more token (supply cap exceeded)", async () => {
    try {
      await program.methods
        .mintTokens(new BN(1))
        .accountsPartial({
          minter: authority.publicKey,
          config: configPdaA,
          minterRole: minterRoleA,
          minterQuota: minterQuotaA,
          mint: mintAKey,
          recipientTokenAccount: authorityAtaA,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .rpc();
      expect.fail("Expected SupplyCapExceeded error");
    } catch (err: any) {
      expect(err.toString()).to.include("SupplyCapExceeded");
    }
  });

  // ==================================================================
  // 5. Burn then mint again (cap is on circulating supply)
  // ==================================================================
  it("burns 500 tokens to free up cap room", async () => {
    await program.methods
      .burnTokens(new BN(500_000_000))
      .accountsPartial({
        burner: authority.publicKey,
        config: configPdaA,
        mint: mintAKey,
        burnerTokenAccount: authorityAtaA,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();

    const config = await program.account.stablecoinConfig.fetch(configPdaA);
    expect(config.totalBurned.toNumber()).to.equal(500_000_000);
    // current_supply = 1000 - 500 = 500
  });

  it("mints 500 tokens after burning (supply back to 1000)", async () => {
    await program.methods
      .mintTokens(new BN(500_000_000))
      .accountsPartial({
        minter: authority.publicKey,
        config: configPdaA,
        minterRole: minterRoleA,
        minterQuota: minterQuotaA,
        mint: mintAKey,
        recipientTokenAccount: authorityAtaA,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();

    const config = await program.account.stablecoinConfig.fetch(configPdaA);
    // current_supply = (1000+500) minted - 500 burned = 1000 = cap
    expect(config.current_supply ?? (config.totalMinted.toNumber() - config.totalBurned.toNumber())).to.equal(1_000_000_000);
  });

  // ==================================================================
  // 6. Authority can increase the cap
  // ==================================================================
  it("authority raises the supply cap to 5000", async () => {
    await program.methods
      .setSupplyCap(new BN(5_000_000_000))
      .accountsPartial({
        authority: authority.publicKey,
        config: configPdaA,
      })
      .rpc();

    const config = await program.account.stablecoinConfig.fetch(configPdaA);
    expect(config.supplyCap.toNumber()).to.equal(5_000_000_000);
  });

  it("can now mint beyond old 1000 cap", async () => {
    await program.methods
      .mintTokens(new BN(1_000_000_000))
      .accountsPartial({
        minter: authority.publicKey,
        config: configPdaA,
        minterRole: minterRoleA,
        minterQuota: minterQuotaA,
        mint: mintAKey,
        recipientTokenAccount: authorityAtaA,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();

    const config = await program.account.stablecoinConfig.fetch(configPdaA);
    // current_supply = total_minted - total_burned = (1000+500+1000) - 500 = 2000
    const supply = config.totalMinted.toNumber() - config.totalBurned.toNumber();
    expect(supply).to.equal(2_000_000_000);
  });

  // ==================================================================
  // 7. Authority can reduce the cap (but not below current supply)
  // ==================================================================
  it("fails to set cap below current supply", async () => {
    try {
      // Current supply is 2000 tokens, try to set cap to 500
      await program.methods
        .setSupplyCap(new BN(500_000_000))
        .accountsPartial({
          authority: authority.publicKey,
          config: configPdaA,
        })
        .rpc();
      expect.fail("Expected SupplyCapExceeded error");
    } catch (err: any) {
      expect(err.toString()).to.include("SupplyCapExceeded");
    }
  });

  it("sets cap to exactly current supply (2000)", async () => {
    await program.methods
      .setSupplyCap(new BN(2_000_000_000))
      .accountsPartial({
        authority: authority.publicKey,
        config: configPdaA,
      })
      .rpc();

    const config = await program.account.stablecoinConfig.fetch(configPdaA);
    expect(config.supplyCap.toNumber()).to.equal(2_000_000_000);
  });

  // ==================================================================
  // 8. Authority can remove the cap (set to 0 = unlimited)
  // ==================================================================
  it("sets cap to 0 (unlimited)", async () => {
    await program.methods
      .setSupplyCap(new BN(0))
      .accountsPartial({
        authority: authority.publicKey,
        config: configPdaA,
      })
      .rpc();

    const config = await program.account.stablecoinConfig.fetch(configPdaA);
    expect(config.supplyCap.toNumber()).to.equal(0);
  });

  it("can mint freely after cap is removed", async () => {
    await program.methods
      .mintTokens(new BN(10_000_000_000))
      .accountsPartial({
        minter: authority.publicKey,
        config: configPdaA,
        minterRole: minterRoleA,
        minterQuota: minterQuotaA,
        mint: mintAKey,
        recipientTokenAccount: authorityAtaA,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();

    // Should succeed without SupplyCapExceeded
    const config = await program.account.stablecoinConfig.fetch(configPdaA);
    const supply = config.totalMinted.toNumber() - config.totalBurned.toNumber();
    expect(supply).to.equal(12_000_000_000);
  });

  // ==================================================================
  // 9. Unauthorized user cannot set supply cap
  // ==================================================================
  it("fails when unauthorized user tries to set supply cap", async () => {
    try {
      await program.methods
        .setSupplyCap(new BN(999))
        .accountsPartial({
          authority: unauthorizedUser.publicKey,
          config: configPdaA,
        })
        .signers([unauthorizedUser])
        .rpc();
      expect.fail("Expected Unauthorized error");
    } catch (err: any) {
      expect(err.toString()).to.include("Unauthorized");
    }
  });

  // ==================================================================
  // 10. Mint B: No supply cap (null → 0)
  // ==================================================================
  it("initializes a stablecoin WITHOUT a supply cap", async () => {
    const input = {
      name: "Uncapped USD",
      symbol: "UUSD",
      uri: "https://example.com/uusd.json",
      decimals: 6,
      complianceEnabled: false,
      enableAllowlist: false,
      supplyCap: null,
    };

    await program.methods
      .initialize(input)
      .accountsPartial({
        authority: authority.publicKey,
        mint: mintBKey,
        config: configPdaB,
        transferHookProgram: null,
        systemProgram: SystemProgram.programId,
        token2022Program: TOKEN_2022_PROGRAM_ID,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .signers([mintBKeypair])
      .rpc();

    const config = await program.account.stablecoinConfig.fetch(configPdaB);
    expect(config.supplyCap.toNumber()).to.equal(0);
  });

  it("sets up minter for mint B and mints large amount (no cap)", async () => {
    await program.methods
      .grantRole(ROLE_MINTER, authority.publicKey)
      .accountsPartial({
        authority: authority.publicKey,
        config: configPdaB,
        roleAssignment: minterRoleB,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    await program.methods
      .setQuota(authority.publicKey, new BN("18446744073709551615"))
      .accountsPartial({
        authority: authority.publicKey,
        config: configPdaB,
        minterRole: minterRoleB,
        minterQuota: minterQuotaB,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    authorityAtaB = getAssociatedTokenAddressSync(
      mintBKey,
      authority.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID,
    );

    const tx = new anchor.web3.Transaction().add(
      createAssociatedTokenAccountInstruction(
        authority.publicKey,
        authorityAtaB,
        authority.publicKey,
        mintBKey,
        TOKEN_2022_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID,
      ),
    );
    await provider.sendAndConfirm(tx);

    // Mint a large amount with no cap
    await program.methods
      .mintTokens(new BN(100_000_000_000))
      .accountsPartial({
        minter: authority.publicKey,
        config: configPdaB,
        minterRole: minterRoleB,
        minterQuota: minterQuotaB,
        mint: mintBKey,
        recipientTokenAccount: authorityAtaB,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();

    const config = await program.account.stablecoinConfig.fetch(configPdaB);
    expect(config.totalMinted.toNumber()).to.equal(100_000_000_000);
  });

  it("can retroactively add a supply cap to an uncapped mint", async () => {
    // Current supply is 100,000 tokens. Set cap to 150,000
    await program.methods
      .setSupplyCap(new BN(150_000_000_000))
      .accountsPartial({
        authority: authority.publicKey,
        config: configPdaB,
      })
      .rpc();

    const config = await program.account.stablecoinConfig.fetch(configPdaB);
    expect(config.supplyCap.toNumber()).to.equal(150_000_000_000);
  });
});
