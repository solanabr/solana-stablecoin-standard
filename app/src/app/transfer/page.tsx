"use client";

import { useCallback, useDeferredValue, useEffect, useState } from "react";
import {
  createTransferCheckedInstruction,
  createTransferCheckedWithTransferHookInstruction,
  TOKEN_2022_PROGRAM_ID,
} from "@solana/spl-token";
import { PublicKey, Transaction } from "@solana/web3.js";
import { ArrowLeftRight, Send, ShieldAlert } from "lucide-react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import ConsoleShell from "@/components/dashboard/ConsoleShell";
import {
  FieldLabel,
  MetricCard,
  PrimaryButton,
  SectionLabel,
  StatusBanner,
} from "@/components/dashboard/ConsolePrimitives";
import {
  formatTimestamp,
  formatTokenAmount,
  isValidPublicKey,
  normalizeAddress,
  parseTokenAmountInput,
  shortAddress,
} from "@/components/dashboard/consoleUtils";
import {
  getRpcErrorMessage,
  isAccountNotFoundError,
  withRpcRetry,
} from "@/components/dashboard/rpcUtils";
import { useSSS } from "@/hooks/useSSS";

type TransferStatus = {
  tone: "success" | "error";
  message: string;
  signature?: string;
};

type TransferResult = {
  from: string;
  to: string;
  amount: string;
  createdAt: string;
  signature: string;
};

type TokenBalance = {
  owner: string;
  tokenAccount: string;
  exists: boolean;
  amount: string;
  uiAmount: number | null;
};

