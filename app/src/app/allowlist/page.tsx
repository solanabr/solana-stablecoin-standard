"use client";

import { useMemo, useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { ShieldCheck, ShieldMinus, ShieldPlus } from "lucide-react";
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
  explorerTxUrl,
  formatTimestamp,
  isValidPublicKey,
  normalizeAddress,
  shortAddress,
} from "@/components/dashboard/consoleUtils";
import { getRpcErrorMessage } from "@/components/dashboard/rpcUtils";
import { useSSS } from "@/hooks/useSSS";

type FormStatus = {
  tone: "success" | "error";
  message: string;
  signature?: string;
};

function AllowlistPageContent() {
  const sss = useSSS();
  const { publicKey } = useWallet();
  const [address, setAddress] = useState("");
  const [reason, setReason] = useState("");
  const [removeAddress, setRemoveAddress] = useState("");
  const [status, setStatus] = useState<FormStatus | null>(null);
  const [submitting, setSubmitting] = useState<"add" | "remove" | null>(null);

  const entries = useMemo(
    () =>
      [...sss.allowlistEntries].sort(
        (left, right) =>
          right.account.addedAt.toNumber() - left.account.addedAt.toNumber()
      ),
    [sss.allowlistEntries]
  );

  const handleAdd = async () => {
    if (!sss.client) return;

    const nextAddress = address.trim();
    if (!isValidPublicKey(nextAddress)) {
      setStatus({
        tone: "error",
        message: "Enter a valid Solana address before adding it.",
      });
      return;
    }

    const normalized = normalizeAddress(nextAddress);
    if (!reason.trim()) {
      setStatus({
        tone: "error",
        message: "Add a short reason for the allowlist entry.",
      });
      return;
    }

    if (
      entries.some(
        (entry) => entry.account.address.toBase58() === normalized
      )
    ) {
      setStatus({
        tone: "error",
        message: "That address is already allowlisted on-chain.",
      });
      return;
    }

    setSubmitting("add");
    setStatus(null);

    try {
      const owner = new PublicKey(normalized);
      const targetTokenAccount = sss.client.getAssociatedTokenAddress(
        sss.mint,
        owner
      );
      const { signature } = await sss.client.allowlistAdd(
        sss.mint,
        owner,
        targetTokenAccount,
        { reason: reason.trim() }
      );

      await sss.refresh();
      setAddress("");
      setReason("");
      setStatus({
        tone: "success",
        message: "Allowlist entry recorded on-chain.",
        signature,
      });
    } catch (error) {
      setStatus({
        tone: "error",
        message: getRpcErrorMessage(error, "Failed to update the allowlist."),
      });
    } finally {
      setSubmitting(null);
    }
  };

  const handleRemove = async () => {
    if (!sss.client) return;

    const nextAddress = removeAddress.trim();
    if (!isValidPublicKey(nextAddress)) {
      setStatus({
        tone: "error",
        message: "Enter a valid Solana address to remove.",
      });
      return;
    }

    const normalized = normalizeAddress(nextAddress);
    const hasEntry = entries.some(
      (entry) => entry.account.address.toBase58() === normalized
    );
    if (!hasEntry) {
      setStatus({
        tone: "error",
        message: "That address is not in the on-chain allowlist.",
      });
      return;
    }

    setSubmitting("remove");
    setStatus(null);

    try {
      const owner = new PublicKey(normalized);
      const targetTokenAccount = sss.client.getAssociatedTokenAddress(
        sss.mint,
        owner
      );
      const { signature } = await sss.client.allowlistRemove(
        sss.mint,
        owner,
        targetTokenAccount
      );

      await sss.refresh();
      setRemoveAddress("");
      setStatus({
        tone: "success",
        message: "Allowlist entry removed on-chain.",
        signature,
      });
    } catch (error) {
      setStatus({
        tone: "error",
        message: getRpcErrorMessage(error, "Failed to remove the allowlist entry."),
      });
    } finally {
      setSubmitting(null);
    }
  };

  return (
    <>
      {sss.error ? <StatusBanner tone="error" message={sss.error} /> : null}
      {status ? (
        <StatusBanner tone={status.tone} message={status.message}>
          {status.signature ? (
            <a
              href={explorerTxUrl(status.signature)}
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
          label="Allowlisted Wallets"
          value={entries.length.toString().padStart(2, "0")}
          hint={
            entries.length > 0
              ? "Live entries loaded from the stablecoin config PDA."
              : "No on-chain allowlist entries exist for this mint."
          }
        />
        <MetricCard
          label="Transfer Hook"
          value={sss.config?.enableTransferHook ? "Enabled" : "Disabled"}
          hint={
            sss.config?.enableTransferHook
              ? "Token-2022 transfer-hook enforcement is active."
              : "Transfers are not using hook-based compliance checks."
          }
        />
        <MetricCard
          label="Operator"
          value={shortAddress(publicKey)}
          hint={`Mint ${shortAddress(sss.mint)}`}
          accent="#4488FF"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <div className="space-y-6">
          <div className="space-y-4">
            <SectionLabel className="pt-2">Add Address</SectionLabel>
            <div className="dark-card space-y-4">
              <div>
                <FieldLabel htmlFor="allowlist-address">Wallet Address</FieldLabel>
                <input
                  id="allowlist-address"
                  type="text"
                  value={address}
                  onChange={(event) => setAddress(event.target.value)}
                  placeholder="Wallet to allowlist"
                  className="dark-input"
                />
              </div>
              <div>
                <FieldLabel htmlFor="allowlist-reason">Reason</FieldLabel>
                <textarea
                  id="allowlist-reason"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="Compliance rationale"
                  className="dark-input min-h-[120px] resize-y"
                />
              </div>
              <PrimaryButton
                onClick={handleAdd}
                className="w-full"
                disabled={submitting !== null}
              >
                <ShieldPlus size={16} />
                {submitting === "add" ? "Submitting..." : "Add To Allowlist"}
              </PrimaryButton>
            </div>
          </div>

          <div className="space-y-4">
            <SectionLabel>Remove Address</SectionLabel>
            <div className="dark-card space-y-4">
              <div>
                <FieldLabel htmlFor="remove-allowlist-address">Wallet Address</FieldLabel>
                <input
                  id="remove-allowlist-address"
                  type="text"
                  value={removeAddress}
                  onChange={(event) => setRemoveAddress(event.target.value)}
                  placeholder="Wallet to remove"
                  className="dark-input"
                />
              </div>
              <PrimaryButton
                onClick={handleRemove}
                className="w-full"
                danger
                disabled={submitting !== null}
              >
                <ShieldMinus size={16} />
                {submitting === "remove"
                  ? "Submitting..."
                  : "Remove From Allowlist"}
              </PrimaryButton>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <SectionLabel className="pt-2">Current Allowlist</SectionLabel>
          <div className="dark-card overflow-hidden">
            {entries.length === 0 ? (
              <div className="py-14 text-center">
                <ShieldCheck size={30} className="mx-auto text-[#333]" />
                <div
                  className="mt-4 text-sm uppercase tracking-[0.25em] text-[#444]"
                  style={{ fontFamily: "var(--font-jetbrains-mono)" }}
                >
                  No allowlisted addresses
                </div>
                <div
                  className="mt-2 text-[11px] text-[#555]"
                  style={{ fontFamily: "var(--font-jetbrains-mono)" }}
                >
                  Add a wallet to write the first allowlist entry on-chain.
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-left">
                  <thead className="border-b border-[#1e1e1e] bg-[#0d0d0d]">
                    <tr>
                      <th
                        className="px-4 py-3 text-[11px] uppercase tracking-[0.2em] text-[#666]"
                        style={{ fontFamily: "var(--font-jetbrains-mono)" }}
                      >
                        Address
                      </th>
                      <th
                        className="px-4 py-3 text-[11px] uppercase tracking-[0.2em] text-[#666]"
                        style={{ fontFamily: "var(--font-jetbrains-mono)" }}
                      >
                        Reason
                      </th>
                      <th
                        className="px-4 py-3 text-[11px] uppercase tracking-[0.2em] text-[#666]"
                        style={{ fontFamily: "var(--font-jetbrains-mono)" }}
                      >
                        Added
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((entry) => (
                      <tr
                        key={entry.pubkey.toBase58()}
                        className="border-b border-[#141414] last:border-b-0"
                      >
                        <td className="px-4 py-4 align-top">
                          <div
                            className="text-sm text-white"
                            style={{ fontFamily: "var(--font-jetbrains-mono)" }}
                          >
                            {shortAddress(entry.account.address)}
                          </div>
                          <div
                            className="mt-1 text-[11px] text-[#555]"
                            style={{ fontFamily: "var(--font-jetbrains-mono)" }}
                          >
                            Added by {shortAddress(entry.account.addedBy)}
                          </div>
                        </td>
                        <td
                          className="px-4 py-4 text-sm leading-relaxed text-[#999]"
                          style={{ fontFamily: "var(--font-jetbrains-mono)" }}
                        >
                          {entry.account.reason}
                        </td>
                        <td
                          className="px-4 py-4 text-sm text-[#777]"
                          style={{ fontFamily: "var(--font-jetbrains-mono)" }}
                        >
                          {formatTimestamp(entry.account.addedAt.toNumber())}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

export default function AllowlistPage() {
  return (
    <ConsoleShell
      eyebrow="Allowlist Console"
      title="Approved Counterparties"
      description="Read the live allowlist, add newly approved wallets, and remove obsolete entries without leaving the console."
    >
      <AllowlistPageContent />
    </ConsoleShell>
  );
}
