"use client";

import { useEffect, useMemo, useState } from "react";
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
  formatTimestamp,
  isValidPublicKey,
  normalizeAddress,
  shortAddress,
} from "@/components/dashboard/consoleUtils";
import { useSSS } from "@/hooks/useSSS";

type AllowlistEntry = {
  address: string;
  reason: string;
  addedAt: string;
  addedBy: string;
};

type FormStatus = {
  tone: "success" | "error";
  message: string;
};

function AllowlistPageContent() {
  const sss = useSSS();
  const { publicKey } = useWallet();
  const [entries, setEntries] = useState<AllowlistEntry[]>([]);
  const [address, setAddress] = useState("");
  const [reason, setReason] = useState("");
  const [removeAddress, setRemoveAddress] = useState("");
  const [status, setStatus] = useState<FormStatus | null>(null);
  const [hydrated, setHydrated] = useState(false);

  const storageKey = useMemo(
    () => `sss-console-allowlist:${sss.mint.toBase58()}`,
    [sss.mint]
  );

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(storageKey);
      if (stored) {
        setEntries(JSON.parse(stored) as AllowlistEntry[]);
      }
    } catch {
      // ignore malformed local state
    } finally {
      setHydrated(true);
    }
  }, [storageKey]);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(storageKey, JSON.stringify(entries));
  }, [entries, hydrated, storageKey]);

  const handleAdd = () => {
    const nextAddress = address.trim();
    if (!isValidPublicKey(nextAddress)) {
      setStatus({ tone: "error", message: "Enter a valid Solana address before adding it." });
      return;
    }

    const normalized = normalizeAddress(nextAddress);
    if (!reason.trim()) {
      setStatus({ tone: "error", message: "Add a short reason for the allowlist entry." });
      return;
    }

    if (entries.some((entry) => entry.address === normalized)) {
      setStatus({ tone: "error", message: "That address is already in the allowlist registry." });
      return;
    }

    setEntries((current) => [
      {
        address: normalized,
        reason: reason.trim(),
        addedAt: new Date().toISOString(),
        addedBy: publicKey?.toBase58() ?? "operator",
      },
      ...current,
    ]);
    setAddress("");
    setReason("");
    setStatus({ tone: "success", message: "Allowlist entry added to the console registry." });
  };

  const handleRemove = () => {
    const nextAddress = removeAddress.trim();
    if (!isValidPublicKey(nextAddress)) {
      setStatus({ tone: "error", message: "Enter a valid Solana address to remove." });
      return;
    }

    const normalized = normalizeAddress(nextAddress);
    const hasEntry = entries.some((entry) => entry.address === normalized);
    if (!hasEntry) {
      setStatus({ tone: "error", message: "That address is not in the current allowlist table." });
      return;
    }

    setEntries((current) => current.filter((entry) => entry.address !== normalized));
    setRemoveAddress("");
    setStatus({ tone: "success", message: "Allowlist entry removed from the console registry." });
  };

  return (
    <>
      {sss.error ? <StatusBanner tone="error" message={sss.error} /> : null}
      {status ? <StatusBanner tone={status.tone} message={status.message} /> : null}

      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard
          label="Allowlisted Wallets"
          value={entries.length.toString().padStart(2, "0")}
          hint="Operational registry tracked in this console."
        />
        <MetricCard
          label="Transfer Hook"
          value={sss.config?.enableTransferHook ? "Enabled" : "Disabled"}
          hint={
            sss.config?.enableTransferHook
              ? "Blacklist checks will still run for live transfers."
              : "Transfers bypass hook-based blacklist checks."
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
                  placeholder="9MmnDN61FaYd7SRzsnHmwEMj1jbTWh1XD4xaM9nWYujv"
                  className="dark-input"
                />
              </div>
              <div>
                <FieldLabel htmlFor="allowlist-reason">Reason</FieldLabel>
                <textarea
                  id="allowlist-reason"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="Approved market maker / treasury route / regulated venue"
                  className="dark-input min-h-[120px] resize-y"
                />
              </div>
              <PrimaryButton onClick={handleAdd} className="w-full">
                <ShieldPlus size={16} />
                Add To Allowlist
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
                  placeholder="Wallet to remove from registry"
                  className="dark-input"
                />
              </div>
              <PrimaryButton onClick={handleRemove} className="w-full" danger>
                <ShieldMinus size={16} />
                Remove From Allowlist
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
                <div className="mt-4 text-sm uppercase tracking-[0.25em] text-[#444]" style={{ fontFamily: "var(--font-jetbrains-mono)" }}>
                  No allowlisted addresses
                </div>
                <div className="mt-2 text-[11px] text-[#555]" style={{ fontFamily: "var(--font-jetbrains-mono)" }}>
                  Add a wallet to start building the approved counterparty set.
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-left">
                  <thead className="border-b border-[#1e1e1e] bg-[#0d0d0d]">
                    <tr>
                      <th className="px-4 py-3 text-[11px] uppercase tracking-[0.2em] text-[#666]" style={{ fontFamily: "var(--font-jetbrains-mono)" }}>
                        Address
                      </th>
                      <th className="px-4 py-3 text-[11px] uppercase tracking-[0.2em] text-[#666]" style={{ fontFamily: "var(--font-jetbrains-mono)" }}>
                        Reason
                      </th>
                      <th className="px-4 py-3 text-[11px] uppercase tracking-[0.2em] text-[#666]" style={{ fontFamily: "var(--font-jetbrains-mono)" }}>
                        Added
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((entry) => (
                      <tr key={entry.address} className="border-b border-[#141414] last:border-b-0">
                        <td className="px-4 py-4 align-top">
                          <div className="text-sm text-white" style={{ fontFamily: "var(--font-jetbrains-mono)" }}>
                            {shortAddress(entry.address)}
                          </div>
                          <div className="mt-1 text-[11px] text-[#555]" style={{ fontFamily: "var(--font-jetbrains-mono)" }}>
                            Added by {shortAddress(entry.addedBy)}
                          </div>
                        </td>
                        <td className="px-4 py-4 text-sm leading-relaxed text-[#999]" style={{ fontFamily: "var(--font-jetbrains-mono)" }}>
                          {entry.reason}
                        </td>
                        <td className="px-4 py-4 text-sm text-[#777]" style={{ fontFamily: "var(--font-jetbrains-mono)" }}>
                          {formatTimestamp(entry.addedAt)}
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
      eyebrow="Compliance Operations"
      title="Allowlist Registry"
      description="Manage the approved wallet registry used by operations teams to track counterparties alongside the on-chain compliance controls."
    >
      <AllowlistPageContent />
    </ConsoleShell>
  );
}
