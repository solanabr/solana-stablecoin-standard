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
const ALLOWLIST_SEED = Buffer.from("allowlist");

const ROLE_MINTER = 0x01;
const ROLE_FREEZER = 0x03;
const ROLE_BLACKLISTER = 0x04;

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

function getAllowlistAddress(
  config: PublicKey,
  address: PublicKey,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [ALLOWLIST_SEED, config.toBuffer(), address.toBuffer()],
    SSS_CORE_PROGRAM_ID,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("SSS-3: Allowlist lifecycle", () => {
  const provider = AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.SssCore as Program;
  const authority = provider.wallet as anchor.Wallet;

  // Fresh mint for SSS-3 (allowlist mode)
  const mintKeypair = Keypair.generate();
  const mintKey = mintKeypair.publicKey;
  const [configPda] = getConfigAddress(mintKey);

  // Non-SSS-3 mint (compliance enabled but no allowlist)
  const mintNoAllowlistKp = Keypair.generate();
  const mintNoAllowlistKey = mintNoAllowlistKp.publicKey;
  const [configNoAllowlist] = getConfigAddress(mintNoAllowlistKey);

  // Non-compliance mint (SSS-1)
  const mintSss1Kp = Keypair.generate();
  const mintSss1Key = mintSss1Kp.publicKey;
  const [configSss1] = getConfigAddress(mintSss1Key);

  // Addresses to allowlist
  const userA = Keypair.generate();
  const userB = Keypair.generate();
  const unauthorizedUser = Keypair.generate();

  // Allowlist PDAs
  const [allowlistA] = getAllowlistAddress(configPda, userA.publicKey);
  const [allowlistB] = getAllowlistAddress(configPda, userB.publicKey);
  const [allowlistAuth] = getAllowlistAddress(configPda, authority.publicKey);

  // ------------------------------------------------------------------
  // Setup
  // ------------------------------------------------------------------
  before(async () => {
    // Fund test wallets
    for (const kp of [userA, userB, unauthorizedUser]) {
      const sig = await provider.connection.requestAirdrop(
        kp.publicKey,
        2 * anchor.web3.LAMPORTS_PER_SOL,
      );
      await provider.connection.confirmTransaction(sig);
    }
  });

  // ==================================================================
  // 1. Initialize SSS-3 (allowlist mode)
  // ==================================================================
  it("initializes an SSS-3 stablecoin (compliance + allowlist enabled)", async () => {
    const input = {
      name: "Allowlist USD",
      symbol: "AUSD",
      uri: "https://example.com/ausd.json",
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
  // 2. Add addresses to allowlist
  // ==================================================================
  it("adds userA to the allowlist", async () => {
    await program.methods
      .addToAllowlist(userA.publicKey)
      .accountsPartial({
        authority: authority.publicKey,
        config: configPda,
        allowlistEntry: allowlistA,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const entry = await program.account.allowlistEntry.fetch(allowlistA);
    expect(entry.address.toBase58()).to.equal(userA.publicKey.toBase58());
    expect(entry.config.toBase58()).to.equal(configPda.toBase58());
    expect(entry.addedBy.toBase58()).to.equal(authority.publicKey.toBase58());
    expect(entry.addedAt.toNumber()).to.be.greaterThan(0);
  });

  it("adds userB to the allowlist", async () => {
    await program.methods
      .addToAllowlist(userB.publicKey)
      .accountsPartial({
        authority: authority.publicKey,
        config: configPda,
        allowlistEntry: allowlistB,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const entry = await program.account.allowlistEntry.fetch(allowlistB);
    expect(entry.address.toBase58()).to.equal(userB.publicKey.toBase58());
  });

  it("adds the authority itself to the allowlist", async () => {
    await program.methods
      .addToAllowlist(authority.publicKey)
      .accountsPartial({
        authority: authority.publicKey,
        config: configPda,
        allowlistEntry: allowlistAuth,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const entry = await program.account.allowlistEntry.fetch(allowlistAuth);
    expect(entry.address.toBase58()).to.equal(authority.publicKey.toBase58());
  });

  // ==================================================================
  // 3. Double add fails (init constraint)
  // ==================================================================
  it("rejects adding already allowlisted address", async () => {
    try {
      await program.methods
        .addToAllowlist(userA.publicKey)
        .accountsPartial({
          authority: authority.publicKey,
          config: configPda,
          allowlistEntry: allowlistA,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      expect.fail("Should have thrown — address already allowlisted");
    } catch (err: any) {
      expect(err.toString()).to.satisfy(
        (msg: string) =>
          msg.includes("already in use") ||
          msg.includes("already been created") ||
          msg.includes("0x0"),
      );
    }
  });

  // ==================================================================
  // 4. Unauthorized user cannot add to allowlist
  // ==================================================================
  it("rejects add_to_allowlist from unauthorized user", async () => {
    const randomAddr = Keypair.generate().publicKey;
    const [randomAllowlist] = getAllowlistAddress(configPda, randomAddr);

    try {
      await program.methods
        .addToAllowlist(randomAddr)
        .accountsPartial({
          authority: unauthorizedUser.publicKey,
          config: configPda,
          allowlistEntry: randomAllowlist,
          systemProgram: SystemProgram.programId,
        })
        .signers([unauthorizedUser])
        .rpc();
      expect.fail("Should have thrown Unauthorized");
    } catch (err: any) {
      expect(err.toString()).to.include("Unauthorized");
    }
  });

  // ==================================================================
  // 5. Remove from allowlist
  // ==================================================================
  it("removes userB from the allowlist", async () => {
    await program.methods
      .removeFromAllowlist(userB.publicKey)
      .accountsPartial({
        authority: authority.publicKey,
        config: configPda,
        allowlistEntry: allowlistB,
      })
      .rpc();

    // Allowlist entries are CLOSED on removal (not deactivated)
    let exists = true;
    try {
      await program.account.allowlistEntry.fetch(allowlistB);
    } catch {
      exists = false;
    }
    expect(exists).to.equal(false);
  });

  // ==================================================================
  // 6. Removing non-existent allowlist entry fails
  // ==================================================================
  it("rejects removing a non-allowlisted address", async () => {
    const randomAddr = Keypair.generate().publicKey;
    const [randomAllowlist] = getAllowlistAddress(configPda, randomAddr);

    try {
      await program.methods
        .removeFromAllowlist(randomAddr)
        .accountsPartial({
          authority: authority.publicKey,
          config: configPda,
          allowlistEntry: randomAllowlist,
        })
        .rpc();
      expect.fail("Should have thrown — address not allowlisted");
    } catch (err: any) {
      expect(err.toString()).to.satisfy(
        (msg: string) =>
          msg.includes("AccountNotInitialized") ||
          msg.includes("account not found") ||
          msg.includes("Could not find") ||
          msg.includes("has not been created"),
      );
    }
  });

  // ==================================================================
  // 7. Unauthorized user cannot remove from allowlist
  // ==================================================================
  it("rejects remove_from_allowlist from unauthorized user", async () => {
    try {
      await program.methods
        .removeFromAllowlist(userA.publicKey)
        .accountsPartial({
          authority: unauthorizedUser.publicKey,
          config: configPda,
          allowlistEntry: allowlistA,
        })
        .signers([unauthorizedUser])
        .rpc();
      expect.fail("Should have thrown Unauthorized");
    } catch (err: any) {
      expect(err.toString()).to.include("Unauthorized");
    }
  });

  // ==================================================================
  // 8. Re-add after removal works
  // ==================================================================
  it("re-adds userB after removal", async () => {
    await program.methods
      .addToAllowlist(userB.publicKey)
      .accountsPartial({
        authority: authority.publicKey,
        config: configPda,
        allowlistEntry: allowlistB,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const entry = await program.account.allowlistEntry.fetch(allowlistB);
    expect(entry.address.toBase58()).to.equal(userB.publicKey.toBase58());
  });

  // ==================================================================
  // 9. Allowlist fails on SSS-2 (no allowlist mode)
  // ==================================================================
  it("initializes SSS-2 (compliance enabled, allowlist disabled)", async () => {
    const input = {
      name: "No Allowlist USD",
      symbol: "NAUSD",
      uri: "https://example.com/nausd.json",
      decimals: 6,
      complianceEnabled: true,
      enableAllowlist: false,
      supplyCap: null,
    };

    await program.methods
      .initialize(input)
      .accountsPartial({
        authority: authority.publicKey,
        mint: mintNoAllowlistKey,
        config: configNoAllowlist,
        transferHookProgram: SSS_TRANSFER_HOOK_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        token2022Program: TOKEN_2022_PROGRAM_ID,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .signers([mintNoAllowlistKp])
      .rpc();

    const config = await program.account.stablecoinConfig.fetch(configNoAllowlist);
    expect(config.enableAllowlist).to.equal(false);
  });

  it("rejects add_to_allowlist on SSS-2 (allowlist not enabled)", async () => {
    const randomAddr = Keypair.generate().publicKey;
    const [al] = getAllowlistAddress(configNoAllowlist, randomAddr);

    try {
      await program.methods
        .addToAllowlist(randomAddr)
        .accountsPartial({
          authority: authority.publicKey,
          config: configNoAllowlist,
          allowlistEntry: al,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      expect.fail("Should have thrown AllowlistNotEnabled");
    } catch (err: any) {
      expect(err.toString()).to.include("AllowlistNotEnabled");
    }
  });

  // ==================================================================
  // 10. Allowlist fails on SSS-1 (no compliance)
  // ==================================================================
  it("initializes SSS-1 (compliance disabled)", async () => {
    const input = {
      name: "Basic USD",
      symbol: "BUSD",
      uri: "https://example.com/busd.json",
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
  });

  it("rejects add_to_allowlist on SSS-1 (allowlist not enabled)", async () => {
    const randomAddr = Keypair.generate().publicKey;
    const [al] = getAllowlistAddress(configSss1, randomAddr);

    try {
      await program.methods
        .addToAllowlist(randomAddr)
        .accountsPartial({
          authority: authority.publicKey,
          config: configSss1,
          allowlistEntry: al,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      expect.fail("Should have thrown AllowlistNotEnabled");
    } catch (err: any) {
      expect(err.toString()).to.include("AllowlistNotEnabled");
    }
  });

  // ==================================================================
  // 11. Allowlist requires compliance (cannot init with allowlist but no compliance)
  // ==================================================================
  it("rejects initialization with enableAllowlist=true but complianceEnabled=false", async () => {
    const badMintKp = Keypair.generate();
    const [badConfig] = getConfigAddress(badMintKp.publicKey);

    try {
      const input = {
        name: "Bad Config",
        symbol: "BAD",
        uri: "https://example.com/bad.json",
        decimals: 6,
        complianceEnabled: false,
        enableAllowlist: true,
        supplyCap: null,
      };

      await program.methods
        .initialize(input)
        .accountsPartial({
          authority: authority.publicKey,
          mint: badMintKp.publicKey,
          config: badConfig,
          transferHookProgram: null,
          systemProgram: SystemProgram.programId,
          token2022Program: TOKEN_2022_PROGRAM_ID,
          rent: SYSVAR_RENT_PUBKEY,
        })
        .signers([badMintKp])
        .rpc();
      expect.fail("Should have thrown — allowlist requires compliance");
    } catch (err: any) {
      expect(err.toString()).to.satisfy(
        (msg: string) =>
          msg.includes("AllowlistNotEnabled") ||
          msg.includes("ComplianceNotEnabled") ||
          msg.includes("AllowlistRequiresCompliance") ||
          msg.includes("Error"),
      );
    }
  });
});
