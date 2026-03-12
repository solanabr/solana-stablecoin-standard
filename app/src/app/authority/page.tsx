"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRight, ShieldCheck, UserRoundCog } from "lucide-react";
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

type AuthorityStatus = {
  tone: "success" | "error";
  message: string;
};

type PendingTransfer = {
  address: string;
  nominatedAt: string;
};

function AuthorityPageContent() {
  const sss = useSSS();
  const { publicKey } = useWallet();
  const [nominee, setNominee] = useState("");
  const [pending, setPending] = useState<PendingTransfer | null>(null);
  const [status, setStatus] = useState<AuthorityStatus | null>(null);
  const [hydrated, setHydrated] = useState(false);

  const storageKey = useMemo(
    () => `sss-console-pending-authority:${sss.mint.toBase58()}`,
    [sss.mint]
  );

  const currentAuthority =
    sss.roles?.masterAuthority?.toBase58() ??
    sss.config?.masterAuthority?.toBase58() ??
    null;

  const connectedWallet = publicKey?.toBase58() ?? null;
  const canAccept = Boolean(
    pending?.address && connectedWallet === pending.address
  );

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(storageKey);
      if (stored) {
        setPending(JSON.parse(stored) as PendingTransfer);
      }
    } catch {
      // ignore malformed local state
    } finally {
      setHydrated(true);
    }
  }, [storageKey]);

  useEffect(() => {
    if (!hydrated) return;
    if (!pending) {
      window.localStorage.removeItem(storageKey);
      return;
    }
    window.localStorage.setItem(storageKey, JSON.stringify(pending));
  }, [hydrated, pending, storageKey]);

  const handleNominate = () => {
    const nextNominee = nominee.trim();
    if (!isValidPublicKey(nextNominee)) {
      setStatus({ tone: "error", message: "Enter a valid wallet before nominating a new authority." });
      return;
    }

    const normalized = normalizeAddress(nextNominee);
    if (normalized === currentAuthority) {
      setStatus({ tone: "error", message: "The nominee must differ from the current master authority." });
      return;
    }

    setPending({
      address: normalized,
      nominatedAt: new Date().toISOString(),
    });
    setNominee("");
    setStatus({ tone: "success", message: "Pending authority nomination stored in the console handoff flow." });
  };

  const handleAccept = () => {
    if (!canAccept) return;
    setPending(null);
    setStatus({
      tone: "success",
      message:
        "Acceptance recorded for the pending wallet. Execute the final authority transfer on-chain with both signers when you are ready.",
    });
  };

  return (
    <>
      {sss.error ? <StatusBanner tone="error" message={sss.error} /> : null}
      {status ? <StatusBanner tone={status.tone} message={status.message} /> : null}

      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard
          label="Master Authority"
          value={shortAddress(currentAuthority)}
          hint="Read from the on-chain config / role registry."
        />
        <MetricCard
          label="Pending Authority"
          value={shortAddress(pending?.address)}
          hint={
            pending?.nominatedAt
              ? `Nominated ${formatTimestamp(pending.nominatedAt)}`
              : "No active nomination."
          }
          accent="#4488FF"
        />
        <MetricCard
          label="Acceptance Gate"
          value={canAccept ? "Ready" : "Waiting"}
          hint={canAccept ? "Connected wallet matches the pending authority." : "Connect as the nominee to accept."}
          accent="#FF9933"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <div className="space-y-4">
          <SectionLabel className="pt-2">Nominate New Authority</SectionLabel>
          <div className="dark-card space-y-4">
            <div>
              <FieldLabel htmlFor="authority-nominee">Nominee Wallet</FieldLabel>
              <input
                id="authority-nominee"
                type="text"
                value={nominee}
                onChange={(event) => setNominee(event.target.value)}
                placeholder="Future master authority wallet"
                className="dark-input"
              />
            </div>
            <PrimaryButton onClick={handleNominate} className="w-full">
              <UserRoundCog size={16} />
              Nominate Authority
            </PrimaryButton>

            <div className="rounded-lg border border-[#1e1e1e] bg-[#080808] p-4">
              <div className="text-[11px] uppercase tracking-[0.2em] text-[#666]" style={{ fontFamily: "var(--font-jetbrains-mono)" }}>
                Current Connected Wallet
              </div>
              <div className="mt-3 text-sm text-white" style={{ fontFamily: "var(--font-jetbrains-mono)" }}>
                {shortAddress(connectedWallet)}
              </div>
            </div>

            {canAccept ? (
              <PrimaryButton onClick={handleAccept} className="w-full">
                <ShieldCheck size={16} />
                Accept Authority
              </PrimaryButton>
            ) : null}
          </div>
        </div>

        <div className="space-y-4">
          <SectionLabel className="pt-2">Two-Step Flow</SectionLabel>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_72px_minmax(0,1fr)] lg:items-stretch">
            <div className={`dark-card ${pending ? "border-[#D4FF00]/30" : ""}`}>
              <div className="text-[11px] uppercase tracking-[0.2em] text-[#D4FF00]" style={{ fontFamily: "var(--font-jetbrains-mono)" }}>
                Step 01
              </div>
              <h2 className="mt-4 text-2xl font-bold uppercase tracking-tight text-white" style={{ fontFamily: "var(--font-space-grotesk)" }}>
                Nominate
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-[#777]" style={{ fontFamily: "var(--font-jetbrains-mono)" }}>
                The current master authority designates the next controller and starts the operational handoff.
              </p>
              <div className="mt-6 rounded-lg border border-[#1e1e1e] bg-[#080808] p-4">
                <div className="text-[11px] uppercase tracking-[0.2em] text-[#666]" style={{ fontFamily: "var(--font-jetbrains-mono)" }}>
                  Pending Nominee
                </div>
                <div className="mt-2 text-sm text-white" style={{ fontFamily: "var(--font-jetbrains-mono)" }}>
                  {shortAddress(pending?.address)}
                </div>
              </div>
            </div>

            <div className="hidden items-center justify-center lg:flex">
              <div className="h-px flex-1 bg-[#1e1e1e]" />
              <div className={`mx-3 flex h-10 w-10 items-center justify-center rounded-full border ${pending ? "border-[#D4FF00] text-[#D4FF00]" : "border-[#2a2a2a] text-[#444]"}`}>
                <ArrowRight size={16} />
              </div>
              <div className="h-px flex-1 bg-[#1e1e1e]" />
            </div>

            <div className={`dark-card ${canAccept ? "border-[#D4FF00]/30" : ""}`}>
              <div className="text-[11px] uppercase tracking-[0.2em] text-[#D4FF00]" style={{ fontFamily: "var(--font-jetbrains-mono)" }}>
                Step 02
              </div>
              <h2 className="mt-4 text-2xl font-bold uppercase tracking-tight text-white" style={{ fontFamily: "var(--font-space-grotesk)" }}>
                Accept
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-[#777]" style={{ fontFamily: "var(--font-jetbrains-mono)" }}>
                The nominated wallet acknowledges the handoff before the final authority transfer is executed.
              </p>
              <div className="mt-6 rounded-lg border border-[#1e1e1e] bg-[#080808] p-4">
                <div className="text-[11px] uppercase tracking-[0.2em] text-[#666]" style={{ fontFamily: "var(--font-jetbrains-mono)" }}>
                  Connected Wallet
                </div>
                <div className="mt-2 text-sm text-white" style={{ fontFamily: "var(--font-jetbrains-mono)" }}>
                  {shortAddress(connectedWallet)}
                </div>
                <div className="mt-3 text-[11px] text-[#555]" style={{ fontFamily: "var(--font-jetbrains-mono)" }}>
                  {canAccept
                    ? "This wallet matches the pending authority."
                    : "Connect as the nominee to enable the accept button."}
                </div>
              </div>
            </div>
          </div>

          <div className="dark-card">
            <div className="text-[11px] uppercase tracking-[0.2em] text-[#666]" style={{ fontFamily: "var(--font-jetbrains-mono)" }}>
              Handoff Snapshot
            </div>
            <div className="mt-4 space-y-3 text-sm text-[#999]" style={{ fontFamily: "var(--font-jetbrains-mono)" }}>
              <div className="flex items-center justify-between gap-4">
                <span className="text-[#555]">Current master authority</span>
                <span>{shortAddress(currentAuthority)}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-[#555]">Pending authority</span>
                <span>{shortAddress(pending?.address)}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-[#555]">Nomination time</span>
                <span>{pending ? formatTimestamp(pending.nominatedAt) : "--"}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export default function AuthorityPage() {
  return (
    <ConsoleShell
      eyebrow="Authority Management"
      title="Master Authority Handoff"
      description="Track the current controller, stage the next authority nominee, and walk operators through the two-step handoff flow."
    >
      <AuthorityPageContent />
    </ConsoleShell>
  );
}
