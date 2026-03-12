"use client";

import { useEffect, useState } from "react";
import { ArrowLeftRight, Send, ShieldAlert } from "lucide-react";
import { useWallet } from "@solana/wallet-adapter-react";
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
  isValidPublicKey,
  normalizeAddress,
  shortAddress,
} from "@/components/dashboard/consoleUtils";
import { useSSS } from "@/hooks/useSSS";

type TransferStatus = {
  tone: "success" | "error";
  message: string;
};

type TransferPreview = {
  from: string;
  to: string;
  amount: string;
  createdAt: string;
};

function TransferPageContent() {
  const sss = useSSS();
  const { publicKey } = useWallet();
  const [fromAddress, setFromAddress] = useState("");
  const [toAddress, setToAddress] = useState("");
  const [amount, setAmount] = useState("");
  const [preview, setPreview] = useState<TransferPreview | null>(null);
  const [status, setStatus] = useState<TransferStatus | null>(null);

  useEffect(() => {
    if (publicKey) {
      setFromAddress(publicKey.toBase58());
    }
  }, [publicKey]);

  const hookEnabled = Boolean(sss.config?.enableTransferHook);

  const handleTransfer = () => {
    if (!isValidPublicKey(fromAddress.trim()) || !isValidPublicKey(toAddress.trim())) {
      setStatus({ tone: "error", message: "Both from and to fields must contain valid Solana addresses." });
      return;
    }

    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      setStatus({ tone: "error", message: "Enter a transfer amount greater than zero." });
      return;
    }

    setPreview({
      from: normalizeAddress(fromAddress.trim()),
      to: normalizeAddress(toAddress.trim()),
      amount,
      createdAt: new Date().toISOString(),
    });
    setStatus({
      tone: "success",
      message: hookEnabled
        ? "Transfer prepared. Blacklist enforcement will run through the transfer hook."
        : "Transfer prepared. No transfer hook blacklist check is currently enabled.",
    });
  };

  return (
    <>
      {sss.error ? <StatusBanner tone="error" message={sss.error} /> : null}
      {status ? <StatusBanner tone={status.tone} message={status.message} /> : null}

      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard
          label="Transfer Hook"
          value={hookEnabled ? "Active" : "Inactive"}
          hint={
            hookEnabled
              ? "Blacklist checks will apply before settlement."
              : "Transfers will not invoke the hook guard."
          }
        />
        <MetricCard
          label="Wallet Source"
          value={shortAddress(publicKey)}
          hint="Used as the default sender in the form."
          accent="#4488FF"
        />
        <MetricCard
          label="Token Symbol"
          value={sss.config?.symbol ?? "--"}
          hint={`Decimals ${sss.supply?.decimals ?? 0}`}
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
                placeholder="Source wallet / token owner"
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
                placeholder="Recipient wallet / token owner"
                className="dark-input"
              />
            </div>
            <div>
              <FieldLabel htmlFor="transfer-amount">Amount</FieldLabel>
              <input
                id="transfer-amount"
                type="number"
                min="0"
                step="0.000001"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder="1000"
                className="dark-input"
              />
            </div>
            <PrimaryButton onClick={handleTransfer} className="w-full">
              <Send size={16} />
              Transfer Tokens
            </PrimaryButton>
          </div>
        </div>

        <div className="space-y-4">
          <SectionLabel className="pt-2">Transfer Hook Status</SectionLabel>
          <div className="dark-card">
            <div className="flex items-center gap-2 text-[#D4FF00]" style={{ fontFamily: "var(--font-jetbrains-mono)" }}>
              <ShieldAlert size={14} />
              <span className="text-[11px] uppercase tracking-[0.2em]">Compliance Gate</span>
            </div>
            <div className="mt-6 rounded-lg border border-[#1e1e1e] bg-[#080808] p-4">
              <div className="text-[11px] uppercase tracking-[0.2em] text-[#666]" style={{ fontFamily: "var(--font-jetbrains-mono)" }}>
                Hook Result
              </div>
              <div className="mt-3 text-2xl font-bold uppercase tracking-tight text-white" style={{ fontFamily: "var(--font-space-grotesk)" }}>
                {hookEnabled ? "Blacklist Check Applies" : "No Hook Check"}
              </div>
              <div className="mt-3 text-sm leading-relaxed text-[#777]" style={{ fontFamily: "var(--font-jetbrains-mono)" }}>
                {hookEnabled
                  ? "This mint is configured with transfer-hook enforcement, so blacklisted participants will be blocked before settlement."
                  : "This mint is not using transfer-hook enforcement, so transfers will proceed without a hook-based blacklist validation."}
              </div>
            </div>
          </div>

          <div className="dark-card">
            <div className="flex items-center gap-2 text-[#4488FF]" style={{ fontFamily: "var(--font-jetbrains-mono)" }}>
              <ArrowLeftRight size={14} />
              <span className="text-[11px] uppercase tracking-[0.2em]">Prepared Transfer</span>
            </div>
            {preview ? (
              <div className="mt-6 space-y-4 text-sm text-[#999]" style={{ fontFamily: "var(--font-jetbrains-mono)" }}>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-[#555]">From</span>
                  <span>{shortAddress(preview.from)}</span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-[#555]">To</span>
                  <span>{shortAddress(preview.to)}</span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-[#555]">Amount</span>
                  <span>{preview.amount}</span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-[#555]">Prepared</span>
                  <span>{formatTimestamp(preview.createdAt)}</span>
                </div>
              </div>
            ) : (
              <div className="mt-6 text-sm leading-relaxed text-[#666]" style={{ fontFamily: "var(--font-jetbrains-mono)" }}>
                Submit the form to preview the next transfer.
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
      description="Prepare a token transfer, verify the sender and recipient, and confirm whether the transfer hook will enforce blacklist checks."
    >
      <TransferPageContent />
    </ConsoleShell>
  );
}
