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

const ROLE_ADMIN = 0x00;
const ROLE_MINTER = 0x01;
const ROLE_PAUSER = 0x02;
const ROLE_FREEZER = 0x03;
const ROLE_BLACKLISTER = 0x04;
const ROLE_SEIZER = 0x05;

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
describe("SSS Roles: Management and quota edge cases", () => {
  const provider = AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.SssCore as Program;
  const authority = provider.wallet as anchor.Wallet;

  // Fresh mint for this suite
  const mintKeypair = Keypair.generate();
  const mintKey = mintKeypair.publicKey;
  const [configPda] = getConfigAddress(mintKey);

  // Multiple role holders
  const holderA = Keypair.generate();
  const holderB = Keypair.generate();
  const unauthorizedUser = Keypair.generate();

  // Role PDAs for holderA
  const [holderAMinterRole] = getRoleAddress(ROLE_MINTER, configPda, holderA.publicKey);
  const [holderAFreezerRole] = getRoleAddress(ROLE_FREEZER, configPda, holderA.publicKey);
  const [holderAPauserRole] = getRoleAddress(ROLE_PAUSER, configPda, holderA.publicKey);

  // Role PDAs for holderB
  const [holderBMinterRole] = getRoleAddress(ROLE_MINTER, configPda, holderB.publicKey);

  // Quota for holderA
  const [holderAQuota] = getQuotaAddress(configPda, holderA.publicKey);

  // Quota for holderB
  const [holderBQuota] = getQuotaAddress(configPda, holderB.publicKey);

  // ATA for holderA
  let holderAAta: PublicKey;

  // ------------------------------------------------------------------
  // Setup: Initialize SSS-1 mint
  // ------------------------------------------------------------------
  before(async () => {
    const input = {
      name: "Role Test",
      symbol: "ROLE",
      uri: "https://example.com/role.json",
      decimals: 6,
      complianceEnabled: false,
      enableAllowlist: false,
      supplyCap: null,
    };

    await program.methods
      .initialize(input)
      .accountsPartial({
        authority: authority.publicKey,
        mint: mintKey,
        config: configPda,
        transferHookProgram: null,
        systemProgram: SystemProgram.programId,
        token2022Program: TOKEN_2022_PROGRAM_ID,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .signers([mintKeypair])
      .rpc();

    // Fund the unauthorized user so it can sign transactions
    const sig = await provider.connection.requestAirdrop(
      unauthorizedUser.publicKey,
      2 * anchor.web3.LAMPORTS_PER_SOL,
    );
    await provider.connection.confirmTransaction(sig);

    // Fund holderA so it can sign transactions
    const sigA = await provider.connection.requestAirdrop(
      holderA.publicKey,
      2 * anchor.web3.LAMPORTS_PER_SOL,
    );
    await provider.connection.confirmTransaction(sigA);
  });

  // ------------------------------------------------------------------
  // 1. Grant multiple roles to the same holder
  // ------------------------------------------------------------------
  it("grants MINTER role to holderA", async () => {
    const tx = await program.methods
      .grantRole(ROLE_MINTER, holderA.publicKey)
      .accountsPartial({
        authority: authority.publicKey,
        config: configPda,
        roleAssignment: holderAMinterRole,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    console.log("    grant MINTER to holderA tx:", tx);

    const roleAccount = await program.account.roleAssignment.fetch(
      holderAMinterRole,
    );
    expect(roleAccount.role).to.equal(ROLE_MINTER);
    expect(roleAccount.holder.toBase58()).to.equal(
      holderA.publicKey.toBase58(),
    );
    expect(roleAccount.active).to.equal(true);
    expect(roleAccount.grantedBy.toBase58()).to.equal(authority.publicKey.toBase58());
    expect(roleAccount.grantedAt.toNumber()).to.be.greaterThan(0);
  });

  it("grants FREEZER role to holderA (same holder, different role)", async () => {
    const tx = await program.methods
      .grantRole(ROLE_FREEZER, holderA.publicKey)
      .accountsPartial({
        authority: authority.publicKey,
        config: configPda,
        roleAssignment: holderAFreezerRole,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    console.log("    grant FREEZER to holderA tx:", tx);

    const roleAccount = await program.account.roleAssignment.fetch(
      holderAFreezerRole,
    );
    expect(roleAccount.role).to.equal(ROLE_FREEZER);
    expect(roleAccount.holder.toBase58()).to.equal(
      holderA.publicKey.toBase58(),
    );
    expect(roleAccount.active).to.equal(true);
  });

  it("grants PAUSER role to holderA (third role for the same holder)", async () => {
    const tx = await program.methods
      .grantRole(ROLE_PAUSER, holderA.publicKey)
      .accountsPartial({
        authority: authority.publicKey,
        config: configPda,
        roleAssignment: holderAPauserRole,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    console.log("    grant PAUSER to holderA tx:", tx);
  });

  it("grants MINTER role to holderB (same role, different holder)", async () => {
    const tx = await program.methods
      .grantRole(ROLE_MINTER, holderB.publicKey)
      .accountsPartial({
        authority: authority.publicKey,
        config: configPda,
        roleAssignment: holderBMinterRole,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    console.log("    grant MINTER to holderB tx:", tx);
  });

  // ------------------------------------------------------------------
  // 2. Revoke a role
  // ------------------------------------------------------------------
  it("revokes PAUSER role from holderA", async () => {
    const tx = await program.methods
      .revokeRole(ROLE_PAUSER, holderA.publicKey)
      .accountsPartial({
        authority: authority.publicKey,
        config: configPda,
        roleAssignment: holderAPauserRole,
      })
      .rpc();

    console.log("    revoke PAUSER from holderA tx:", tx);

    // Verify role is deactivated (not closed, for audit trail)
    const revokedRole = await program.account.roleAssignment.fetch(holderAPauserRole);
    expect(revokedRole.active).to.equal(false);
  });

  it("confirms holderA still has MINTER and FREEZER roles after PAUSER revocation", async () => {
    const minterAccount = await program.account.roleAssignment.fetch(
      holderAMinterRole,
    );
    expect(minterAccount.role).to.equal(ROLE_MINTER);
    expect(minterAccount.active).to.equal(true);

    const freezerAccount = await program.account.roleAssignment.fetch(
      holderAFreezerRole,
    );
    expect(freezerAccount.role).to.equal(ROLE_FREEZER);
    expect(freezerAccount.active).to.equal(true);
  });

  // ------------------------------------------------------------------
  // 3. Only authority can grant/revoke roles
  // ------------------------------------------------------------------
  it("fails when an unauthorized user tries to grant a role", async () => {
    const [unauthorizedRole] = getRoleAddress(
      ROLE_ADMIN,
      configPda,
      unauthorizedUser.publicKey,
    );

    try {
      await program.methods
        .grantRole(ROLE_ADMIN, unauthorizedUser.publicKey)
        .accountsPartial({
          authority: unauthorizedUser.publicKey,
          config: configPda,
          roleAssignment: unauthorizedRole,
          systemProgram: SystemProgram.programId,
        })
        .signers([unauthorizedUser])
        .rpc();

      // Should not reach here
      expect.fail("Expected transaction to fail with Unauthorized");
    } catch (err: any) {
      // The constraint `authority.key() == config.authority` should cause failure
      expect(err.toString()).to.include("Unauthorized");
    }
  });

  it("fails when an unauthorized user tries to revoke a role", async () => {
    try {
      await program.methods
        .revokeRole(ROLE_MINTER, holderA.publicKey)
        .accountsPartial({
          authority: unauthorizedUser.publicKey,
          config: configPda,
          roleAssignment: holderAMinterRole,
        })
        .signers([unauthorizedUser])
        .rpc();

      expect.fail("Expected transaction to fail with Unauthorized");
    } catch (err: any) {
      expect(err.toString()).to.include("Unauthorized");
    }
  });

  // ------------------------------------------------------------------
  // 4. Minter quota enforcement
  // ------------------------------------------------------------------
  it("sets a limited quota for holderA and creates an ATA", async () => {
    const quotaLimit = new BN(500_000_000); // 500 tokens

    await program.methods
      .setQuota(holderA.publicKey, quotaLimit)
      .accountsPartial({
        authority: authority.publicKey,
        config: configPda,
        minterRole: holderAMinterRole,
        minterQuota: holderAQuota,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const quotaAccount = await program.account.minterQuota.fetch(holderAQuota);
    expect(quotaAccount.quotaLimit.toNumber()).to.equal(500_000_000);
    expect(quotaAccount.mintedAmount.toNumber()).to.equal(0);

    // Create ATA for holderA to receive minted tokens
    holderAAta = getAssociatedTokenAddressSync(
      mintKey,
      holderA.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID,
    );

    const tx = new anchor.web3.Transaction().add(
      createAssociatedTokenAccountInstruction(
        authority.publicKey,
        holderAAta,
        holderA.publicKey,
        mintKey,
        TOKEN_2022_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID,
      ),
    );
    await provider.sendAndConfirm(tx);
  });

  it("holderA mints 300 tokens within quota", async () => {
    const amount = new BN(300_000_000); // 300 tokens

    const tx = await program.methods
      .mintTokens(amount)
      .accountsPartial({
        minter: holderA.publicKey,
        config: configPda,
        minterRole: holderAMinterRole,
        minterQuota: holderAQuota,
        mint: mintKey,
        recipientTokenAccount: holderAAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .signers([holderA])
      .rpc();

    console.log("    mint 300 tokens tx:", tx);

    const quotaAccount = await program.account.minterQuota.fetch(holderAQuota);
    expect(quotaAccount.mintedAmount.toNumber()).to.equal(300_000_000);
  });

  it("holderA fails to mint 300 more tokens (would exceed 500 quota)", async () => {
    const amount = new BN(300_000_000); // 300 more would be 600 total > 500 limit

    try {
      await program.methods
        .mintTokens(amount)
        .accountsPartial({
          minter: holderA.publicKey,
          config: configPda,
          minterRole: holderAMinterRole,
          minterQuota: holderAQuota,
          mint: mintKey,
          recipientTokenAccount: holderAAta,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([holderA])
        .rpc();

      expect.fail("Expected transaction to fail with QuotaExceeded");
    } catch (err: any) {
      expect(err.toString()).to.include("QuotaExceeded");
    }
  });

  // ------------------------------------------------------------------
  // 5. Quota tracking across multiple mint calls
  // ------------------------------------------------------------------
  it("holderA mints 200 more tokens (exactly at quota limit)", async () => {
    const amount = new BN(200_000_000); // 200 more -> 500 total = quota

    const tx = await program.methods
      .mintTokens(amount)
      .accountsPartial({
        minter: holderA.publicKey,
        config: configPda,
        minterRole: holderAMinterRole,
        minterQuota: holderAQuota,
        mint: mintKey,
        recipientTokenAccount: holderAAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .signers([holderA])
      .rpc();

    console.log("    mint 200 more tokens tx:", tx);

    const quotaAccount = await program.account.minterQuota.fetch(holderAQuota);
    expect(quotaAccount.mintedAmount.toNumber()).to.equal(500_000_000);
    expect(quotaAccount.quotaLimit.toNumber()).to.equal(500_000_000);
  });

  it("holderA fails to mint even 1 lamport more (quota fully consumed)", async () => {
    const amount = new BN(1);

    try {
      await program.methods
        .mintTokens(amount)
        .accountsPartial({
          minter: holderA.publicKey,
          config: configPda,
          minterRole: holderAMinterRole,
          minterQuota: holderAQuota,
          mint: mintKey,
          recipientTokenAccount: holderAAta,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([holderA])
        .rpc();

      expect.fail("Expected transaction to fail with QuotaExceeded");
    } catch (err: any) {
      expect(err.toString()).to.include("QuotaExceeded");
    }
  });

  it("authority can increase quota to allow more minting", async () => {
    const newQuotaLimit = new BN(1_000_000_000); // raise to 1000 tokens

    await program.methods
      .setQuota(holderA.publicKey, newQuotaLimit)
      .accountsPartial({
        authority: authority.publicKey,
        config: configPda,
        minterRole: holderAMinterRole,
        minterQuota: holderAQuota,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const quotaAccount = await program.account.minterQuota.fetch(holderAQuota);
    expect(quotaAccount.quotaLimit.toNumber()).to.equal(1_000_000_000);
    // minted_amount should remain 500 (not reset)
    expect(quotaAccount.mintedAmount.toNumber()).to.equal(500_000_000);
  });

  it("holderA can mint again after quota increase", async () => {
    const amount = new BN(100_000_000); // 100 more tokens

    const tx = await program.methods
      .mintTokens(amount)
      .accountsPartial({
        minter: holderA.publicKey,
        config: configPda,
        minterRole: holderAMinterRole,
        minterQuota: holderAQuota,
        mint: mintKey,
        recipientTokenAccount: holderAAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .signers([holderA])
      .rpc();

    console.log("    mint 100 after quota raise tx:", tx);

    const quotaAccount = await program.account.minterQuota.fetch(holderAQuota);
    expect(quotaAccount.mintedAmount.toNumber()).to.equal(600_000_000);
  });

  // ------------------------------------------------------------------
  // 6. Verify config totals track across all minters
  // ------------------------------------------------------------------
  it("confirms config total_minted reflects all mints across holders", async () => {
    const configAccount = await program.account.stablecoinConfig.fetch(
      configPda,
    );
    // holderA minted 300 + 200 + 100 = 600 tokens total
    expect(configAccount.totalMinted.toNumber()).to.equal(600_000_000);
  });
});
