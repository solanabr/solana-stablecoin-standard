import { readFileSync } from "fs";
import * as os from "os";
import * as path from "path";

import { BN, Wallet } from "@coral-xyz/anchor";
import { expect } from "chai";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  getAccount,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";

import { SSSClient } from "../../sdk/src/client";
import {
  SSS_TOKEN_PROGRAM_ID,
  SSS_TRANSFER_HOOK_PROGRAM_ID,
} from "../../sdk/src/constants";
import type {
  MinterInfo,
  RoleRegistry,
  StablecoinConfig,
} from "../../sdk/src/types";

const DEVNET_RPC_URL = process.env.RPC_URL || "https://api.devnet.solana.com";
const KEYPAIR_PATH =
  process.env.KEYPAIR_PATH || path.join(os.homedir(), ".config/solana/id.json");
const DEVNET_MINT = new PublicKey(
  "Dr9YFKuQqr8f8ZUFUc9HETmpm2BJpRSKFKGHGFJWxpFk"
);
const DEFAULT_PUBLIC_KEY = new PublicKey(
  "11111111111111111111111111111111"
);
const OPERATOR_FUNDING_LAMPORTS = 0.05 * LAMPORTS_PER_SOL;
const CONFIRM_COMMITMENT = "confirmed" as const;

