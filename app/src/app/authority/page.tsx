"use client";

import { useMemo, useState } from "react";
import { ArrowRight, ShieldCheck, UserRoundCog } from "lucide-react";
import { PublicKey } from "@solana/web3.js";
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
  isDefaultPublicKey,
  isValidPublicKey,
  normalizeAddress,
  shortAddress,
} from "@/components/dashboard/consoleUtils";
import { getRpcErrorMessage } from "@/components/dashboard/rpcUtils";
import { useSSS } from "@/hooks/useSSS";

type AuthorityStatus = {
  tone: "success" | "error";
  message: string;
  signature?: string;
};

function AuthorityPageContent() {
  const sss = useSSS();
  const { publicKey } = useWallet();
  const [nominee, setNominee] = useState("");
  const [status, setStatus] = useState<AuthorityStatus | null>(null);
  const [submitting, setSubmitting] = useState<"nominate" | "accept" | null>(
    null
  );

  const currentAuthority =
    sss.roles?.masterAuthority?.toBase58() ??
    sss.config?.masterAuthority?.toBase58() ??
    null;

  const pendingAuthority = useMemo(() => {
    if (!sss.config?.pendingAuthority) return null;
    return isDefaultPublicKey(sss.config.pendingAuthority)
      ? null
      : sss.config.pendingAuthority.toBase58();
  }, [sss.config?.pendingAuthority]);

  const connectedWallet = publicKey?.toBase58() ?? null;
  const canAccept = Boolean(
    pendingAuthority && connectedWallet === pendingAuthority
  );
  const handoffTimestamp = pendingAuthority
    ? sss.config?.updatedAt.toNumber() ?? null
    : null;

  const handleNominate = async () => {
    if (!sss.client) return;

    const nextNominee = nominee.trim();
    if (!isValidPublicKey(nextNominee)) {
      setStatus({
        tone: "error",
        message: "Enter a valid wallet before nominating a new authority.",
      });
      return;
    }

    const normalized = normalizeAddress(nextNominee);
    if (normalized === currentAuthority) {
      setStatus({
        tone: "error",
        message:
          "The nominee must differ from the current master authority.",
      });
      return;
    }

    setSubmitting("nominate");
    setStatus(null);

    try {
      const { signature } = await sss.client.nominateAuthority(
        sss.mint,
        new PublicKey(normalized)
      );

      await sss.refresh();
      setNominee("");
      setStatus({
        tone: "success",
        message: "Pending authority nomination recorded on-chain.",
        signature,
      });
    } catch (error) {
      setStatus({
        tone: "error",
        message: getRpcErrorMessage(
          error,
          "Failed to nominate the new authority."
        ),
      });
    } finally {
      setSubmitting(null);
    }
  };

  const handleAccept = async () => {
    if (!sss.client || !canAccept) return;

    setSubmitting("accept");
    setStatus(null);

    try {
      const { signature } = await sss.client.acceptAuthority(sss.mint);
      await sss.refresh();
      setStatus({
        tone: "success",
        message: "Authority transfer accepted on-chain.",
        signature,
      });
    } catch (error) {
      setStatus({
        tone: "error",
        message: getRpcErrorMessage(
          error,
          "Failed to accept the authority transfer."
        ),
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
          label="Master Authority"
          value={shortAddress(currentAuthority)}
          hint="Read from the live config and role registry."
        />
        <MetricCard
          label="Pending Authority"
          value={shortAddress(pendingAuthority)}
          hint={
            handoffTimestamp
              ? `Updated ${formatTimestamp(handoffTimestamp)}`
              : "No active on-chain nomination."
          }
          accent="#4488FF"
        />
        <MetricCard
          label="Acceptance Gate"
          value={canAccept ? "Ready" : "Waiting"}
          hint={
            canAccept
              ? "Connected wallet matches the nominated authority."
              : "Connect as the nominee to accept the handoff."
          }
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
                placeholder="Future authority wallet"
                className="dark-input"
              />
            </div>
            <PrimaryButton
              onClick={handleNominate}
              className="w-full"
              disabled={submitting !== null}
            >
              <UserRoundCog size={16} />
              {submitting === "nominate"
                ? "Submitting..."
                : "Nominate Authority"}
            </PrimaryButton>

            <div className="rounded-lg border border-[#1e1e1e] bg-[#080808] p-4">
              <div
                className="text-[11px] uppercase tracking-[0.2em] text-[#666]"
                style={{ fontFamily: "var(--font-jetbrains-mono)" }}
              >
                Current Connected Wallet
              </div>
              <div
                className="mt-3 text-sm text-white"
                style={{ fontFamily: "var(--font-jetbrains-mono)" }}
              >
                {shortAddress(connectedWallet)}
              </div>
            </div>

            {canAccept ? (
              <PrimaryButton
                onClick={handleAccept}
                className="w-full"
                disabled={submitting !== null}
              >
                <ShieldCheck size={16} />
                {submitting === "accept"
                  ? "Submitting..."
                  : "Accept Authority"}
              </PrimaryButton>
            ) : null}
          </div>
        </div>

        <div className="space-y-4">
          <SectionLabel className="pt-2">Two-Step Flow</SectionLabel>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_72px_minmax(0,1fr)] lg:items-stretch">
            <div className={`dark-card ${pendingAuthority ? "border-[#D4FF00]/30" : ""}`}>
              <div
                className="text-[11px] uppercase tracking-[0.2em] text-[#D4FF00]"
                style={{ fontFamily: "var(--font-jetbrains-mono)" }}
              >
                Step 01
              </div>
              <h2
                className="mt-4 text-2xl font-bold uppercase tracking-tight text-white"
                style={{ fontFamily: "var(--font-space-grotesk)" }}
              >
                Nominate
              </h2>
              <p
                className="mt-3 text-sm leading-relaxed text-[#777]"
                style={{ fontFamily: "var(--font-jetbrains-mono)" }}
              >
                The current master authority writes the next controller directly
                into the on-chain config.
              </p>
              <div className="mt-6 rounded-lg border border-[#1e1e1e] bg-[#080808] p-4">
                <div
                  className="text-[11px] uppercase tracking-[0.2em] text-[#666]"
                  style={{ fontFamily: "var(--font-jetbrains-mono)" }}
                >
                  Pending Nominee
                </div>
                <div
                  className="mt-2 text-sm text-white"
                  style={{ fontFamily: "var(--font-jetbrains-mono)" }}
                >
                  {shortAddress(pendingAuthority)}
                </div>
              </div>
            </div>

            <div className="hidden items-center justify-center lg:flex">
              <div className="h-px flex-1 bg-[#1e1e1e]" />
              <div
                className={`mx-3 flex h-10 w-10 items-center justify-center rounded-full border ${
                  pendingAuthority
                    ? "border-[#D4FF00] text-[#D4FF00]"
                    : "border-[#2a2a2a] text-[#444]"
                }`}
              >
                <ArrowRight size={16} />
              </div>
              <div className="h-px flex-1 bg-[#1e1e1e]" />
            </div>

            <div className={`dark-card ${canAccept ? "border-[#D4FF00]/30" : ""}`}>
              <div
                className="text-[11px] uppercase tracking-[0.2em] text-[#D4FF00]"
                style={{ fontFamily: "var(--font-jetbrains-mono)" }}
              >
                Step 02
              </div>
              <h2
                className="mt-4 text-2xl font-bold uppercase tracking-tight text-white"
                style={{ fontFamily: "var(--font-space-grotesk)" }}
              >
                Accept
              </h2>
              <p
                className="mt-3 text-sm leading-relaxed text-[#777]"
                style={{ fontFamily: "var(--font-jetbrains-mono)" }}
              >
                The nominated wallet confirms the handoff by signing the
                on-chain acceptance instruction.
              </p>
              <div className="mt-6 rounded-lg border border-[#1e1e1e] bg-[#080808] p-4">
                <div
                  className="text-[11px] uppercase tracking-[0.2em] text-[#666]"
                  style={{ fontFamily: "var(--font-jetbrains-mono)" }}
                >
                  Connected Wallet
                </div>
                <div
                  className="mt-2 text-sm text-white"
                  style={{ fontFamily: "var(--font-jetbrains-mono)" }}
                >
                  {shortAddress(connectedWallet)}
                </div>
                <div
                  className="mt-3 text-[11px] text-[#555]"
                  style={{ fontFamily: "var(--font-jetbrains-mono)" }}
                >
                  {canAccept
                    ? "This wallet matches the pending authority."
                    : "Connect as the nominee to enable the accept step."}
                </div>
              </div>
            </div>
          </div>

          <div className="dark-card">
            <div
              className="text-[11px] uppercase tracking-[0.2em] text-[#666]"
              style={{ fontFamily: "var(--font-jetbrains-mono)" }}
            >
              Handoff Snapshot
            </div>
            <div
              className="mt-4 space-y-3 text-sm text-[#999]"
              style={{ fontFamily: "var(--font-jetbrains-mono)" }}
            >
              <div className="flex items-center justify-between gap-4">
                <span className="text-[#555]">Current master authority</span>
                <span>{shortAddress(currentAuthority)}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-[#555]">Pending authority</span>
                <span>{shortAddress(pendingAuthority)}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-[#555]">Last handoff update</span>
                <span>{formatTimestamp(handoffTimestamp)}</span>
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
      description="Track the current controller, stage the next authority nominee, and complete the two-step handoff directly on-chain."
    >
      <AuthorityPageContent />
    </ConsoleShell>
  );
}
