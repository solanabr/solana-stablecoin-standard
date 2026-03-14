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
// PDA helpers (inline to keep tests self-contained)
// ---------------------------------------------------------------------------
const SSS_CORE_PROGRAM_ID = new PublicKey(
  "G3jadBDzaF2HbTY2at5auYYQQ94zhhWaocMuWDgUy2vL",
);

const CONFIG_SEED = Buffer.from("config");
const ROLE_SEED = Buffer.from("role");
const QUOTA_SEED = Buffer.from("quota");

const ROLE_MINTER = 0x01;
const ROLE_FREEZER = 0x03;

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
describe("SSS-1: Full lifecycle (compliance disabled)", () => {
  const provider = AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.SssCore as Program;
  const authority = provider.wallet as anchor.Wallet;

  // Fresh mint keypair for this test suite
  const mintKeypair = Keypair.generate();
  const mintKey = mintKeypair.publicKey;
  const [configPda, configBump] = getConfigAddress(mintKey);

  // Second wallet for transfer-authority testing
  const newAuthorityKeypair = Keypair.generate();

  // Minter is the authority wallet for simplicity
  const minter = authority.publicKey;
  const [minterRole] = getRoleAddress(ROLE_MINTER, configPda, minter);
  const [minterQuota] = getQuotaAddress(configPda, minter);

  // Freezer is the authority wallet
  const freezer = authority.publicKey;
  const [freezerRole] = getRoleAddress(ROLE_FREEZER, configPda, freezer);

  // Recipient keypair (for a second token account we can freeze)
  const recipient = Keypair.generate();
  let recipientAta: PublicKey;

  // Authority's own ATA for minting into and burning from
  let authorityAta: PublicKey;

  // ------------------------------------------------------------------
  // 1. Initialize SSS-1 mint
  // ------------------------------------------------------------------
  it("initializes an SSS-1 stablecoin (compliance disabled)", async () => {
    const input = {
      name: "Test USD",
      symbol: "TUSD",
      uri: "https://example.com/tusd.json",
      decimals: 6,
      complianceEnabled: false,
      enableAllowlist: false,
      supplyCap: null,
    };

    const tx = await program.methods
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

    console.log("    initialize tx:", tx);

    // Verify on-chain config
    const configAccount = await program.account.stablecoinConfig.fetch(
      configPda,
    );
    expect(configAccount.authority.toBase58()).to.equal(
      authority.publicKey.toBase58(),
    );
    expect(configAccount.mint.toBase58()).to.equal(mintKey.toBase58());
    expect(configAccount.paused).to.equal(false);
    expect(configAccount.complianceEnabled).to.equal(false);
    expect(configAccount.totalMinted.toNumber()).to.equal(0);
    expect(configAccount.totalBurned.toNumber()).to.equal(0);
    expect(
      configAccount.transferHookProgram.toBase58(),
    ).to.equal(PublicKey.default.toBase58());
  });

  // ------------------------------------------------------------------
  // 2. Grant minter role
  // ------------------------------------------------------------------
  it("grants minter role to the authority", async () => {
    const tx = await program.methods
      .grantRole(ROLE_MINTER, minter)
      .accountsPartial({
        authority: authority.publicKey,
        config: configPda,
        roleAssignment: minterRole,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    console.log("    grant_role (minter) tx:", tx);

    const roleAccount = await program.account.roleAssignment.fetch(minterRole);
    expect(roleAccount.holder.toBase58()).to.equal(minter.toBase58());
    expect(roleAccount.role).to.equal(ROLE_MINTER);
    expect(roleAccount.config.toBase58()).to.equal(configPda.toBase58());
  });

  // ------------------------------------------------------------------
  // 3. Set quota
  // ------------------------------------------------------------------
  it("sets minting quota for the minter", async () => {
    const quotaLimit = new BN(1_000_000_000); // 1 000 tokens (6 decimals)

    const tx = await program.methods
      .setQuota(minter, quotaLimit)
      .accountsPartial({
        authority: authority.publicKey,
        config: configPda,
        minterRole,
        minterQuota,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    console.log("    set_quota tx:", tx);

    const quotaAccount = await program.account.minterQuota.fetch(minterQuota);
    expect(quotaAccount.quotaLimit.toNumber()).to.equal(
      quotaLimit.toNumber(),
    );
    expect(quotaAccount.mintedAmount.toNumber()).to.equal(0);
  });

  // ------------------------------------------------------------------
  // 4. Create ATAs (helper — not a test assertion per se)
  // ------------------------------------------------------------------
  it("creates associated token accounts for authority and recipient", async () => {
    authorityAta = getAssociatedTokenAddressSync(
      mintKey,
      authority.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID,
    );

    recipientAta = getAssociatedTokenAddressSync(
      mintKey,
      recipient.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID,
    );

    // Build + send a tx that creates both ATAs
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
        recipientAta,
        recipient.publicKey,
        mintKey,
        TOKEN_2022_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID,
      ),
    );

    const sig = await provider.sendAndConfirm(tx);
    console.log("    create ATAs tx:", sig);
  });

  // ------------------------------------------------------------------
  // 5. Mint tokens
  // ------------------------------------------------------------------
  it("mints tokens to the authority ATA", async () => {
    const amount = new BN(500_000_000); // 500 tokens

    const tx = await program.methods
      .mintTokens(amount)
      .accountsPartial({
        minter,
        config: configPda,
        minterRole,
        minterQuota,
        mint: mintKey,
        recipientTokenAccount: authorityAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();

    console.log("    mint_tokens tx:", tx);

    // Verify config totals updated
    const configAccount = await program.account.stablecoinConfig.fetch(
      configPda,
    );
    expect(configAccount.totalMinted.toNumber()).to.equal(500_000_000);

    // Verify quota tracking
    const quotaAccount = await program.account.minterQuota.fetch(minterQuota);
    expect(quotaAccount.mintedAmount.toNumber()).to.equal(500_000_000);
  });

  // ------------------------------------------------------------------
  // 6. Burn tokens
  // ------------------------------------------------------------------
  it("burns tokens from the authority ATA", async () => {
    const amount = new BN(100_000_000); // 100 tokens

    const tx = await program.methods
      .burnTokens(amount)
      .accountsPartial({
        burner: authority.publicKey,
        config: configPda,
        mint: mintKey,
        burnerTokenAccount: authorityAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();

    console.log("    burn_tokens tx:", tx);

    const configAccount = await program.account.stablecoinConfig.fetch(
      configPda,
    );
    expect(configAccount.totalBurned.toNumber()).to.equal(100_000_000);
  });

  // ------------------------------------------------------------------
  // 7. Freeze / thaw
  // ------------------------------------------------------------------
  it("grants freezer role to the authority", async () => {
    const tx = await program.methods
      .grantRole(ROLE_FREEZER, freezer)
      .accountsPartial({
        authority: authority.publicKey,
        config: configPda,
        roleAssignment: freezerRole,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    console.log("    grant_role (freezer) tx:", tx);
  });

  it("freezes the recipient token account", async () => {
    const tx = await program.methods
      .freezeAccount()
      .accountsPartial({
        freezer,
        config: configPda,
        freezerRole,
        mint: mintKey,
        targetTokenAccount: recipientAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();

    console.log("    freeze_account tx:", tx);
  });

  it("thaws the recipient token account", async () => {
    const tx = await program.methods
      .thawAccount()
      .accountsPartial({
        freezer,
        config: configPda,
        freezerRole,
        mint: mintKey,
        targetTokenAccount: recipientAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();

    console.log("    thaw_account tx:", tx);
  });

  // ------------------------------------------------------------------
  // 8. Pause / unpause
  // ------------------------------------------------------------------
  it("pauses the stablecoin", async () => {
    const tx = await program.methods
      .pause()
      .accountsPartial({
        authority: authority.publicKey,
        config: configPda,
      })
      .rpc();

    console.log("    pause tx:", tx);

    const configAccount = await program.account.stablecoinConfig.fetch(
      configPda,
    );
    expect(configAccount.paused).to.equal(true);
  });

  it("unpauses the stablecoin", async () => {
    const tx = await program.methods
      .unpause()
      .accountsPartial({
        authority: authority.publicKey,
        config: configPda,
      })
      .rpc();

    console.log("    unpause tx:", tx);

    const configAccount = await program.account.stablecoinConfig.fetch(
      configPda,
    );
    expect(configAccount.paused).to.equal(false);
  });

  // ------------------------------------------------------------------
  // 9. Two-step authority transfer (propose → accept)
  // ------------------------------------------------------------------
  it("proposes authority transfer to a new wallet", async () => {
    const tx = await program.methods
      .proposeAuthority(newAuthorityKeypair.publicKey)
      .accountsPartial({
        authority: authority.publicKey,
        config: configPda,
      })
      .rpc();

    console.log("    propose_authority tx:", tx);

    const configAccount = await program.account.stablecoinConfig.fetch(
      configPda,
    );
    // Authority unchanged until accepted
    expect(configAccount.authority.toBase58()).to.equal(
      authority.publicKey.toBase58(),
    );
    expect(configAccount.pendingAuthority.toBase58()).to.equal(
      newAuthorityKeypair.publicKey.toBase58(),
    );
  });

  it("accepts authority transfer from the new wallet", async () => {
    // Airdrop to new authority so they can pay fees
    const airdropSig = await provider.connection.requestAirdrop(
      newAuthorityKeypair.publicKey,
      1_000_000_000,
    );
    await provider.connection.confirmTransaction(airdropSig);

    const tx = await program.methods
      .acceptAuthority()
      .accountsPartial({
        newAuthority: newAuthorityKeypair.publicKey,
        config: configPda,
      })
      .signers([newAuthorityKeypair])
      .rpc();

    console.log("    accept_authority tx:", tx);

    const configAccount = await program.account.stablecoinConfig.fetch(
      configPda,
    );
    expect(configAccount.authority.toBase58()).to.equal(
      newAuthorityKeypair.publicKey.toBase58(),
    );
    // Pending authority cleared
    expect(configAccount.pendingAuthority.toBase58()).to.equal(
      PublicKey.default.toBase58(),
    );
  });
});