function TransferPageContent() {
  const sss = useSSS();
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();
  const [fromAddress, setFromAddress] = useState("");
  const [toAddress, setToAddress] = useState("");
  const [amount, setAmount] = useState("");
  const [result, setResult] = useState<TransferResult | null>(null);
  const [status, setStatus] = useState<TransferStatus | null>(null);
  const [balanceError, setBalanceError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [sourceBalance, setSourceBalance] = useState<TokenBalance | null>(null);
  const [destinationBalance, setDestinationBalance] =
    useState<TokenBalance | null>(null);

  const deferredToAddress = useDeferredValue(toAddress.trim());
  const hookEnabled = Boolean(sss.config?.enableTransferHook);
  const decimals = sss.supply?.decimals ?? 0;
  const symbol = sss.config?.symbol ?? "TOKEN";

  useEffect(() => {
    setFromAddress(publicKey?.toBase58() ?? "");
  }, [publicKey]);

  const loadBalance = useCallback(
    async (owner: PublicKey): Promise<TokenBalance> => {
      if (!sss.client) {
        throw new Error("Wallet is not connected.");
      }

      const tokenAccount = sss.client.getAssociatedTokenAddress(sss.mint, owner);

      try {
        const balance = await withRpcRetry(
          () => connection.getTokenAccountBalance(tokenAccount),
          { fallbackMessage: "Failed to load token balances." }
        );

        return {
          owner: owner.toBase58(),
          tokenAccount: tokenAccount.toBase58(),
          exists: true,
          amount: balance.value.amount,
          uiAmount: balance.value.uiAmount,
        };
      } catch (error) {
        if (isAccountNotFoundError(error)) {
          return {
            owner: owner.toBase58(),
            tokenAccount: tokenAccount.toBase58(),
            exists: false,
            amount: "0",
            uiAmount: 0,
          };
        }

        throw error;
      }
    },
    [connection, sss.client, sss.mint]
  );

  const refreshBalances = useCallback(async () => {
    if (!sss.client || !publicKey) {
      setSourceBalance(null);
      setDestinationBalance(null);
      setBalanceError(null);
      return;
    }

    setBalanceLoading(true);
    setBalanceError(null);

    try {
      const [source, destination] = await Promise.all([
        loadBalance(publicKey),
        deferredToAddress && isValidPublicKey(deferredToAddress)
          ? loadBalance(new PublicKey(normalizeAddress(deferredToAddress)))
          : Promise.resolve(null),
      ]);

      setSourceBalance(source);
      setDestinationBalance(destination);
    } catch (error) {
      setBalanceError(
        getRpcErrorMessage(error, "Failed to load token balances.")
      );
    } finally {
      setBalanceLoading(false);
    }
  }, [deferredToAddress, loadBalance, publicKey, sss.client]);

  useEffect(() => {
    void refreshBalances();
  }, [refreshBalances, sss.lastUpdated]);

  const handleTransfer = async () => {
    if (!sss.client || !publicKey) return;

    const normalizedFrom = fromAddress.trim();
    if (!isValidPublicKey(normalizedFrom)) {
      setStatus({
        tone: "error",
        message: "From must contain a valid Solana address.",
      });
      return;
    }

    if (normalizeAddress(normalizedFrom) !== publicKey.toBase58()) {
      setStatus({
        tone: "error",
        message: "Transfers can only be sent from the connected wallet.",
      });
      return;
    }

    if (!isValidPublicKey(toAddress.trim())) {
      setStatus({
        tone: "error",
        message: "To must contain a valid Solana address.",
      });
      return;
    }

    const baseAmount = parseTokenAmountInput(amount, decimals);
    if (baseAmount === null || baseAmount <= BigInt(0)) {
      setStatus({
        tone: "error",
        message: `Enter an amount greater than zero with at most ${decimals} decimal places.`,
      });
      return;
    }

    if (!sourceBalance?.exists) {
      setStatus({
        tone: "error",
        message: "The connected wallet does not have a token account for this mint yet.",
      });
      return;
    }

    if (baseAmount > BigInt(sourceBalance.amount)) {
      setStatus({
        tone: "error",
        message: "Insufficient token balance for this transfer.",
      });
      return;
    }

    setSubmitting(true);
    setStatus(null);

    try {
      const recipient = new PublicKey(normalizeAddress(toAddress.trim()));
      const senderTokenAccount = sss.client.getAssociatedTokenAddress(
        sss.mint,
        publicKey
      );
      const recipientTokenAccount = sss.client.getAssociatedTokenAddress(
        sss.mint,
        recipient
      );

      const instructions = [];
      const recipientAccountInfo = await withRpcRetry(
        () => connection.getAccountInfo(recipientTokenAccount),
        { fallbackMessage: "Failed to prepare the recipient token account." }
      );

      if (!recipientAccountInfo) {
        instructions.push(
          sss.client.createAssociatedTokenAccountInstruction(
            publicKey,
            sss.mint,
            recipient
          )
        );
      }

      const transferInstruction = hookEnabled
        ? await withRpcRetry(
            () =>
              createTransferCheckedWithTransferHookInstruction(
                connection,
                senderTokenAccount,
                sss.mint,
                recipientTokenAccount,
                publicKey,
                baseAmount,
                decimals,
                [],
                "confirmed",
                TOKEN_2022_PROGRAM_ID
              ),
            { fallbackMessage: "Failed to prepare transfer hook accounts." }
          )
        : createTransferCheckedInstruction(
            senderTokenAccount,
            sss.mint,
            recipientTokenAccount,
            publicKey,
            baseAmount,
            decimals,
            [],
            TOKEN_2022_PROGRAM_ID
          );

      instructions.push(transferInstruction);

      const transaction = new Transaction().add(...instructions);
      const signature = await sendTransaction(transaction, connection);
      await withRpcRetry(
        () => connection.confirmTransaction(signature, "confirmed"),
        { fallbackMessage: "Failed to confirm the transfer transaction." }
      );

      const formattedAmount = formatTokenAmount(baseAmount, decimals, decimals);

      setResult({
        from: publicKey.toBase58(),
        to: recipient.toBase58(),
        amount: `${formattedAmount} ${symbol}`,
        createdAt: new Date().toISOString(),
        signature,
      });
      setStatus({
        tone: "success",
        message: "Transfer submitted and confirmed on-chain.",
        signature,
      });
      setToAddress("");
      setAmount("");
      await refreshBalances();
    } catch (error) {
      setStatus({
        tone: "error",
        message: getRpcErrorMessage(error, "Failed to submit the token transfer."),
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      {sss.error ? <StatusBanner tone="error" message={sss.error} /> : null}
      {balanceError ? <StatusBanner tone="error" message={balanceError} /> : null}
      {status ? (
        <StatusBanner tone={status.tone} message={status.message}>
          {status.signature ? (
            <a
              href={`https://explorer.solana.com/tx/${status.signature}?cluster=devnet`}
              target="_blank"
              rel="noreferrer"
              className="tx-link hover-trigger"
            >
              View Transaction
            </a>
          ) : null}
        </StatusBanner>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard
          label="Transfer Hook"
          value={hookEnabled ? "Active" : "Inactive"}
          hint={
            hookEnabled
              ? "Token-2022 transfer-hook enforcement will run before settlement."
              : "Transfers settle without hook-based compliance checks."
          }
        />
        <MetricCard
          label="Source Balance"
          value={
            balanceLoading && !sourceBalance
              ? "Loading"
              : `${formatTokenAmount(sourceBalance?.amount ?? "0", decimals)} ${symbol}`
          }
          hint={
            sourceBalance?.exists
              ? `ATA ${shortAddress(sourceBalance.tokenAccount)}`
              : "The connected wallet has no token account for this mint."
          }
          accent="#4488FF"
        />
        <MetricCard
          label="Wallet Source"
          value={shortAddress(publicKey)}
          hint={`Mint ${shortAddress(sss.mint)}`}
          accent="#FF9933"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
        <div className="space-y-4">
          <SectionLabel className="pt-2">Transfer Form</SectionLabel>
          <div className="dark-card space-y-4">
            <div>
              <FieldLabel htmlFor="transfer-from">From Address</FieldLabel>
              <input
                id="transfer-from"
                type="text"
                value={fromAddress}
                onChange={(event) => setFromAddress(event.target.value)}
                placeholder="Connected wallet"
                className="dark-input"
              />
            </div>
            <div>
              <FieldLabel htmlFor="transfer-to">To Address</FieldLabel>
              <input
                id="transfer-to"
                type="text"
                value={toAddress}
                onChange={(event) => setToAddress(event.target.value)}
                placeholder="Recipient wallet"
                className="dark-input"
              />
            </div>
            <div>
              <FieldLabel htmlFor="transfer-amount">Amount</FieldLabel>
              <input
                id="transfer-amount"
                type="text"
                inputMode="decimal"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder={`0.${"0".repeat(Math.min(decimals, 6)) || "0"}`}
                className="dark-input"
              />
            </div>
            <PrimaryButton
              onClick={handleTransfer}
              className="w-full"
              disabled={submitting}
            >
              <Send size={16} />
              {submitting ? "Submitting..." : "Transfer Tokens"}
            </PrimaryButton>
          </div>
        </div>

        <div className="space-y-4">
          <SectionLabel className="pt-2">Transfer Hook Status</SectionLabel>
          <div className="dark-card">
            <div
              className="flex items-center gap-2 text-[#D4FF00]"
              style={{ fontFamily: "var(--font-jetbrains-mono)" }}
            >
              <ShieldAlert size={14} />
              <span className="text-[11px] uppercase tracking-[0.2em]">
                Compliance Gate
              </span>
            </div>
            <div className="mt-6 rounded-lg border border-[#1e1e1e] bg-[#080808] p-4">
              <div
                className="text-[11px] uppercase tracking-[0.2em] text-[#666]"
                style={{ fontFamily: "var(--font-jetbrains-mono)" }}
              >
                Hook Result
              </div>
              <div
                className="mt-3 text-2xl font-bold uppercase tracking-tight text-white"
                style={{ fontFamily: "var(--font-space-grotesk)" }}
              >
                {hookEnabled ? "Blacklist Check Applies" : "No Hook Check"}
              </div>
              <div
                className="mt-3 text-sm leading-relaxed text-[#777]"
                style={{ fontFamily: "var(--font-jetbrains-mono)" }}
              >
                {hookEnabled
                  ? "The Token-2022 transfer hook will validate source and destination addresses before the transfer settles."
                  : "This mint is not using transfer-hook enforcement, so only the base token program rules apply."}
              </div>
            </div>
          </div>

          <div className="dark-card">
            <div
              className="flex items-center gap-2 text-[#4488FF]"
              style={{ fontFamily: "var(--font-jetbrains-mono)" }}
            >
              <ArrowLeftRight size={14} />
              <span className="text-[11px] uppercase tracking-[0.2em]">
                Last Transfer
              </span>
            </div>
            {result ? (
              <div
                className="mt-6 space-y-4 text-sm text-[#999]"
                style={{ fontFamily: "var(--font-jetbrains-mono)" }}
              >
                <div className="flex items-center justify-between gap-4">
                  <span className="text-[#555]">From</span>
                  <span>{shortAddress(result.from)}</span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-[#555]">To</span>
                  <span>{shortAddress(result.to)}</span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-[#555]">Amount</span>
                  <span>{result.amount}</span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-[#555]">Confirmed</span>
                  <span>{formatTimestamp(result.createdAt)}</span>
                </div>
              </div>
            ) : deferredToAddress &&
              isValidPublicKey(deferredToAddress) &&
              destinationBalance ? (
              <div
                className="mt-6 space-y-4 text-sm text-[#999]"
                style={{ fontFamily: "var(--font-jetbrains-mono)" }}
              >
                <div className="flex items-center justify-between gap-4">
                  <span className="text-[#555]">Recipient ATA</span>
                  <span>{destinationBalance.exists ? "Exists" : "Missing"}</span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-[#555]">Recipient Balance</span>
                  <span>
                    {formatTokenAmount(destinationBalance.amount, decimals)} {symbol}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-[#555]">Recipient Wallet</span>
                  <span>{shortAddress(destinationBalance.owner)}</span>
                </div>
              </div>
            ) : (
              <div
                className="mt-6 text-sm leading-relaxed text-[#666]"
                style={{ fontFamily: "var(--font-jetbrains-mono)" }}
              >
                Enter a recipient to inspect the live destination account, then
                submit the transfer to record the latest on-chain result here.
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

export default function TransferPage() {
  return (
    <ConsoleShell
      eyebrow="Transfer Console"
      title="Token Transfer"
      description="Send a real Token-2022 transfer, verify the sender and recipient accounts, and confirm whether the transfer hook will enforce blacklist checks."
    >
      <TransferPageContent />
    </ConsoleShell>
  );
}
