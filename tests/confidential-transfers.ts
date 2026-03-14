import * as anchor from "@coral-xyz/anchor";
import { Program, AnchorProvider, BN } from "@coral-xyz/anchor";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  Transaction,
} from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  getAccount,
  getMint,
} from "@solana/spl-token";
import { expect } from "chai";

// ---------------------------------------------------------------------------
// Constants & PDA helpers
// ---------------------------------------------------------------------------
const SSS_CORE_PROGRAM_ID = new PublicKey(
  "G3jadBDzaF2HbTY2at5auYYQQ94zhhWaocMuWDgUy2vL",
);
const SSS_TRANSFER_HOOK_PROGRAM_ID = new PublicKey(
  "EAzHNW2cjpYdBjLBJ9RVLoGryXQJE98dpHTdyPiE6389",
);

const CONFIG_SEED = Buffer.from("config");
const ROLE_SEED = Buffer.from("role");
const QUOTA_SEED = Buffer.from("quota");
const ALLOWLIST_SEED = Buffer.from("allowlist");

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

function getQuotaAddress(config: PublicKey, minter: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [QUOTA_SEED, config.toBuffer(), minter.toBuffer()],
    SSS_CORE_PROGRAM_ID,
  );
}

function getAllowlistAddress(config: PublicKey, address: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [ALLOWLIST_SEED, config.toBuffer(), address.toBuffer()],
    SSS_CORE_PROGRAM_ID,
  );
}

// ---------------------------------------------------------------------------
// Helpers to check Token-2022 extension data
// ---------------------------------------------------------------------------

/**
 * Check if the mint account contains the ConfidentialTransferMint extension.
 * ExtensionType::ConfidentialTransferMint = 3 in Token-2022.
 * After the base Mint data (82 bytes) and account type byte (1 byte at offset 165),
 * TLV entries follow: type (u16 LE) | length (u16 LE) | value (length bytes)
 */
