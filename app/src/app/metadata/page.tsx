"use client";

import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { Database, FilePenLine, Link2 } from "lucide-react";
import ConsoleShell from "@/components/dashboard/ConsoleShell";
import {
  FieldLabel,
  MetricCard,
  PrimaryButton,
  SectionLabel,
  StatusBanner,
} from "@/components/dashboard/ConsolePrimitives";
import { explorerTxUrl, formatTimestamp, shortAddress } from "@/components/dashboard/consoleUtils";
import { getRpcErrorMessage } from "@/components/dashboard/rpcUtils";
import { useSSS } from "@/hooks/useSSS";

type MetadataDraft = {
  name: string;
  symbol: string;
  uri: string;
};

type MetadataStatus = {
  tone: "success" | "error";
  message: string;
  signature?: string;
};

const EMPTY_DRAFT: MetadataDraft = {
  name: "",
  symbol: "",
  uri: "",
};

function MetadataPageContent() {
  const sss = useSSS();
  const [draft, setDraft] = useState<MetadataDraft>(EMPTY_DRAFT);
  const [status, setStatus] = useState<MetadataStatus | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [dirty, setDirty] = useState(false);

  const onChainMetadata = useMemo(
    () => ({
      name: sss.config?.name ?? "",
      symbol: sss.config?.symbol ?? "",
      uri: sss.config?.uri ?? "",
    }),
    [sss.config]
  );

  const hasMetadata = Boolean(
    onChainMetadata.name || onChainMetadata.symbol || onChainMetadata.uri
  );
  const hasUnsavedChanges =
    draft.name.trim() !== onChainMetadata.name ||
    draft.symbol.trim() !== onChainMetadata.symbol ||
    draft.uri.trim() !== onChainMetadata.uri;

  useEffect(() => {
    if (!dirty) {
      setDraft(onChainMetadata);
    }
  }, [dirty, onChainMetadata]);

  const handleChange =
    (field: keyof MetadataDraft) =>
    (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const value = event.target.value;
      setDirty(true);
      setDraft((current) => ({ ...current, [field]: value }));
    };

  const handleSubmit = async () => {
    if (!sss.client) return;

    const nextDraft = {
      name: draft.name.trim(),
      symbol: draft.symbol.trim(),
      uri: draft.uri.trim(),
    };

    if (!nextDraft.name || !nextDraft.symbol || !nextDraft.uri) {
      setStatus({
        tone: "error",
        message: "Name, symbol, and URI are all required to update metadata.",
      });
      return;
    }

    setSubmitting(true);
    setStatus(null);

    try {
      const { signature } = await sss.client.updateMetadata(sss.mint, nextDraft);
      await sss.refresh();
      setDirty(false);
      setStatus({
        tone: "success",
        message: "Metadata updated on-chain.",
        signature,
      });
    } catch (error) {
      setStatus({
        tone: "error",
        message: getRpcErrorMessage(error, "Failed to update token metadata."),
      });
    } finally {
      setSubmitting(false);
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
          label="Current Name"
          value={onChainMetadata.name || "Unconfigured"}
          hint={`Mint ${shortAddress(sss.mint)}`}
        />
        <MetricCard
          label="Current Symbol"
          value={onChainMetadata.symbol || "--"}
          hint={
            onChainMetadata.uri
              ? "Metadata URI is present on the config."
              : "No on-chain metadata URI is configured."
          }
          accent="#4488FF"
        />
        <MetricCard
          label="Last Config Update"
          value={sss.config ? formatTimestamp(sss.config.updatedAt.toNumber()) : "--"}
          hint="Derived from the live stablecoin config timestamp."
          accent="#FF9933"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
        <div className="space-y-4">
          <SectionLabel className="pt-2">Update Metadata</SectionLabel>
          <div className="dark-card space-y-4">
            <div>
              <FieldLabel htmlFor="metadata-name">Name</FieldLabel>
              <input
                id="metadata-name"
                type="text"
                value={draft.name}
                onChange={handleChange("name")}
                placeholder="Token display name"
                className="dark-input"
              />
            </div>
            <div>
              <FieldLabel htmlFor="metadata-symbol">Symbol</FieldLabel>
              <input
                id="metadata-symbol"
                type="text"
                value={draft.symbol}
                onChange={handleChange("symbol")}
                placeholder="Ticker symbol"
                className="dark-input"
              />
            </div>
            <div>
              <FieldLabel htmlFor="metadata-uri">URI</FieldLabel>
              <textarea
                id="metadata-uri"
                value={draft.uri}
                onChange={handleChange("uri")}
                placeholder="Metadata URI"
                className="dark-input min-h-[120px] resize-y"
              />
            </div>
            <PrimaryButton
              onClick={handleSubmit}
              className="w-full"
              disabled={submitting || !hasUnsavedChanges}
            >
              <FilePenLine size={16} />
              {submitting ? "Submitting..." : "Update Metadata"}
            </PrimaryButton>
          </div>
        </div>

        <div className="space-y-4">
          <SectionLabel className="pt-2">Current Metadata Values</SectionLabel>
          <div className="space-y-4">
            <div className="dark-card">
              <div
                className="flex items-center gap-2 text-[#D4FF00]"
                style={{ fontFamily: "var(--font-jetbrains-mono)" }}
              >
                <Database size={14} />
                <span className="text-[11px] uppercase tracking-[0.2em]">
                  On-Chain Config
                </span>
              </div>
              <div className="mt-6 space-y-4">
                <div>
                  <div
                    className="text-[11px] uppercase tracking-[0.2em] text-[#666]"
                    style={{ fontFamily: "var(--font-jetbrains-mono)" }}
                  >
                    Name
                  </div>
                  <div
                    className="mt-2 text-2xl font-bold uppercase tracking-tight text-white"
                    style={{ fontFamily: "var(--font-space-grotesk)" }}
                  >
                    {onChainMetadata.name || "Unconfigured"}
                  </div>
                </div>
                <div>
                  <div
                    className="text-[11px] uppercase tracking-[0.2em] text-[#666]"
                    style={{ fontFamily: "var(--font-jetbrains-mono)" }}
                  >
                    Symbol
                  </div>
                  <div
                    className="mt-2 text-lg text-white"
                    style={{ fontFamily: "var(--font-jetbrains-mono)" }}
                  >
                    {onChainMetadata.symbol || "--"}
                  </div>
                </div>
                <div>
                  <div
                    className="text-[11px] uppercase tracking-[0.2em] text-[#666]"
                    style={{ fontFamily: "var(--font-jetbrains-mono)" }}
                  >
                    URI
                  </div>
                  <div
                    className="mt-2 break-all text-sm leading-relaxed text-[#999]"
                    style={{ fontFamily: "var(--font-jetbrains-mono)" }}
                  >
                    {onChainMetadata.uri || "No URI configured yet."}
                  </div>
                </div>
              </div>
            </div>

            <div className="dark-card">
              <div
                className="flex items-center gap-2 text-[#4488FF]"
                style={{ fontFamily: "var(--font-jetbrains-mono)" }}
              >
                <Link2 size={14} />
                <span className="text-[11px] uppercase tracking-[0.2em]">
                  Submission Preview
                </span>
              </div>
              {hasUnsavedChanges ? (
                <div className="mt-6 space-y-4">
                  <div className="rounded-lg border border-[#1e1e1e] bg-[#080808] p-4">
                    <div
                      className="text-[11px] uppercase tracking-[0.2em] text-[#666]"
                      style={{ fontFamily: "var(--font-jetbrains-mono)" }}
                    >
                      Name
                    </div>
                    <div
                      className="mt-2 text-white"
                      style={{ fontFamily: "var(--font-jetbrains-mono)" }}
                    >
                      {draft.name.trim() || "--"}
                    </div>
                  </div>
                  <div className="rounded-lg border border-[#1e1e1e] bg-[#080808] p-4">
                    <div
                      className="text-[11px] uppercase tracking-[0.2em] text-[#666]"
                      style={{ fontFamily: "var(--font-jetbrains-mono)" }}
                    >
                      Symbol
                    </div>
                    <div
                      className="mt-2 text-white"
                      style={{ fontFamily: "var(--font-jetbrains-mono)" }}
                    >
                      {draft.symbol.trim() || "--"}
                    </div>
                  </div>
                  <div className="rounded-lg border border-[#1e1e1e] bg-[#080808] p-4">
                    <div
                      className="text-[11px] uppercase tracking-[0.2em] text-[#666]"
                      style={{ fontFamily: "var(--font-jetbrains-mono)" }}
                    >
                      URI
                    </div>
                    <div
                      className="mt-2 break-all text-sm leading-relaxed text-[#999]"
                      style={{ fontFamily: "var(--font-jetbrains-mono)" }}
                    >
                      {draft.uri.trim() || "--"}
                    </div>
                  </div>
                </div>
              ) : (
                <div
                  className="mt-6 text-sm leading-relaxed text-[#666]"
                  style={{ fontFamily: "var(--font-jetbrains-mono)" }}
                >
                  {hasMetadata
                    ? "No unsaved metadata changes."
                    : "Populate the form to publish the first metadata values."}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export default function MetadataPage() {
  return (
    <ConsoleShell
      eyebrow="Metadata Console"
      title="Token Metadata"
      description="Review the current token identity fields and publish metadata updates directly to the stablecoin config."
    >
      <MetadataPageContent />
    </ConsoleShell>
  );
}
