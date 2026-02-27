import * as anchor from "@coral-xyz/anchor";
import {
  Keypair,
  PublicKey,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAccount,
} from "@solana/spl-token";
import { expect } from "chai";
import BN from "bn.js";

import {
  SSSClient,
  StablecoinPreset,
  getConfigPda,
  getRoleRegistryPda,
  getMinterInfoPda,
  SSSError,
  SSS_TOKEN_PROGRAM_ID,
  SEEDS,
} from "../sdk/src";

describe("SDK Integration: SSSClient", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const wallet = provider.wallet as anchor.Wallet;
  let client: SSSClient;

  const mint = Keypair.generate();
  const recipient = Keypair.generate();

  // Derived addresses populated in before() and during tests
  let configPda: PublicKey;
  let configBump: number;
  let roleRegistryPda: PublicKey;
  let recipientAta: PublicKey;
  let authorityAta: PublicKey;

  before(async () => {
    // Airdrop SOL to the recipient so they can pay for token account creation if needed
    const sig = await provider.connection.requestAirdrop(
      recipient.publicKey,
      2 * LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(sig);
  });

  // ---------------------------------------------------------------
  // 1. SSSClient construction
  // ---------------------------------------------------------------
  describe("SSSClient construction", () => {
    it("creates a client with default program IDs", () => {
      // Pass the test environment's provider to avoid cross-dependency issues
      client = new SSSClient(provider.connection, wallet, { provider });

      expect(client).to.be.instanceOf(SSSClient);
      expect(client.connection).to.equal(provider.connection);
      expect(client.tokenProgramId.toBase58()).to.equal(
        SSS_TOKEN_PROGRAM_ID.toBase58()
      );
      expect(client.provider).to.exist;
    });

    it("creates a client with custom program IDs via options", () => {
      const customProgramId = Keypair.generate().publicKey;
      const customHookId = Keypair.generate().publicKey;
      const customClient = new SSSClient(provider.connection, wallet, {
        tokenProgramId: customProgramId,
        hookProgramId: customHookId,
      });

      expect(customClient.tokenProgramId.toBase58()).to.equal(
        customProgramId.toBase58()
      );
      expect(customClient.hookProgramId.toBase58()).to.equal(
        customHookId.toBase58()
      );
    });
  });

  // ---------------------------------------------------------------
  // 2. PDA derivation
  // ---------------------------------------------------------------
  describe("PDA derivation", () => {
    it("client.getConfigPda matches manual derivation", () => {
      const [clientPda, clientBump] = client.getConfigPda(mint.publicKey);

      // Manual derivation using the same seeds
      const [manualPda, manualBump] = PublicKey.findProgramAddressSync(
        [SEEDS.CONFIG, mint.publicKey.toBuffer()],
        SSS_TOKEN_PROGRAM_ID
      );

      expect(clientPda.toBase58()).to.equal(manualPda.toBase58());
      expect(clientBump).to.equal(manualBump);

      // Also matches the standalone exported helper
      const [helperPda, helperBump] = getConfigPda(mint.publicKey);
      expect(clientPda.toBase58()).to.equal(helperPda.toBase58());
      expect(clientBump).to.equal(helperBump);

      // Store for later use
      configPda = clientPda;
      configBump = clientBump;
    });

    it("client.getRoleRegistryPda matches manual derivation", () => {
      const [clientPda, clientBump] = client.getRoleRegistryPda(configPda);

      const [manualPda, manualBump] = PublicKey.findProgramAddressSync(
        [SEEDS.ROLES, configPda.toBuffer()],
        SSS_TOKEN_PROGRAM_ID
      );

      expect(clientPda.toBase58()).to.equal(manualPda.toBase58());
      expect(clientBump).to.equal(manualBump);

      // Also matches standalone helper
      const [helperPda, helperBump] = getRoleRegistryPda(configPda);
      expect(clientPda.toBase58()).to.equal(helperPda.toBase58());
      expect(clientBump).to.equal(helperBump);

      roleRegistryPda = clientPda;
    });

    it("client.getMinterInfoPda matches manual derivation", () => {
      const [clientPda, clientBump] = client.getMinterInfoPda(
        configPda,
        wallet.publicKey
      );

      const [manualPda, manualBump] = PublicKey.findProgramAddressSync(
        [
          SEEDS.MINTER,
          configPda.toBuffer(),
          wallet.publicKey.toBuffer(),
        ],
        SSS_TOKEN_PROGRAM_ID
      );

      expect(clientPda.toBase58()).to.equal(manualPda.toBase58());
      expect(clientBump).to.equal(manualBump);

      const [helperPda, helperBump] = getMinterInfoPda(
        configPda,
        wallet.publicKey
      );
      expect(clientPda.toBase58()).to.equal(helperPda.toBase58());
      expect(clientBump).to.equal(helperBump);
    });

    it("client.getAssociatedTokenAddress returns correct ATA", () => {
      const clientAta = client.getAssociatedTokenAddress(
        mint.publicKey,
        recipient.publicKey
      );
      const manualAta = getAssociatedTokenAddressSync(
        mint.publicKey,
        recipient.publicKey,
        true,
        TOKEN_2022_PROGRAM_ID
      );

      expect(clientAta.toBase58()).to.equal(manualAta.toBase58());
    });
  });

  // ---------------------------------------------------------------
  // 3. Initialize via client
  // ---------------------------------------------------------------
  describe("Initialize via client", () => {
    it("initializes an SSS-1 stablecoin through the SDK client", async () => {
      const { signature } = await client.initialize(
        {
          name: "SDK Dollar",
          symbol: "SDKD",
          uri: "https://example.com/sdk-meta.json",
          decimals: 6,
          preset: { sss1: {} },
        },
        mint
      );

      expect(signature).to.be.a("string");
      expect(signature.length).to.be.greaterThan(0);
    });
  });

  // ---------------------------------------------------------------
  // 4. Fetch config via client
  // ---------------------------------------------------------------
  describe("Fetch config via client", () => {
    it("fetchConfig returns the correct stablecoin configuration", async () => {
      const config = await client.fetchConfig(mint.publicKey);

      expect(config.name).to.equal("SDK Dollar");
      expect(config.symbol).to.equal("SDKD");
      expect(config.decimals).to.equal(6);
      expect(config.mint.toBase58()).to.equal(mint.publicKey.toBase58());
      expect(config.masterAuthority.toBase58()).to.equal(
        wallet.publicKey.toBase58()
      );
      expect(config.isPaused).to.equal(false);
      expect(config.enablePermanentDelegate).to.equal(false);
      expect(config.enableTransferHook).to.equal(false);
      expect(config.totalMinted.toNumber()).to.equal(0);
      expect(config.totalBurned.toNumber()).to.equal(0);
    });
  });

  // ---------------------------------------------------------------
  // 5. Fetch role registry
  // ---------------------------------------------------------------
  describe("Fetch role registry", () => {
    it("fetchRoleRegistry returns correct role assignments", async () => {
      const roles = await client.fetchRoleRegistry(configPda);

      expect(roles.config.toBase58()).to.equal(configPda.toBase58());
      expect(roles.masterAuthority.toBase58()).to.equal(
        wallet.publicKey.toBase58()
      );
      expect(roles.pauser.toBase58()).to.equal(wallet.publicKey.toBase58());
    });
  });

  // ---------------------------------------------------------------
  // 6. Update minter via client
  // ---------------------------------------------------------------
  describe("Update minter via client", () => {
    it("creates a minter with quota", async () => {
      const { signature } = await client.updateMinter(
        mint.publicKey,
        wallet.publicKey,
        {
          isActive: true,
          mintQuota: new BN(1_000_000_000), // 1000 tokens with 6 decimals
        }
      );

      expect(signature).to.be.a("string");

      // Verify minter info via SDK fetcher
      const minterInfo = await client.fetchMinterInfo(
        configPda,
        wallet.publicKey
      );
      expect(minterInfo.isActive).to.equal(true);
      expect(minterInfo.mintQuota.toNumber()).to.equal(1_000_000_000);
      expect(minterInfo.totalMinted.toNumber()).to.equal(0);
      expect(minterInfo.minter.toBase58()).to.equal(
        wallet.publicKey.toBase58()
      );
    });
  });

  // ---------------------------------------------------------------
  // 7. Mint via client
  // ---------------------------------------------------------------
  describe("Mint via client", () => {
    before(async () => {
      // Create ATAs using direct spl-token calls (avoids cross-dependency issues)
      recipientAta = getAssociatedTokenAddressSync(
        mint.publicKey,
        recipient.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID
      );
      authorityAta = getAssociatedTokenAddressSync(
        mint.publicKey,
        wallet.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID
      );

      const ixRecipient = createAssociatedTokenAccountInstruction(
        wallet.publicKey,
        recipientAta,
        recipient.publicKey,
        mint.publicKey,
        TOKEN_2022_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      );
      const ixAuthority = createAssociatedTokenAccountInstruction(
        wallet.publicKey,
        authorityAta,
        wallet.publicKey,
        mint.publicKey,
        TOKEN_2022_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      );

      const tx = new anchor.web3.Transaction().add(ixRecipient, ixAuthority);
      await provider.sendAndConfirm(tx);
    });

    it("mints tokens to the recipient", async () => {
      const mintAmount = new BN(500_000_000); // 500 tokens

      const { signature } = await client.mintTokens(
        mint.publicKey,
        mintAmount,
        recipientAta
      );

      expect(signature).to.be.a("string");
      await provider.connection.confirmTransaction(signature, "confirmed");

      // Verify on-chain balance
      const tokenAccount = await getAccount(
        provider.connection,
        recipientAta,
        "confirmed",
        TOKEN_2022_PROGRAM_ID
      );
      expect(Number(tokenAccount.amount)).to.equal(500_000_000);

      // Verify config totals updated
      const config = await client.fetchConfig(mint.publicKey);
      expect(config.totalMinted.toNumber()).to.equal(500_000_000);
    });

    it("mints tokens to the authority", async () => {
      const mintAmount = new BN(200_000_000); // 200 tokens

      const { signature } = await client.mintTokens(
        mint.publicKey,
        mintAmount,
        authorityAta
      );

      expect(signature).to.be.a("string");
      await provider.connection.confirmTransaction(signature, "confirmed");

      const tokenAccount = await getAccount(
        provider.connection,
        authorityAta,
        "confirmed",
        TOKEN_2022_PROGRAM_ID
      );
      expect(Number(tokenAccount.amount)).to.equal(200_000_000);

      const config = await client.fetchConfig(mint.publicKey);
      expect(config.totalMinted.toNumber()).to.equal(700_000_000);
    });
  });

  // ---------------------------------------------------------------
  // 8. Burn via client
  // ---------------------------------------------------------------
  describe("Burn via client", () => {
    it("burns tokens from the authority token account", async () => {
      const burnAmount = new BN(50_000_000); // 50 tokens

      const { signature } = await client.burnTokens(
        mint.publicKey,
        burnAmount,
        authorityAta
      );

      expect(signature).to.be.a("string");
      await provider.connection.confirmTransaction(signature, "confirmed");

      const tokenAccount = await getAccount(
        provider.connection,
        authorityAta,
        "confirmed",
        TOKEN_2022_PROGRAM_ID
      );
      expect(Number(tokenAccount.amount)).to.equal(150_000_000);

      const config = await client.fetchConfig(mint.publicKey);
      expect(config.totalBurned.toNumber()).to.equal(50_000_000);
    });
  });

  // ---------------------------------------------------------------
  // 9. Freeze / Thaw via client
  // ---------------------------------------------------------------
  describe("Freeze and Thaw via client", () => {
    it("freezes a token account", async () => {
      const { signature } = await client.freezeAccount(
        mint.publicKey,
        recipientAta
      );

      expect(signature).to.be.a("string");
      await provider.connection.confirmTransaction(signature, "confirmed");

      const tokenAccount = await getAccount(
        provider.connection,
        recipientAta,
        "confirmed",
        TOKEN_2022_PROGRAM_ID
      );
      expect(tokenAccount.isFrozen).to.equal(true);
    });

    it("thaws a frozen token account", async () => {
      const { signature } = await client.thawAccount(
        mint.publicKey,
        recipientAta
      );

      expect(signature).to.be.a("string");
      await provider.connection.confirmTransaction(signature, "confirmed");

      const tokenAccount = await getAccount(
        provider.connection,
        recipientAta,
        "confirmed",
        TOKEN_2022_PROGRAM_ID
      );
      expect(tokenAccount.isFrozen).to.equal(false);
    });
  });

  // ---------------------------------------------------------------
  // 10. Pause / Unpause via client
  // ---------------------------------------------------------------
  describe("Pause and Unpause via client", () => {
    it("pauses the stablecoin", async () => {
      const { signature } = await client.pause(mint.publicKey);

      expect(signature).to.be.a("string");

      const config = await client.fetchConfig(mint.publicKey);
      expect(config.isPaused).to.equal(true);
    });

    it("unpauses the stablecoin", async () => {
      const { signature } = await client.unpause(mint.publicKey);

      expect(signature).to.be.a("string");

      const config = await client.fetchConfig(mint.publicKey);
      expect(config.isPaused).to.equal(false);
    });
  });

  // ---------------------------------------------------------------
  // 11. Error handling - SSSError wrapping
  // ---------------------------------------------------------------
  describe("Error handling", () => {
    it("wraps ProgramPaused error as SSSError when minting while paused", async () => {
      // First pause the program
      await client.pause(mint.publicKey);

      const config = await client.fetchConfig(mint.publicKey);
      expect(config.isPaused).to.equal(true);

      try {
        await client.mintTokens(
          mint.publicKey,
          new BN(100_000_000),
          authorityAta
        );
        expect.fail("Should have thrown an error");
      } catch (err: any) {
        expect(err.name).to.equal("SSSError");
        expect(err.code).to.equal(6002);
        expect(err.errorName).to.equal("ProgramPaused");
        expect(err.message).to.include("ProgramPaused");
      }
    });

    it("wraps ProgramNotPaused error when unpausing an unpaused program", async () => {
      // Unpause first so we are in a normal state
      await client.unpause(mint.publicKey);

      try {
        await client.unpause(mint.publicKey);
        expect.fail("Should have thrown an error");
      } catch (err: any) {
        expect(err.name).to.equal("SSSError");
        expect(err.code).to.equal(6003);
        expect(err.errorName).to.equal("ProgramNotPaused");
      }
    });

    it("wraps MintAmountZero error when minting zero tokens", async () => {
      try {
        await client.mintTokens(
          mint.publicKey,
          new BN(0),
          authorityAta
        );
        expect.fail("Should have thrown an error");
      } catch (err: any) {
        expect(err.name).to.equal("SSSError");
        expect(err.code).to.equal(6006);
        expect(err.errorName).to.equal("MintAmountZero");
      }
    });

    it("wraps BurnAmountZero error when burning zero tokens", async () => {
      try {
        await client.burnTokens(
          mint.publicKey,
          new BN(0),
          authorityAta
        );
        expect.fail("Should have thrown an error");
      } catch (err: any) {
        expect(err.name).to.equal("SSSError");
        expect(err.code).to.equal(6007);
        expect(err.errorName).to.equal("BurnAmountZero");
      }
    });

    it("SSSError.fromCode returns null for unknown error codes", () => {
      const result = SSSError.fromCode(99999);
      expect(result).to.be.null;
    });

    it("SSSError.fromAnchorError returns null for non-Anchor errors", () => {
      const result = SSSError.fromAnchorError(new Error("random error"));
      expect(result).to.be.null;
    });
  });
});
