"use client";

import { useCallback, useMemo } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { Keypair, PublicKey, Transaction } from "@solana/web3.js";
import {
  SolanaStablecoin,
  Preset,
  BackingType,
  BankingRail,
  FiatCurrency,
  Roles,
  SSS_TRANSFER_HOOK_PROGRAM_ID,
  deriveConfigPda,
  type MintFromBankParams,
  type RedeemToBankParams,
  type InitializeParams,
} from "@sss/sdk";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface CreateParams {
  name: string;
  symbol: string;
  preset: Preset;
  decimals: number;
  supplyCap: bigint;
  uri: string;
  backingType: BackingType;
  bankingRail: BankingRail;
  enableHook?: boolean;
}

export interface OperationResult {
  signature: string;
  explorerUrl: string;
  label: string;
  mintAddress?: string; // only set after createStablecoin
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helper: sign & send an unsigned Transaction via wallet adapter
// ─────────────────────────────────────────────────────────────────────────────
function useSignAndSend() {
  const { connection } = useConnection();
  const { publicKey, signTransaction } = useWallet();

  return useCallback(
    async (tx: Transaction, label: string, extraSigners: Keypair[] = []): Promise<OperationResult> => {
      if (!publicKey || !signTransaction) throw new Error("Wallet not connected");

      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
      tx.recentBlockhash = blockhash;
      tx.feePayer = publicKey;

      // Pre-sign with any extra Keypairs (e.g. fresh mint keypair)
      for (const signer of extraSigners) {
        tx.partialSign(signer);
      }

      const signed = await signTransaction(tx);
      const signature = await connection.sendRawTransaction(signed.serialize(), {
        skipPreflight: false,
        preflightCommitment: "confirmed",
      });
      await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, "confirmed");

      return {
        signature,
        explorerUrl: `https://explorer.solana.com/tx/${signature}?cluster=devnet`,
        label,
      };
    },
    [connection, publicKey, signTransaction]
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main hook
// ─────────────────────────────────────────────────────────────────────────────
export function useStablecoin(mintAddress?: string) {
  const { connection } = useConnection();
  const { publicKey, signTransaction } = useWallet();
  const signAndSend = useSignAndSend();

  // SDK instance lazily loaded by mint address
  const loadSdk = useCallback(async (): Promise<SolanaStablecoin> => {
    if (!mintAddress) throw new Error("No mint address provided");
    return SolanaStablecoin.load(connection, new PublicKey(mintAddress));
  }, [connection, mintAddress]);

  const walletConnected = Boolean(publicKey && signTransaction);

  // ── Create ────────────────────────────────────────────────────────────────
  const createStablecoin = useCallback(
    async (params: CreateParams): Promise<OperationResult> => {
      if (!publicKey || !signTransaction) throw new Error("Wallet not connected");

      const initParams: InitializeParams = {
        name: params.name,
        symbol: params.symbol,
        decimals: params.decimals,
        preset: params.preset,
        supplyCap: params.supplyCap,
        uri: params.uri,
        backingType: params.backingType,
        bankingRail: params.bankingRail,
        hookProgramId: params.enableHook ? SSS_TRANSFER_HOOK_PROGRAM_ID : undefined,
      };

      // Build the unsigned initialize tx — wallet is the real on-chain authority
      const { tx, mintKeypair, mintAddress } =
        SolanaStablecoin.buildCreateTransaction(initParams, publicKey);

      const { blockhash, lastValidBlockHeight } =
        await connection.getLatestBlockhash("confirmed");

      tx.recentBlockhash = blockhash;
      tx.feePayer = publicKey;

      // Mint account must co-sign (it's a new account being initialised)
      tx.partialSign(mintKeypair);

      // Wallet signs as fee-payer + authority
      const signed = await signTransaction(tx);

      const signature = await connection.sendRawTransaction(signed.serialize(), {
        skipPreflight: false,
        preflightCommitment: "confirmed",
      });
      await connection.confirmTransaction(
        { signature, blockhash, lastValidBlockHeight },
        "confirmed"
      );

      return {
        signature,
        explorerUrl: `https://explorer.solana.com/tx/${signature}?cluster=devnet`,
        label: `Create ${params.symbol}`,
        mintAddress: mintAddress.toBase58(),
      };
    },
    [connection, publicKey, signTransaction]
  );

  // ── Bootstrap roles (grant all roles to wallet on an existing mint) ───────
  const bootstrapRoles = useCallback(
    async (mintAddr: string): Promise<OperationResult> => {
      if (!publicKey || !signTransaction) throw new Error("Wallet not connected");
      const [config] = deriveConfigPda(new PublicKey(mintAddr));
      const tx = SolanaStablecoin.buildGrantAllRolesTransaction(
        config,
        publicKey,
        publicKey
      );
      return signAndSend(tx, "Bootstrap all roles for wallet");
    },
    [publicKey, signAndSend, signTransaction]
  );

  // ── Mint ──────────────────────────────────────────────────────────────────
  const mintTokens = useCallback(
    async (recipientAddress: string, amount: bigint): Promise<OperationResult> => {
      if (!publicKey) throw new Error("Wallet not connected");
      const sdk = await loadSdk();
      const recipient = new PublicKey(recipientAddress);
      const tx = await sdk.buildMintTransaction(publicKey, recipient, amount);
      return signAndSend(tx, `Mint ${amount} tokens to ${recipientAddress.slice(0, 8)}…`);
    },
    [loadSdk, publicKey, signAndSend]
  );

  // ── Burn ──────────────────────────────────────────────────────────────────
  const burnTokens = useCallback(
    async (amount: bigint): Promise<OperationResult> => {
      if (!publicKey) throw new Error("Wallet not connected");
      const sdk = await loadSdk();
      const tx = await sdk.buildBurnTransaction(publicKey, amount);
      return signAndSend(tx, `Burn ${amount} tokens`);
    },
    [loadSdk, publicKey, signAndSend]
  );

  // ── Freeze ────────────────────────────────────────────────────────────────
  const freezeAccount = useCallback(
    async (targetAddress: string): Promise<OperationResult> => {
      if (!publicKey) throw new Error("Wallet not connected");
      const sdk = await loadSdk();
      const target = new PublicKey(targetAddress);
      const tx = await sdk.buildFreezeTransaction(publicKey, target);
      return signAndSend(tx, `Freeze ${targetAddress.slice(0, 8)}…`);
    },
    [loadSdk, publicKey, signAndSend]
  );

  // ── Thaw ──────────────────────────────────────────────────────────────────
  const thawAccount = useCallback(
    async (targetAddress: string): Promise<OperationResult> => {
      if (!publicKey) throw new Error("Wallet not connected");
      const sdk = await loadSdk();
      const target = new PublicKey(targetAddress);
      const tx = await sdk.buildThawTransaction(publicKey, target);
      return signAndSend(tx, `Thaw ${targetAddress.slice(0, 8)}…`);
    },
    [loadSdk, publicKey, signAndSend]
  );

  // ── Pause ─────────────────────────────────────────────────────────────────
  const pauseToken = useCallback(
    async (): Promise<OperationResult> => {
      if (!publicKey) throw new Error("Wallet not connected");
      const sdk = await loadSdk();
      const tx = await sdk.buildPauseTransaction(publicKey);
      return signAndSend(tx, "Pause stablecoin");
    },
    [loadSdk, publicKey, signAndSend]
  );

  // ── Unpause ───────────────────────────────────────────────────────────────
  const unpauseToken = useCallback(
    async (): Promise<OperationResult> => {
      if (!publicKey) throw new Error("Wallet not connected");
      const sdk = await loadSdk();
      const tx = await sdk.buildUnpauseTransaction(publicKey);
      return signAndSend(tx, "Unpause stablecoin");
    },
    [loadSdk, publicKey, signAndSend]
  );

  // ── Blacklist add ─────────────────────────────────────────────────────────
  const blacklistAdd = useCallback(
    async (targetAddress: string): Promise<OperationResult> => {
      if (!publicKey) throw new Error("Wallet not connected");
      const sdk = await loadSdk();
      const target = new PublicKey(targetAddress);
      const tx = await sdk.buildBlacklistAddTransaction(publicKey, target);
      return signAndSend(tx, `Blacklist ${targetAddress.slice(0, 8)}…`);
    },
    [loadSdk, publicKey, signAndSend]
  );

  // ── Blacklist remove ──────────────────────────────────────────────────────
  const blacklistRemove = useCallback(
    async (targetAddress: string): Promise<OperationResult> => {
      if (!publicKey) throw new Error("Wallet not connected");
      const sdk = await loadSdk();
      const target = new PublicKey(targetAddress);
      const tx = await sdk.buildBlacklistRemoveTransaction(publicKey, target);
      return signAndSend(tx, `Un-blacklist ${targetAddress.slice(0, 8)}…`);
    },
    [loadSdk, publicKey, signAndSend]
  );

  // ── Seize ─────────────────────────────────────────────────────────────────
  const seizeTokens = useCallback(
    async (fromAddress: string, toAddress: string, amount: bigint): Promise<OperationResult> => {
      if (!publicKey) throw new Error("Wallet not connected");
      const sdk = await loadSdk();
      const from = new PublicKey(fromAddress);
      const to = new PublicKey(toAddress);
      const tx = await sdk.buildSeizeTransaction(publicKey, from, to, amount);
      return signAndSend(tx, `Seize ${amount} from ${fromAddress.slice(0, 8)}…`);
    },
    [loadSdk, publicKey, signAndSend]
  );

  // ── Mint request (banking) ────────────────────────────────────────────────
  const createMintRequest = useCallback(
    async (
      depositorAddress: string,
      recipientAddress: string,
      amount: bigint,
      fiatAmount: bigint,
      fiatCurrency: FiatCurrency,
      referenceId: string
    ): Promise<OperationResult> => {
      if (!publicKey) throw new Error("Wallet not connected");
      const sdk = await loadSdk();
      const refBytes = new Uint8Array(32);
      const encoded = new TextEncoder().encode(referenceId);
      refBytes.set(encoded.slice(0, 32));
      const params: MintFromBankParams = { amount, fiatAmount, fiatCurrency, referenceId: refBytes };
      const tx = await sdk.buildMintRequestTransaction(
        publicKey,
        new PublicKey(depositorAddress),
        new PublicKey(recipientAddress),
        params
      );
      return signAndSend(tx, `Mint request: ${referenceId}`);
    },
    [loadSdk, publicKey, signAndSend]
  );

  // ── Redemption (banking) ──────────────────────────────────────────────────
  const createRedemption = useCallback(
    async (amount: bigint, bankAccountHash: string): Promise<OperationResult> => {
      if (!publicKey) throw new Error("Wallet not connected");
      const sdk = await loadSdk();
      const hashBytes = new Uint8Array(32);
      const encoded = new TextEncoder().encode(bankAccountHash);
      hashBytes.set(encoded.slice(0, 32));
      const params: RedeemToBankParams = { amount, bankAccountHash: hashBytes };
      const tx = await sdk.buildRedemptionTransaction(publicKey, params);
      return signAndSend(tx, `Redemption: ${amount} tokens`);
    },
    [loadSdk, publicKey, signAndSend]
  );

  // ── Role management ───────────────────────────────────────────────────────
  const grantRole = useCallback(
    async (targetAddress: string, role: keyof typeof Roles): Promise<OperationResult> => {
      if (!publicKey) throw new Error("Wallet not connected");
      const sdk = await loadSdk();
      const tx = await sdk.buildGrantRoleTransaction(publicKey, new PublicKey(targetAddress), role);
      return signAndSend(tx, `Grant ${role} to ${targetAddress.slice(0, 8)}…`);
    },
    [loadSdk, publicKey, signAndSend]
  );

  const revokeRole = useCallback(
    async (targetAddress: string, role: keyof typeof Roles): Promise<OperationResult> => {
      if (!publicKey) throw new Error("Wallet not connected");
      const sdk = await loadSdk();
      const tx = await sdk.buildRevokeRoleTransaction(publicKey, new PublicKey(targetAddress), role);
      return signAndSend(tx, `Revoke ${role} from ${targetAddress.slice(0, 8)}…`);
    },
    [loadSdk, publicKey, signAndSend]
  );

  // ── Read helpers ──────────────────────────────────────────────────────────
  const getConfig = useCallback(async () => {
    const sdk = await loadSdk();
    return sdk.getConfig();
  }, [loadSdk]);

  const getTotalSupply = useCallback(async () => {
    const sdk = await loadSdk();
    return sdk.getTotalSupply();
  }, [loadSdk]);

  const getBalance = useCallback(
    async (owner: string) => {
      const sdk = await loadSdk();
      return sdk.getBalance(new PublicKey(owner));
    },
    [loadSdk]
  );

  return {
    walletConnected,
    walletAddress: publicKey?.toBase58() ?? null,
    // write (canonical names)
    createStablecoin,
    mintTokens,
    burnTokens,
    freezeAccount,
    thawAccount,
    pauseToken,
    unpauseToken,
    seizeTokens,
    createMintRequest,
    createRedemption,
    grantRole,
    revokeRole,
    // short aliases used by the dashboard JSX (all accept mintAddr as first arg)
    create: (params: Parameters<typeof createStablecoin>[0]) => createStablecoin(params),
    bootstrapRoles: (mintAddr: string) => bootstrapRoles(mintAddr),
    mint: (mintAddr: string, recipient: string, amount: bigint) => mintTokens(recipient, amount),
    burn: (mintAddr: string, amount: bigint) => burnTokens(amount),
    freeze: (mintAddr: string, target: string) => freezeAccount(target),
    thaw: (mintAddr: string, target: string) => thawAccount(target),
    pause: (mintAddr: string) => pauseToken(),
    unpause: (mintAddr: string) => unpauseToken(),
    blacklistAdd: (mintAddr: string, target: string) => blacklistAdd(target),
    blacklistRemove: (mintAddr: string, target: string) => blacklistRemove(target),
    seize: (mintAddr: string, from: string, to: string, amount: bigint) => seizeTokens(from, to, amount),
    mintRequest: (mintAddr: string, recipient: string, params: { amount: bigint; bankReference: string; bankingRail: number }) =>
      createMintRequest(recipient, recipient, params.amount, params.amount, 0, params.bankReference),
    redeem: (mintAddr: string, params: { amount: bigint; bankReference: string; bankingRail: number }) =>
      createRedemption(params.amount, params.bankReference),
    grantRoleByNum: (mintAddr: string, target: string, role: number) => {
      const roleKey = Object.keys(Roles).find((k) => (Roles as Record<string, unknown>)[k] === role) as keyof typeof Roles | undefined;
      if (!roleKey) throw new Error(`Unknown role index ${role}`);
      return grantRole(target, roleKey);
    },
    revokeRoleByNum: (mintAddr: string, target: string, role: number) => {
      const roleKey = Object.keys(Roles).find((k) => (Roles as Record<string, unknown>)[k] === role) as keyof typeof Roles | undefined;
      if (!roleKey) throw new Error(`Unknown role index ${role}`);
      return revokeRole(target, roleKey);
    },
    // read
    getConfig,
    getTotalSupply,
    getBalance,
  };
}