function hasConfidentialTransferExtension(mintData: Buffer): boolean {
  if (mintData.length <= 166) return false;
  let offset = 166;
  while (offset + 4 <= mintData.length) {
    const extType = mintData.readUInt16LE(offset);
    const extLen = mintData.readUInt16LE(offset + 2);
    if (extType === 4) return true; // ConfidentialTransferMint
    offset += 4 + extLen;
    if (extLen === 0 && extType === 0) break; // padding/end
  }
  return false;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("Confidential Transfers: SSS-3 with ConfidentialTransferMint extension", () => {
  const provider = AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.SssCore as Program;
  const authority = provider.wallet as anchor.Wallet;

  // SSS-3 mint (allowlist + compliance + CT extension)
  const mintKeypair = Keypair.generate();
  const mintKey = mintKeypair.publicKey;
  const [configPda] = getConfigAddress(mintKey);

  // SSS-1 mint (no CT extension)
  const mintSss1Kp = Keypair.generate();
  const mintSss1Key = mintSss1Kp.publicKey;
  const [configSss1] = getConfigAddress(mintSss1Key);

  // Users
  const userA = Keypair.generate();
  const userB = Keypair.generate();

  // ==================================================================
  // Setup
  // ==================================================================
  before(async () => {
    for (const kp of [userA, userB]) {
      const sig = await provider.connection.requestAirdrop(
        kp.publicKey,
        2 * anchor.web3.LAMPORTS_PER_SOL,
      );
      await provider.connection.confirmTransaction(sig);
    }
  });

  // ==================================================================
  // 1. Init SSS-3 mint with CT extension
  // ==================================================================
  it("initializes an SSS-3 stablecoin with ConfidentialTransferMint extension", async () => {
    const input = {
      name: "CT Dollar",
      symbol: "CTD",
      uri: "https://example.com/ctd.json",
      decimals: 6,
      complianceEnabled: true,
      enableAllowlist: true,
      supplyCap: null,
    };

    await program.methods
      .initialize(input)
      .accountsPartial({
        authority: authority.publicKey,
        mint: mintKey,
        config: configPda,
        transferHookProgram: SSS_TRANSFER_HOOK_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        token2022Program: TOKEN_2022_PROGRAM_ID,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .signers([mintKeypair])
      .rpc();

    const config = await program.account.stablecoinConfig.fetch(configPda);
    expect(config.complianceEnabled).to.equal(true);
    expect(config.enableAllowlist).to.equal(true);
  });

  // ==================================================================
  // 2. Verify CT extension is present on the mint
  // ==================================================================
  it("verifies ConfidentialTransferMint extension is on the mint account", async () => {
    const mintInfo = await provider.connection.getAccountInfo(mintKey);
    expect(mintInfo).to.not.be.null;
    expect(mintInfo!.owner.toBase58()).to.equal(TOKEN_2022_PROGRAM_ID.toBase58());

    const hasCT = hasConfidentialTransferExtension(mintInfo!.data);
    expect(hasCT).to.equal(true, "Mint should have ConfidentialTransferMint extension");
  });

  // ==================================================================
  // 3. SSS-1 mint does NOT have CT extension
  // ==================================================================
  it("initializes SSS-1 mint without CT extension", async () => {
    const input = {
      name: "Basic Dollar",
      symbol: "BSD",
      uri: "https://example.com/bsd.json",
      decimals: 6,
      complianceEnabled: false,
      enableAllowlist: false,
      supplyCap: null,
    };

    await program.methods
      .initialize(input)
      .accountsPartial({
        authority: authority.publicKey,
        mint: mintSss1Key,
        config: configSss1,
        transferHookProgram: null,
        systemProgram: SystemProgram.programId,
        token2022Program: TOKEN_2022_PROGRAM_ID,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .signers([mintSss1Kp])
      .rpc();

    const mintInfo = await provider.connection.getAccountInfo(mintSss1Key);
    const hasCT = hasConfidentialTransferExtension(mintInfo!.data);
    expect(hasCT).to.equal(false, "SSS-1 mint should NOT have CT extension");
  });

  // ==================================================================
  // 4. Setup: Add users to allowlist, grant minter role, set quota
  // ==================================================================
  it("adds users to allowlist and sets up minting", async () => {
    // Add authority to allowlist
    const [allowlistAuth] = getAllowlistAddress(configPda, authority.publicKey);
    await program.methods
      .addToAllowlist(authority.publicKey)
      .accountsPartial({
        authority: authority.publicKey,
        config: configPda,
        allowlistEntry: allowlistAuth,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    // Add userA to allowlist
    const [allowlistA] = getAllowlistAddress(configPda, userA.publicKey);
    await program.methods
      .addToAllowlist(userA.publicKey)
      .accountsPartial({
        authority: authority.publicKey,
        config: configPda,
        allowlistEntry: allowlistA,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    // Add userB to allowlist
    const [allowlistB] = getAllowlistAddress(configPda, userB.publicKey);
    await program.methods
      .addToAllowlist(userB.publicKey)
      .accountsPartial({
        authority: authority.publicKey,
        config: configPda,
        allowlistEntry: allowlistB,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    // Grant minter role to authority
    const [minterRole] = getRoleAddress(ROLE_MINTER, configPda, authority.publicKey);
    await program.methods
      .grantRole(ROLE_MINTER, authority.publicKey)
      .accountsPartial({
        authority: authority.publicKey,
        config: configPda,
        roleAssignment: minterRole,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    // Set quota
    const [minterQuota] = getQuotaAddress(configPda, authority.publicKey);
    await program.methods
      .setQuota(authority.publicKey, new BN("18446744073709551615")) // u64::MAX
      .accountsPartial({
        authority: authority.publicKey,
        config: configPda,
        minterRole,
        minterQuota,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
  });

  // ==================================================================
  // 5. Create token accounts and mint tokens
  // ==================================================================
  it("creates token accounts for users (CT-enabled ATAs)", async () => {
    // Create ATAs for authority, userA, and userB
    for (const owner of [authority.publicKey, userA.publicKey, userB.publicKey]) {
      const ata = getAssociatedTokenAddressSync(
        mintKey,
        owner,
        true,
        TOKEN_2022_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID,
      );

      const ix = createAssociatedTokenAccountInstruction(
        authority.publicKey,
        ata,
        owner,
        mintKey,
        TOKEN_2022_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID,
      );

      const tx = new Transaction().add(ix);
      await provider.sendAndConfirm(tx);
    }
  });

  // ==================================================================
  // 6. Thaw accounts (SSS-3 uses DefaultAccountState::Frozen)
  // ==================================================================
  it("thaws frozen token accounts for CT operations", async () => {
    const ROLE_FREEZER = 0x03;
    const [freezerRole] = getRoleAddress(ROLE_FREEZER, configPda, authority.publicKey);

    // Grant freezer role
    await program.methods
      .grantRole(ROLE_FREEZER, authority.publicKey)
      .accountsPartial({
        authority: authority.publicKey,
        config: configPda,
        roleAssignment: freezerRole,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    // Thaw each account
    for (const owner of [authority.publicKey, userA.publicKey, userB.publicKey]) {
      const ata = getAssociatedTokenAddressSync(
        mintKey,
        owner,
        true,
        TOKEN_2022_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID,
      );

      await program.methods
        .thawAccount()
        .accountsPartial({
          freezer: authority.publicKey,
          config: configPda,
          freezerRole,
          mint: mintKey,
          targetTokenAccount: ata,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .rpc();
    }
  });

  // ==================================================================
  // 7. Mint tokens to authority's account
  // ==================================================================
  it("mints tokens to authority's token account", async () => {
    const authorityAta = getAssociatedTokenAddressSync(
      mintKey,
      authority.publicKey,
      true,
      TOKEN_2022_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID,
    );

    const [minterRole] = getRoleAddress(ROLE_MINTER, configPda, authority.publicKey);
    const [minterQuota] = getQuotaAddress(configPda, authority.publicKey);

    await program.methods
      .mintTokens(new BN(1_000_000_000)) // 1000 tokens (6 decimals)
      .accountsPartial({
        minter: authority.publicKey,
        config: configPda,
        minterRole,
        minterQuota,
        mint: mintKey,
        recipientTokenAccount: authorityAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();

    const account = await getAccount(
      provider.connection,
      authorityAta,
      "confirmed",
      TOKEN_2022_PROGRAM_ID,
    );
    expect(Number(account.amount)).to.equal(1_000_000_000);
  });

  // ==================================================================
  // 8. Verify CT extension data structure on mint
  // ==================================================================
  it("validates CT mint extension has auto_approve_new_accounts enabled", async () => {
    const mintInfo = await provider.connection.getAccountInfo(mintKey);
    const data = mintInfo!.data;

    // Find ConfidentialTransferMint extension (type = 3) in TLV
    let offset = 166;
    let ctData: Buffer | null = null;
    while (offset + 4 <= data.length) {
      const extType = data.readUInt16LE(offset);
      const extLen = data.readUInt16LE(offset + 2);
      if (extType === 4) { // ConfidentialTransferMint
        ctData = data.subarray(offset + 4, offset + 4 + extLen);
        break;
      }
      offset += 4 + extLen;
      if (extLen === 0 && extType === 0) break;
    }

    expect(ctData).to.not.be.null;

    // ConfidentialTransferMint layout:
    // authority: OptionalNonZeroPubkey (32 bytes)
    // auto_approve_new_accounts: PodBool (1 byte)
    // auditor_elgamal_pubkey: OptionalNonZeroElGamalPubkey (32 bytes)
    if (ctData) {
      // The authority field (32 bytes) should be the config PDA
      const ctAuthority = new PublicKey(ctData.subarray(0, 32));
      expect(ctAuthority.toBase58()).to.equal(
        configPda.toBase58(),
        "CT authority should be config PDA",
      );

      // auto_approve_new_accounts (byte 32) should be 1 (true)
      const autoApprove = ctData[32];
      expect(autoApprove).to.equal(1, "auto_approve_new_accounts should be true");
    }
  });

  // ==================================================================
  // 9. Mint tokens to userA's account
  // ==================================================================
  it("mints tokens to userA", async () => {
    const userAata = getAssociatedTokenAddressSync(
      mintKey,
      userA.publicKey,
      true,
      TOKEN_2022_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID,
    );

    const [minterRole] = getRoleAddress(ROLE_MINTER, configPda, authority.publicKey);
    const [minterQuota] = getQuotaAddress(configPda, authority.publicKey);

    await program.methods
      .mintTokens(new BN(500_000_000)) // 500 tokens
      .accountsPartial({
        minter: authority.publicKey,
        config: configPda,
        minterRole,
        minterQuota,
        mint: mintKey,
        recipientTokenAccount: userAata,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();

    const account = await getAccount(
      provider.connection,
      userAata,
      "confirmed",
      TOKEN_2022_PROGRAM_ID,
    );
    expect(Number(account.amount)).to.equal(500_000_000);
  });

  // ==================================================================
  // 10. Verify CT is not on SSS-1 mint (negative test)
  // ==================================================================
  it("SSS-1 mint does not have CT extension after initialization", async () => {
    const mintInfo = await provider.connection.getAccountInfo(mintSss1Key);
    expect(mintInfo).to.not.be.null;

    // SSS-1 mints should only have MetadataPointer, no CT
    const hasCT = hasConfidentialTransferExtension(mintInfo!.data);
    expect(hasCT).to.equal(false);

    // Verify it still has MetadataPointer extension (type = 18)
    let hasMetaPtr = false;
    let offset = 166;
    while (offset + 4 <= mintInfo!.data.length) {
      const extType = mintInfo!.data.readUInt16LE(offset);
      const extLen = mintInfo!.data.readUInt16LE(offset + 2);
      if (extType === 18) {
        hasMetaPtr = true;
        break;
      }
      offset += 4 + extLen;
      if (extLen === 0 && extType === 0) break;
    }
    expect(hasMetaPtr).to.equal(true, "SSS-1 should still have MetadataPointer");
  });

  // ==================================================================
  // 11. Verify config state is correct
  // ==================================================================
  it("confirms config state reflects CT-enabled SSS-3", async () => {
    const config = await program.account.stablecoinConfig.fetch(configPda);
    expect(config.enableAllowlist).to.equal(true);
    expect(config.complianceEnabled).to.equal(true);
    expect(config.paused).to.equal(false);
    expect(config.totalMinted.toNumber()).to.equal(1_500_000_000); // 1000 + 500
    expect(config.totalBurned.toNumber()).to.equal(0);
  });

  // ==================================================================
  // 12. Burn tokens works alongside CT extension
  // ==================================================================
  it("burns tokens from authority account (CT extension does not interfere)", async () => {
    const authorityAta = getAssociatedTokenAddressSync(
      mintKey,
      authority.publicKey,
      true,
      TOKEN_2022_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID,
    );

    await program.methods
      .burnTokens(new BN(100_000_000)) // burn 100 tokens
      .accountsPartial({
        burner: authority.publicKey,
        config: configPda,
        mint: mintKey,
        burnerTokenAccount: authorityAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();

    const account = await getAccount(
      provider.connection,
      authorityAta,
      "confirmed",
      TOKEN_2022_PROGRAM_ID,
    );
    expect(Number(account.amount)).to.equal(900_000_000); // 1000 - 100
  });

  // ==================================================================
  // 13. Verify total supply tracking with CT
  // ==================================================================
  it("verifies supply tracking is correct after mints and burns", async () => {
    const config = await program.account.stablecoinConfig.fetch(configPda);
    expect(config.totalMinted.toNumber()).to.equal(1_500_000_000);
    expect(config.totalBurned.toNumber()).to.equal(100_000_000);
    // Circulating = 1500 - 100 = 1400
    const circulating = config.totalMinted.toNumber() - config.totalBurned.toNumber();
    expect(circulating).to.equal(1_400_000_000);
  });
});
