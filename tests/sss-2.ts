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
const SSS_TRANSFER_HOOK_PROGRAM_ID = new PublicKey(
  "EAzHNW2cjpYdBjLBJ9RVLoGryXQJE98dpHTdyPiE6389",
);

const CONFIG_SEED = Buffer.from("config");
const ROLE_SEED = Buffer.from("role");
const QUOTA_SEED = Buffer.from("quota");
const BLACKLIST_SEED = Buffer.from("blacklist");

const ROLE_MINTER = 0x01;
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

function getBlacklistAddress(
  config: PublicKey,
  address: PublicKey,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [BLACKLIST_SEED, config.toBuffer(), address.toBuffer()],
    SSS_CORE_PROGRAM_ID,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("SSS-2: Compliance lifecycle (transfer hook + blacklist + seize)", () => {
  const provider = AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.SssCore as Program;
  const authority = provider.wallet as anchor.Wallet;

  // Fresh mint keypair for this compliance-enabled test suite
  const mintKeypair = Keypair.generate();
  const mintKey = mintKeypair.publicKey;
  const [configPda] = getConfigAddress(mintKey);

  // Target wallet that will be blacklisted
  const targetKeypair = Keypair.generate();
  const targetPubkey = targetKeypair.publicKey;

  // Treasury wallet where seized funds go
  const treasuryKeypair = Keypair.generate();

  // ATAs
  let authorityAta: PublicKey;
  let targetAta: PublicKey;
  let treasuryAta: PublicKey;

  // Roles
  const [minterRole] = getRoleAddress(ROLE_MINTER, configPda, authority.publicKey);
  const [minterQuota] = getQuotaAddress(configPda, authority.publicKey);
  const [blacklisterRole] = getRoleAddress(
    ROLE_BLACKLISTER,
    configPda,
    authority.publicKey,
  );
  const [seizerRole] = getRoleAddress(ROLE_SEIZER, configPda, authority.publicKey);
  const [freezerRole] = getRoleAddress(ROLE_FREEZER, configPda, authority.publicKey);

  // Blacklist entry for the target
  const [blacklistEntry] = getBlacklistAddress(configPda, targetPubkey);

  // ------------------------------------------------------------------
  // 1. Initialize SSS-2 mint (compliance enabled + transfer hook)
  // ------------------------------------------------------------------
  it("initializes an SSS-2 stablecoin (compliance enabled with transfer hook)", async () => {
    const input = {
      name: "Compliant USD",
      symbol: "CUSD",
      uri: "https://example.com/cusd.json",
      decimals: 6,
      complianceEnabled: true,
      enableAllowlist: false,
      supplyCap: null,
    };

    const tx = await program.methods
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

    console.log("    initialize tx:", tx);

    const configAccount = await program.account.stablecoinConfig.fetch(
      configPda,
    );
    expect(configAccount.complianceEnabled).to.equal(true);
    expect(configAccount.transferHookProgram.toBase58()).to.equal(
      SSS_TRANSFER_HOOK_PROGRAM_ID.toBase58(),
    );
    expect(configAccount.paused).to.equal(false);
  });

  // ------------------------------------------------------------------
  // 2. Set up roles needed for compliance: minter, freezer, blacklister, seizer
  // ------------------------------------------------------------------
  it("grants minter role", async () => {
    const tx = await program.methods
      .grantRole(ROLE_MINTER, authority.publicKey)
      .accountsPartial({
        authority: authority.publicKey,
        config: configPda,
        roleAssignment: minterRole,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    console.log("    grant_role (minter) tx:", tx);
  });

  it("sets minter quota", async () => {
    const quotaLimit = new BN("18446744073709551615"); // u64::MAX (unlimited)

    const tx = await program.methods
      .setQuota(authority.publicKey, quotaLimit)
      .accountsPartial({
        authority: authority.publicKey,
        config: configPda,
        minterRole,
        minterQuota,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    console.log("    set_quota tx:", tx);
  });

  it("grants freezer role", async () => {
    const tx = await program.methods
      .grantRole(ROLE_FREEZER, authority.publicKey)
      .accountsPartial({
        authority: authority.publicKey,
        config: configPda,
        roleAssignment: freezerRole,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    console.log("    grant_role (freezer) tx:", tx);
  });

  it("grants blacklister role (SSS-2 only)", async () => {
    const tx = await program.methods
      .grantRole(ROLE_BLACKLISTER, authority.publicKey)
      .accountsPartial({
        authority: authority.publicKey,
        config: configPda,
        roleAssignment: blacklisterRole,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    console.log("    grant_role (blacklister) tx:", tx);

    const roleAccount = await program.account.roleAssignment.fetch(
      blacklisterRole,
    );
    expect(roleAccount.role).to.equal(ROLE_BLACKLISTER);
  });

  it("grants seizer role (SSS-2 only)", async () => {
    const tx = await program.methods
      .grantRole(ROLE_SEIZER, authority.publicKey)
      .accountsPartial({
        authority: authority.publicKey,
        config: configPda,
        roleAssignment: seizerRole,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    console.log("    grant_role (seizer) tx:", tx);

    const roleAccount = await program.account.roleAssignment.fetch(
      seizerRole,
    );
    expect(roleAccount.role).to.equal(ROLE_SEIZER);
  });

  // ------------------------------------------------------------------
  // 3. Create ATAs and mint tokens to target
  // ------------------------------------------------------------------
  it("creates ATAs for authority, target, and treasury", async () => {
    authorityAta = getAssociatedTokenAddressSync(
      mintKey,
      authority.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID,
    );
    targetAta = getAssociatedTokenAddressSync(
      mintKey,
      targetPubkey,
      false,
      TOKEN_2022_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID,
    );
    treasuryAta = getAssociatedTokenAddressSync(
      mintKey,
      treasuryKeypair.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID,
    );

    const tx = new anchor.web3.Transaction();
    tx.add(
      createAssociatedTokenAccountInstruction(
        authority.publicKey,
        authorityAta,
        authority.publicKey,
        mintKey,
        TOKEN_2022_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID,
      ),
    );
    tx.add(
      createAssociatedTokenAccountInstruction(
        authority.publicKey,
        targetAta,
        targetPubkey,
        mintKey,
        TOKEN_2022_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID,
      ),
    );
    tx.add(
      createAssociatedTokenAccountInstruction(
        authority.publicKey,
        treasuryAta,
        treasuryKeypair.publicKey,
        mintKey,
        TOKEN_2022_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID,
      ),
    );

    const sig = await provider.sendAndConfirm(tx);
    console.log("    create ATAs tx:", sig);
  });

  it("thaws target ATA (SSS-2 mints start frozen by default)", async () => {
    // SSS-2 uses DefaultAccountState::Frozen, so all new token accounts start
    // frozen and must be thawed before receiving tokens.
    const tx = await program.methods
      .thawAccount()
      .accountsPartial({
        freezer: authority.publicKey,
        config: configPda,
        freezerRole,
        mint: mintKey,
        targetTokenAccount: targetAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();

    console.log("    thaw target ATA tx:", tx);
  });

  it("thaws treasury ATA", async () => {
    const tx = await program.methods
      .thawAccount()
      .accountsPartial({
        freezer: authority.publicKey,
        config: configPda,
        freezerRole,
        mint: mintKey,
        targetTokenAccount: treasuryAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();

    console.log("    thaw treasury ATA tx:", tx);
  });

  it("thaws authority ATA", async () => {
    const tx = await program.methods
      .thawAccount()
      .accountsPartial({
        freezer: authority.publicKey,
        config: configPda,
        freezerRole,
        mint: mintKey,
        targetTokenAccount: authorityAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();

    console.log("    thaw authority ATA tx:", tx);
  });

  it("mints tokens to the target wallet", async () => {
    const amount = new BN(1_000_000_000); // 1 000 tokens

    const tx = await program.methods
      .mintTokens(amount)
      .accountsPartial({
        minter: authority.publicKey,
        config: configPda,
        minterRole,
        minterQuota,
        mint: mintKey,
        recipientTokenAccount: targetAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();

    console.log("    mint_tokens (to target) tx:", tx);

    const configAccount = await program.account.stablecoinConfig.fetch(
      configPda,
    );
    expect(configAccount.totalMinted.toNumber()).to.equal(1_000_000_000);
  });

  // ------------------------------------------------------------------
  // 4. Add target to blacklist
  // ------------------------------------------------------------------
  it("adds the target address to the blacklist", async () => {
    const tx = await program.methods
      .addToBlacklist(targetPubkey, "Sanctions compliance")
      .accountsPartial({
        blacklister: authority.publicKey,
        config: configPda,
        blacklisterRole,
        blacklistEntry,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    console.log("    add_to_blacklist tx:", tx);

    const entry = await program.account.blacklistEntry.fetch(blacklistEntry);
    expect(entry.address.toBase58()).to.equal(targetPubkey.toBase58());
    expect(entry.config.toBase58()).to.equal(configPda.toBase58());
    expect(entry.active).to.equal(true);
    expect(entry.reason).to.equal("Sanctions compliance");
    expect(entry.blacklistedBy.toBase58()).to.equal(authority.publicKey.toBase58());
    expect(entry.blacklistedAt.toNumber()).to.be.greaterThan(0);
  });

  // ------------------------------------------------------------------
  // 5. Verify the blacklist entry exists on-chain
  // ------------------------------------------------------------------
  it("confirms the target is blacklisted via account fetch", async () => {
    const entry = await program.account.blacklistEntry.fetch(blacklistEntry);
    expect(entry.active).to.equal(true);
  });

  // ------------------------------------------------------------------
  // 6. Freeze the target account before seize (simulate real-world state)
  // ------------------------------------------------------------------
  it("freezes the blacklisted target account (as a real compliance action would)", async () => {
    const tx = await program.methods
      .freezeAccount()
      .accountsPartial({
        freezer: authority.publicKey,
        config: configPda,
        freezerRole,
        mint: mintKey,
        targetTokenAccount: targetAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();

    console.log("    freeze target tx:", tx);
  });

  // ------------------------------------------------------------------
  // 7. Atomic seize: thaw → burn → refreeze → mint to treasury
  // ------------------------------------------------------------------
  it("atomically seizes tokens from the blacklisted frozen address to treasury", async () => {
    const seizeAmount = new BN(500_000_000); // 500 tokens

    const tx = await program.methods
      .seize(seizeAmount)
      .accountsPartial({
        seizer: authority.publicKey,
        config: configPda,
        seizerRole,
        blacklistEntry,
        targetOwner: targetPubkey,
        mint: mintKey,
        sourceTokenAccount: targetAta,
        treasuryTokenAccount: treasuryAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();

    console.log("    seize (atomic: thaw→burn→refreeze→mint) tx:", tx);
  });

  // ------------------------------------------------------------------
  // 8. Remove target from blacklist
  // ------------------------------------------------------------------
  it("removes the target from the blacklist", async () => {
    const tx = await program.methods
      .removeFromBlacklist(targetPubkey)
      .accountsPartial({
        blacklister: authority.publicKey,
        config: configPda,
        blacklisterRole,
        blacklistEntry,
      })
      .rpc();

    console.log("    remove_from_blacklist tx:", tx);

    // Verify blacklist entry is deactivated (not closed, for audit trail)
    const entry = await program.account.blacklistEntry.fetch(blacklistEntry);
    expect(entry.active).to.equal(false);
  });

  // ------------------------------------------------------------------
  // 9. Verify compliance state is consistent
  // ------------------------------------------------------------------
  it("confirms the config state is consistent after compliance operations", async () => {
    const configAccount = await program.account.stablecoinConfig.fetch(
      configPda,
    );
    expect(configAccount.complianceEnabled).to.equal(true);
    expect(configAccount.paused).to.equal(false);
    // Atomic seize: minted 1000 initial + 500 to treasury = 1500
    // burned: 500 from blacklisted
    // Net supply: 1500 - 500 = 1000 (same as before seize)
    expect(configAccount.totalMinted.toNumber()).to.equal(1_500_000_000);
    expect(configAccount.totalBurned.toNumber()).to.equal(500_000_000);
  });
});