function loadKeypair(filePath: string): Keypair {
  const secretKey = JSON.parse(readFileSync(filePath, "utf-8"));
  return Keypair.fromSecretKey(Uint8Array.from(secretKey));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function bnToSafeNumber(value: BN, label: string): number {
  const maxSafe = new BN(Number.MAX_SAFE_INTEGER.toString());
  expect(
    value.lte(maxSafe),
    `${label} exceeds Number.MAX_SAFE_INTEGER and cannot be sent through the current SDK signature`
  ).to.equal(true);
  return Number(value.toString());
}

function baseUnits(decimals: number, wholeTokens: number): BN {
  return new BN(10).pow(new BN(decimals)).muln(wholeTokens);
}

async function confirmAndLog(
  connection: Connection,
  label: string,
  signature: string
): Promise<void> {
  console.log(`[${label}] tx: ${signature}`);
  await connection.confirmTransaction(signature, CONFIRM_COMMITMENT);
  await sleep(1_200);
}

function logReadOnly(label: string): void {
  console.log(`[${label}] tx: n/a (read-only)`);
}

describe("Console pages e2e against Solana devnet", function () {
  this.timeout(20 * 60_000);

  let connection: Connection;
  let authority: Keypair;
  let authorityClient: SSSClient;
  let operator: Keypair;
  let operatorClient: SSSClient;
  let targetUser: Keypair;

  let configPda: PublicKey;
  let operatorAta: PublicKey;
  let targetAta: PublicKey;

  let originalConfig: StablecoinConfig;
  let originalRoles: RoleRegistry;
  let originalWasPaused = false;

  let initialOperatorQuota: BN;
  let updatedOperatorQuota: BN;
  let operatorMintAmount: BN;
  let targetMintAmount: BN;
  let temporarySupplyCap = 0;

  let updatedMetadata: {
    name: string;
    symbol: string;
    uri: string;
  };

  before(async () => {
    connection = new Connection(DEVNET_RPC_URL, {
      commitment: CONFIRM_COMMITMENT,
      confirmTransactionInitialTimeout: 120_000,
    });

    authority = loadKeypair(KEYPAIR_PATH);
    authorityClient = new SSSClient(connection, new Wallet(authority), {
      tokenProgramId: SSS_TOKEN_PROGRAM_ID,
      hookProgramId: SSS_TRANSFER_HOOK_PROGRAM_ID,
    });

    operator = Keypair.generate();
    operatorClient = new SSSClient(connection, new Wallet(operator), {
      tokenProgramId: SSS_TOKEN_PROGRAM_ID,
      hookProgramId: SSS_TRANSFER_HOOK_PROGRAM_ID,
    });
    targetUser = Keypair.generate();

    [configPda] = authorityClient.getConfigPda(DEVNET_MINT);
    operatorAta = authorityClient.getAssociatedTokenAddress(
      DEVNET_MINT,
      operator.publicKey
    );
    targetAta = authorityClient.getAssociatedTokenAddress(
      DEVNET_MINT,
      targetUser.publicKey
    );

    originalConfig = await authorityClient.fetchConfig(DEVNET_MINT);
    originalRoles = await authorityClient.fetchRoleRegistry(configPda);
    originalWasPaused = originalConfig.isPaused;

    expect(originalConfig.mint.toBase58()).to.equal(DEVNET_MINT.toBase58());
    expect(originalConfig.masterAuthority.toBase58()).to.equal(
      authority.publicKey.toBase58()
    );
    expect(originalConfig.pendingAuthority.toBase58()).to.equal(
      DEFAULT_PUBLIC_KEY.toBase58()
    );
    expect(originalConfig.enablePermanentDelegate).to.equal(true);
    expect(originalConfig.enableTransferHook).to.equal(true);

    const authorityBalance = await connection.getBalance(authority.publicKey);
    expect(
      authorityBalance,
      "Authority wallet needs SOL to pay for 20+ devnet transactions"
    ).to.be.greaterThan(0.08 * LAMPORTS_PER_SOL);

    await fundOperatorIfNeeded();
    await createAtaIfMissing(operator.publicKey, operatorAta, "setup operator ATA");
    await createAtaIfMissing(targetUser.publicKey, targetAta, "setup target ATA");
    await thawIfFrozen(operatorAta, "setup thaw operator ATA");
    await thawIfFrozen(targetAta, "setup thaw target ATA");

    if (originalWasPaused) {
      const { signature } = await authorityClient.unpause(DEVNET_MINT);
      await confirmAndLog(connection, "setup unpause initial state", signature);
    }

    const nonce = Date.now().toString(36).slice(-6);
    operatorMintAmount = baseUnits(originalConfig.decimals, 3);
    targetMintAmount = baseUnits(originalConfig.decimals, 2);
    updatedOperatorQuota = baseUnits(originalConfig.decimals, 8);
    initialOperatorQuota = baseUnits(originalConfig.decimals, 10);

    const currentSupply = originalConfig.totalMinted.sub(originalConfig.totalBurned);
    const candidateCap = currentSupply
      .add(initialOperatorQuota)
      .add(baseUnits(originalConfig.decimals, 5));
    temporarySupplyCap = bnToSafeNumber(
      candidateCap.eq(originalConfig.supplyCap)
        ? candidateCap.add(baseUnits(originalConfig.decimals, 1))
        : candidateCap,
      "temporary supply cap"
    );

    updatedMetadata = {
      name: `E2E ${nonce}`.slice(0, 32),
      symbol: `E2E${nonce.slice(-4)}`.slice(0, 10),
      uri: `https://example.com/sss/e2e/${nonce}`,
    };
  });

  after(async () => {
    const cleanupErrors: string[] = [];

    const runCleanup = async (
      label: string,
      task: () => Promise<void>
    ): Promise<void> => {
      try {
        await task();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        cleanupErrors.push(`${label}: ${message}`);
      }
    };

    await runCleanup("restore original authority", async () => {
      await settleAuthorityBackToOriginal();
    });

    await runCleanup("restore remaining state", async () => {
      const liveConfig = await authorityClient.fetchConfig(DEVNET_MINT);

      if (liveConfig.isPaused) {
        const { signature } = await authorityClient.unpause(DEVNET_MINT);
        await confirmAndLog(connection, "cleanup unpause for restoration", signature);
      }

      await burnAccountIfNeeded(operatorAta, "cleanup burn operator residual");
      await burnAccountIfNeeded(targetAta, "cleanup burn target residual");

      const blacklistEntry = await authorityClient.fetchBlacklistEntry(
        configPda,
        targetUser.publicKey
      );
      if (blacklistEntry) {
        const { signature } = await authorityClient.blacklistRemove(
          DEVNET_MINT,
          targetUser.publicKey,
          targetAta
        );
        await confirmAndLog(connection, "cleanup blacklist remove", signature);
      }

      const allowlistEntry = await authorityClient.fetchAllowlistEntry(
        configPda,
        targetUser.publicKey
      );
      if (allowlistEntry) {
        const { signature } = await authorityClient.allowlistRemove(
          DEVNET_MINT,
          targetUser.publicKey,
          targetAta
        );
        await confirmAndLog(connection, "cleanup allowlist remove", signature);
      }

      await thawIfFrozen(targetAta, "cleanup thaw target ATA");
      await thawIfFrozen(operatorAta, "cleanup thaw operator ATA");

      const currentRoles = await authorityClient.fetchRoleRegistry(configPda);
      if (!currentRoles.pauser.equals(originalRoles.pauser)) {
        const { signature } = await authorityClient.updateRoles(DEVNET_MINT, {
          role: { pauser: {} },
          newHolder: originalRoles.pauser,
        });
        await confirmAndLog(connection, "cleanup restore pauser", signature);
      }

      const minterInfo = await fetchMinterInfoOrNull(operator.publicKey);
      if (
        minterInfo &&
        (minterInfo.isActive || !minterInfo.mintQuota.isZero())
      ) {
        const { signature } = await authorityClient.updateMinter(
          DEVNET_MINT,
          operator.publicKey,
          {
            isActive: false,
            mintQuota: new BN(0),
          }
        );
        await confirmAndLog(connection, "cleanup deactivate operator minter", signature);
      }

      const metadataConfig = await authorityClient.fetchConfig(DEVNET_MINT);
      if (
        metadataConfig.name !== originalConfig.name ||
        metadataConfig.symbol !== originalConfig.symbol ||
        metadataConfig.uri !== originalConfig.uri
      ) {
        const { signature } = await authorityClient.updateMetadata(DEVNET_MINT, {
          name: originalConfig.name,
          symbol: originalConfig.symbol,
          uri: originalConfig.uri,
        });
        await confirmAndLog(connection, "cleanup restore metadata", signature);
      }

      const capConfig = await authorityClient.fetchConfig(DEVNET_MINT);
      if (!capConfig.supplyCap.eq(originalConfig.supplyCap)) {
        const { signature } = await authorityClient.setSupplyCap(
          DEVNET_MINT,
          bnToSafeNumber(originalConfig.supplyCap, "original supply cap")
        );
        await confirmAndLog(connection, "cleanup restore supply cap", signature);
      }

      const finalConfig = await authorityClient.fetchConfig(DEVNET_MINT);
      if (finalConfig.isPaused !== originalWasPaused) {
        const { signature } = originalWasPaused
          ? await authorityClient.pause(DEVNET_MINT)
          : await authorityClient.unpause(DEVNET_MINT);
        await confirmAndLog(connection, "cleanup restore pause state", signature);
      }
    });

    if (cleanupErrors.length > 0) {
      throw new Error(`Cleanup failed:\n${cleanupErrors.join("\n")}`);
    }
  });

  it("fetchConfig loads the live config", async () => {
    logReadOnly("fetchConfig");
    const config = await authorityClient.fetchConfig(DEVNET_MINT);
    expect(config.mint.toBase58()).to.equal(DEVNET_MINT.toBase58());
    expect(config.masterAuthority.toBase58()).to.equal(
      authority.publicKey.toBase58()
    );
    expect(config.name).to.be.a("string").and.not.equal("");
    expect(config.symbol).to.be.a("string").and.not.equal("");
  });

  it("fetchRoleRegistry loads the live roles", async () => {
    logReadOnly("fetchRoleRegistry");
    const roles = await authorityClient.fetchRoleRegistry(configPda);
    expect(roles.config.toBase58()).to.equal(configPda.toBase58());
    expect(roles.masterAuthority.toBase58()).to.equal(
      authority.publicKey.toBase58()
    );
  });

  it("initializeExtraAccountMetaList is already initialized", async () => {
    logReadOnly("initializeExtraAccountMetaList verify");
    const [extraMetaPda] = authorityClient.getExtraAccountMetaListPda(DEVNET_MINT);
    const account = await connection.getAccountInfo(extraMetaPda);
    expect(account).to.not.equal(null);
    expect(account!.owner.toBase58()).to.equal(
      SSS_TRANSFER_HOOK_PROGRAM_ID.toBase58()
    );
  });

  it("getAssociatedTokenAddress derives the expected Token-2022 ATA", async () => {
    logReadOnly("getAssociatedTokenAddress");
    const sdkAta = authorityClient.getAssociatedTokenAddress(
      DEVNET_MINT,
      operator.publicKey
    );
    const manualAta = getAssociatedTokenAddressSync(
      DEVNET_MINT,
      operator.publicKey,
      true,
      TOKEN_2022_PROGRAM_ID
    );
    expect(sdkAta.toBase58()).to.equal(manualAta.toBase58());
    expect(sdkAta.toBase58()).to.equal(operatorAta.toBase58());
  });

  it("setSupplyCap raises the cap for controlled minting", async () => {
    const { signature } = await authorityClient.setSupplyCap(
      DEVNET_MINT,
      temporarySupplyCap
    );
    await confirmAndLog(connection, "setSupplyCap", signature);

    const config = await authorityClient.fetchConfig(DEVNET_MINT);
    expect(config.supplyCap.toString()).to.equal(temporarySupplyCap.toString());
  });

  it("updateMinter activates the operator wallet with an initial quota", async () => {
    const { signature } = await authorityClient.updateMinter(
      DEVNET_MINT,
      operator.publicKey,
      {
        isActive: true,
        mintQuota: initialOperatorQuota,
      }
    );
    await confirmAndLog(connection, "updateMinter activate", signature);

    const minterInfo = await authorityClient.fetchMinterInfo(
      configPda,
      operator.publicKey
    );
    expect(minterInfo.isActive).to.equal(true);
    expect(minterInfo.mintQuota.toString()).to.equal(
      initialOperatorQuota.toString()
    );
  });

  it("fetchAllMinters returns the delegated operator", async () => {
    logReadOnly("fetchAllMinters");
    const minters = await authorityClient.fetchAllMinters(DEVNET_MINT);
    expect(minters.length).to.be.greaterThan(0);
    expect(
      minters.some(({ account }) => account.minter.equals(operator.publicKey))
    ).to.equal(true);
  });

  it("getTotalSupply returns internally consistent totals", async () => {
    logReadOnly("getTotalSupply");
    const supply = await authorityClient.getTotalSupply(DEVNET_MINT);
    expect(supply.currentSupply.toString()).to.equal(
      supply.totalMinted.sub(supply.totalBurned).toString()
    );
    expect(supply.decimals).to.equal(originalConfig.decimals);
  });

  it("freezeAccount freezes the target ATA", async () => {
    const { signature } = await authorityClient.freezeAccount(DEVNET_MINT, targetAta);
    await confirmAndLog(connection, "freezeAccount", signature);

    const account = await getAccount(
      connection,
      targetAta,
      CONFIRM_COMMITMENT,
      TOKEN_2022_PROGRAM_ID
    );
    expect(account.isFrozen).to.equal(true);
  });

  it("thawAccount thaws the target ATA", async () => {
    const { signature } = await authorityClient.thawAccount(DEVNET_MINT, targetAta);
    await confirmAndLog(connection, "thawAccount", signature);

    const account = await getAccount(
      connection,
      targetAta,
      CONFIRM_COMMITMENT,
      TOKEN_2022_PROGRAM_ID
    );
    expect(account.isFrozen).to.equal(false);
  });

  it("pause pauses the stablecoin", async () => {
    const { signature } = await authorityClient.pause(DEVNET_MINT);
    await confirmAndLog(connection, "pause", signature);

    const config = await authorityClient.fetchConfig(DEVNET_MINT);
    expect(config.isPaused).to.equal(true);
  });

  it("unpause resumes the stablecoin", async () => {
    const { signature } = await authorityClient.unpause(DEVNET_MINT);
    await confirmAndLog(connection, "unpause", signature);

    const config = await authorityClient.fetchConfig(DEVNET_MINT);
    expect(config.isPaused).to.equal(false);
  });

  it("mintTokens mints to the operator ATA", async () => {
    const { signature } = await operatorClient.mintTokens(
      DEVNET_MINT,
      operatorMintAmount,
      operatorAta
    );
    await confirmAndLog(connection, "mintTokens operator", signature);

    const account = await getAccount(
      connection,
      operatorAta,
      CONFIRM_COMMITMENT,
      TOKEN_2022_PROGRAM_ID
    );
    expect(account.amount.toString()).to.equal(operatorMintAmount.toString());
  });

  it("updateMinter changes the operator quota", async () => {
    const { signature } = await authorityClient.updateMinter(
      DEVNET_MINT,
      operator.publicKey,
      {
        isActive: true,
        mintQuota: updatedOperatorQuota,
      }
    );
    await confirmAndLog(connection, "updateMinter quota", signature);

    const minterInfo = await authorityClient.fetchMinterInfo(
      configPda,
      operator.publicKey
    );
    expect(minterInfo.mintQuota.toString()).to.equal(
      updatedOperatorQuota.toString()
    );
  });

  it("allowlistAdd adds the target user", async () => {
    const { signature } = await authorityClient.allowlistAdd(
      DEVNET_MINT,
      targetUser.publicKey,
      targetAta,
      { reason: "console e2e allowlist add" }
    );
    await confirmAndLog(connection, "allowlistAdd", signature);

    const entry = await authorityClient.fetchAllowlistEntry(
      configPda,
      targetUser.publicKey
    );
    expect(entry).to.not.equal(null);
    expect(entry!.address.toBase58()).to.equal(targetUser.publicKey.toBase58());
  });

  it("allowlistRemove removes the target user", async () => {
    const { signature } = await authorityClient.allowlistRemove(
      DEVNET_MINT,
      targetUser.publicKey,
      targetAta
    );
    await confirmAndLog(connection, "allowlistRemove", signature);

    const entry = await authorityClient.fetchAllowlistEntry(
      configPda,
      targetUser.publicKey
    );
    expect(entry).to.equal(null);
  });

  it("updateRoles reassigns the pauser role temporarily", async () => {
    const { signature } = await authorityClient.updateRoles(DEVNET_MINT, {
      role: { pauser: {} },
      newHolder: operator.publicKey,
    });
    await confirmAndLog(connection, "updateRoles pauser -> operator", signature);

    const roles = await authorityClient.fetchRoleRegistry(configPda);
    expect(roles.pauser.toBase58()).to.equal(operator.publicKey.toBase58());
  });

  it("updateRoles restores the original pauser", async () => {
    const { signature } = await authorityClient.updateRoles(DEVNET_MINT, {
      role: { pauser: {} },
      newHolder: originalRoles.pauser,
    });
    await confirmAndLog(connection, "updateRoles pauser restore", signature);

    const roles = await authorityClient.fetchRoleRegistry(configPda);
    expect(roles.pauser.toBase58()).to.equal(originalRoles.pauser.toBase58());
  });

  it("mintTokens mints a blacklisting target balance", async () => {
    const { signature } = await operatorClient.mintTokens(
      DEVNET_MINT,
      targetMintAmount,
      targetAta
    );
    await confirmAndLog(connection, "mintTokens target", signature);

    const account = await getAccount(
      connection,
      targetAta,
      CONFIRM_COMMITMENT,
      TOKEN_2022_PROGRAM_ID
    );
    expect(account.amount.toString()).to.equal(targetMintAmount.toString());
  });

  it("blacklistAdd adds the target user and freezes their ATA", async () => {
    const { signature } = await authorityClient.blacklistAdd(
      DEVNET_MINT,
      targetUser.publicKey,
      targetAta,
      { reason: "console e2e blacklist add" }
    );
    await confirmAndLog(connection, "blacklistAdd", signature);

    const entry = await authorityClient.fetchBlacklistEntry(
      configPda,
      targetUser.publicKey
    );
    expect(entry).to.not.equal(null);
    expect(entry!.blockedAddress.toBase58()).to.equal(
      targetUser.publicKey.toBase58()
    );

    const account = await getAccount(
      connection,
      targetAta,
      CONFIRM_COMMITMENT,
      TOKEN_2022_PROGRAM_ID
    );
    expect(account.isFrozen).to.equal(true);
  });

  it("seize moves the blacklisted balance into the operator ATA", async () => {
    const operatorBefore = await getAccount(
      connection,
      operatorAta,
      CONFIRM_COMMITMENT,
      TOKEN_2022_PROGRAM_ID
    );
    const targetBefore = await getAccount(
      connection,
      targetAta,
      CONFIRM_COMMITMENT,
      TOKEN_2022_PROGRAM_ID
    );

    const { signature } = await authorityClient.seize(
      DEVNET_MINT,
      targetUser.publicKey,
      targetAta,
      operatorAta,
      targetMintAmount
    );
    await confirmAndLog(connection, "seize", signature);

    const operatorAfter = await getAccount(
      connection,
      operatorAta,
      CONFIRM_COMMITMENT,
      TOKEN_2022_PROGRAM_ID
    );
    const targetAfter = await getAccount(
      connection,
      targetAta,
      CONFIRM_COMMITMENT,
      TOKEN_2022_PROGRAM_ID
    );

    expect(operatorAfter.amount.toString()).to.equal(
      new BN(operatorBefore.amount.toString()).add(targetMintAmount).toString()
    );
    expect(targetAfter.amount.toString()).to.equal(
      new BN(targetBefore.amount.toString()).sub(targetMintAmount).toString()
    );
    expect(targetAfter.isFrozen).to.equal(true);
  });

  it("fetchTokenHolders returns live holder data", async () => {
    logReadOnly("fetchTokenHolders");
    const holders = await authorityClient.fetchTokenHolders(DEVNET_MINT);
    expect(holders.length).to.be.greaterThan(0);
    expect(
      holders.every((holder) => holder.address instanceof PublicKey)
    ).to.equal(true);
  });

  it("burnTokens burns the operator ATA balance back down", async () => {
    const operatorAccount = await getAccount(
      connection,
      operatorAta,
      CONFIRM_COMMITMENT,
      TOKEN_2022_PROGRAM_ID
    );
    const burnAmount = new BN(operatorAccount.amount.toString());
    expect(burnAmount.isZero()).to.equal(false);

    const { signature } = await operatorClient.burnTokens(
      DEVNET_MINT,
      burnAmount,
      operatorAta
    );
    await confirmAndLog(connection, "burnTokens", signature);

    const refreshedAccount = await getAccount(
      connection,
      operatorAta,
      CONFIRM_COMMITMENT,
      TOKEN_2022_PROGRAM_ID
    );
    expect(refreshedAccount.amount.toString()).to.equal("0");
  });

  it("blacklistRemove removes the target user and thaws their ATA", async () => {
    const { signature } = await authorityClient.blacklistRemove(
      DEVNET_MINT,
      targetUser.publicKey,
      targetAta
    );
    await confirmAndLog(connection, "blacklistRemove", signature);

    const entry = await authorityClient.fetchBlacklistEntry(
      configPda,
      targetUser.publicKey
    );
    expect(entry).to.equal(null);

    const account = await getAccount(
      connection,
      targetAta,
      CONFIRM_COMMITMENT,
      TOKEN_2022_PROGRAM_ID
    );
    expect(account.isFrozen).to.equal(false);
    expect(account.amount.toString()).to.equal("0");
  });

  it("updateMetadata changes name, symbol, and URI", async () => {
    const { signature } = await authorityClient.updateMetadata(
      DEVNET_MINT,
      updatedMetadata
    );
    await confirmAndLog(connection, "updateMetadata", signature);

    const config = await authorityClient.fetchConfig(DEVNET_MINT);
    expect(config.name).to.equal(updatedMetadata.name);
    expect(config.symbol).to.equal(updatedMetadata.symbol);
    expect(config.uri).to.equal(updatedMetadata.uri);
  });

  it("updateMetadata restores the original values", async () => {
    const { signature } = await authorityClient.updateMetadata(DEVNET_MINT, {
      name: originalConfig.name,
      symbol: originalConfig.symbol,
      uri: originalConfig.uri,
    });
    await confirmAndLog(connection, "updateMetadata restore", signature);

    const config = await authorityClient.fetchConfig(DEVNET_MINT);
    expect(config.name).to.equal(originalConfig.name);
    expect(config.symbol).to.equal(originalConfig.symbol);
    expect(config.uri).to.equal(originalConfig.uri);
  });

  it("nominateAuthority nominates the operator wallet", async () => {
    const { signature } = await authorityClient.nominateAuthority(
      DEVNET_MINT,
      operator.publicKey
    );
    await confirmAndLog(connection, "nominateAuthority operator", signature);

    const config = await authorityClient.fetchConfig(DEVNET_MINT);
    expect(config.pendingAuthority.toBase58()).to.equal(
      operator.publicKey.toBase58()
    );
  });

  it("acceptAuthority hands master authority to the operator", async () => {
    const { signature } = await operatorClient.acceptAuthority(DEVNET_MINT);
    await confirmAndLog(connection, "acceptAuthority operator", signature);

    const config = await authorityClient.fetchConfig(DEVNET_MINT);
    expect(config.masterAuthority.toBase58()).to.equal(
      operator.publicKey.toBase58()
    );
    expect(config.pendingAuthority.toBase58()).to.equal(
      DEFAULT_PUBLIC_KEY.toBase58()
    );
  });

  it("nominateAuthority nominates the original authority back", async () => {
    const { signature } = await operatorClient.nominateAuthority(
      DEVNET_MINT,
      authority.publicKey
    );
    await confirmAndLog(connection, "nominateAuthority authority restore", signature);

    const config = await authorityClient.fetchConfig(DEVNET_MINT);
    expect(config.pendingAuthority.toBase58()).to.equal(
      authority.publicKey.toBase58()
    );
  });

  it("acceptAuthority restores the original authority wallet", async () => {
    const { signature } = await authorityClient.acceptAuthority(DEVNET_MINT);
    await confirmAndLog(connection, "acceptAuthority authority restore", signature);

    const config = await authorityClient.fetchConfig(DEVNET_MINT);
    expect(config.masterAuthority.toBase58()).to.equal(
      authority.publicKey.toBase58()
    );
    expect(config.pendingAuthority.toBase58()).to.equal(
      DEFAULT_PUBLIC_KEY.toBase58()
    );
  });

  it("attestReserve records a new reserve attestation", async () => {
    const before = await authorityClient.fetchConfig(DEVNET_MINT);
    const supply = await authorityClient.getTotalSupply(DEVNET_MINT);
    const totalOutstanding = supply.currentSupply.isZero()
      ? new BN(1)
      : supply.currentSupply;
    const totalReservesUsd = totalOutstanding.add(new BN(1_000_000));

    const { signature } = await authorityClient.attestReserve(DEVNET_MINT, {
      reserveHash: Array.from(Buffer.alloc(32, 0xab)),
      totalReservesUsd,
      attestationUri: `${updatedMetadata.uri}/attestation.json`,
    });
    await confirmAndLog(connection, "attestReserve", signature);

    const afterConfig = await authorityClient.fetchConfig(DEVNET_MINT);
    expect(afterConfig.reserveAttestationIndex.toString()).to.equal(
      before.reserveAttestationIndex.addn(1).toString()
    );

    const attestation = await authorityClient.fetchReserveAttestation(
      configPda,
      before.reserveAttestationIndex
    );
    expect(attestation.attestedBy.toBase58()).to.equal(
      authority.publicKey.toBase58()
    );
    expect(attestation.attestationUri).to.equal(
      `${updatedMetadata.uri}/attestation.json`
    );
  });

  it("updateMinter deactivates the operator minter", async () => {
    const { signature } = await authorityClient.updateMinter(
      DEVNET_MINT,
      operator.publicKey,
      {
        isActive: false,
        mintQuota: new BN(0),
      }
    );
    await confirmAndLog(connection, "updateMinter deactivate", signature);

    const minterInfo = await authorityClient.fetchMinterInfo(
      configPda,
      operator.publicKey
    );
    expect(minterInfo.isActive).to.equal(false);
    expect(minterInfo.mintQuota.toString()).to.equal("0");
  });

  it("setSupplyCap restores the original cap", async () => {
    const { signature } = await authorityClient.setSupplyCap(
      DEVNET_MINT,
      bnToSafeNumber(originalConfig.supplyCap, "original supply cap")
    );
    await confirmAndLog(connection, "setSupplyCap restore", signature);

    const config = await authorityClient.fetchConfig(DEVNET_MINT);
    expect(config.supplyCap.toString()).to.equal(
      originalConfig.supplyCap.toString()
    );
  });

  async function fundOperatorIfNeeded(): Promise<void> {
    const operatorBalance = await connection.getBalance(operator.publicKey);
    if (operatorBalance >= OPERATOR_FUNDING_LAMPORTS) {
      return;
    }

    const tx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: authority.publicKey,
        toPubkey: operator.publicKey,
        lamports: OPERATOR_FUNDING_LAMPORTS - operatorBalance,
      })
    );
    const signature = await sendAndConfirmTransaction(connection, tx, [authority], {
      commitment: CONFIRM_COMMITMENT,
    });
    await confirmAndLog(connection, "setup fund operator", signature);
  }

  async function createAtaIfMissing(
    owner: PublicKey,
    ata: PublicKey,
    label: string
  ): Promise<void> {
    const existing = await connection.getAccountInfo(ata);
    if (existing) {
      return;
    }

    const ix = authorityClient.createAssociatedTokenAccountInstruction(
      authority.publicKey,
      DEVNET_MINT,
      owner
    );
    const signature = await sendAndConfirmTransaction(
      connection,
      new Transaction().add(ix),
      [authority],
      { commitment: CONFIRM_COMMITMENT }
    );
    await confirmAndLog(connection, label, signature);
  }

  async function thawIfFrozen(ata: PublicKey, label: string): Promise<void> {
    const accountInfo = await connection.getAccountInfo(ata);
    if (!accountInfo) {
      return;
    }

    const tokenAccount = await getAccount(
      connection,
      ata,
      CONFIRM_COMMITMENT,
      TOKEN_2022_PROGRAM_ID
    );
    if (!tokenAccount.isFrozen) {
      return;
    }

    const { signature } = await authorityClient.thawAccount(DEVNET_MINT, ata);
    await confirmAndLog(connection, label, signature);
  }

  async function burnAccountIfNeeded(
    ata: PublicKey,
    label: string
  ): Promise<void> {
    const accountInfo = await connection.getAccountInfo(ata);
    if (!accountInfo) {
      return;
    }

    const tokenAccount = await getAccount(
      connection,
      ata,
      CONFIRM_COMMITMENT,
      TOKEN_2022_PROGRAM_ID
    );
    if (tokenAccount.isFrozen) {
      const { signature } = await authorityClient.thawAccount(DEVNET_MINT, ata);
      await confirmAndLog(connection, `${label} thaw`, signature);
    }
    if (tokenAccount.amount === BigInt(0)) {
      return;
    }

    const { signature } = await authorityClient.burnTokens(
      DEVNET_MINT,
      new BN(tokenAccount.amount.toString()),
      ata
    );
    await confirmAndLog(connection, label, signature);
  }

  async function fetchMinterInfoOrNull(
    minter: PublicKey
  ): Promise<MinterInfo | null> {
    try {
      return await authorityClient.fetchMinterInfo(configPda, minter);
    } catch {
      return null;
    }
  }

  async function settleAuthorityBackToOriginal(): Promise<void> {
    let liveConfig = await authorityClient.fetchConfig(DEVNET_MINT);

    if (
      liveConfig.masterAuthority.equals(authority.publicKey) &&
      liveConfig.pendingAuthority.equals(DEFAULT_PUBLIC_KEY)
    ) {
      return;
    }

    if (liveConfig.pendingAuthority.equals(operator.publicKey)) {
      const { signature } = await operatorClient.acceptAuthority(DEVNET_MINT);
      await confirmAndLog(connection, "cleanup accept operator authority", signature);
      liveConfig = await authorityClient.fetchConfig(DEVNET_MINT);
    }

    if (liveConfig.pendingAuthority.equals(authority.publicKey)) {
      const { signature } = await authorityClient.acceptAuthority(DEVNET_MINT);
      await confirmAndLog(connection, "cleanup accept original authority", signature);
      return;
    }

    if (liveConfig.masterAuthority.equals(operator.publicKey)) {
      const { signature: nominateSignature } =
        await operatorClient.nominateAuthority(DEVNET_MINT, authority.publicKey);
      await confirmAndLog(
        connection,
        "cleanup nominate original authority",
        nominateSignature
      );

      const { signature: acceptSignature } =
        await authorityClient.acceptAuthority(DEVNET_MINT);
      await confirmAndLog(
        connection,
        "cleanup accept original authority",
        acceptSignature
      );
    }
  }
});
