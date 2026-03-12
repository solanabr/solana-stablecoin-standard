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
import { formatTimestamp, shortAddress } from "@/components/dashboard/consoleUtils";
import { useSSS } from "@/hooks/useSSS";

type MetadataDraft = {
  name: string;
  symbol: string;
  uri: string;
};

type MetadataStatus = {
  tone: "success" | "error";
  message: string;
};

const EMPTY_DRAFT: MetadataDraft = {
  name: "",
  symbol: "",
  uri: "",
};

function MetadataPageContent() {
  const sss = useSSS();
  const [draft, setDraft] = useState<MetadataDraft>(EMPTY_DRAFT);
  const [stagedMetadata, setStagedMetadata] = useState<MetadataDraft | null>(null);
  const [status, setStatus] = useState<MetadataStatus | null>(null);
  const [hydrated, setHydrated] = useState(false);

  const onChainMetadata = useMemo(
    () => ({
      name: sss.config?.name ?? "",
      symbol: sss.config?.symbol ?? "",
      uri: sss.config?.uri ?? "",
    }),
    [sss.config]
  );

  const storageKey = useMemo(
    () => `sss-console-metadata:${sss.mint.toBase58()}`,
    [sss.mint]
  );

  useEffect(() => {
    setDraft(onChainMetadata);
  }, [onChainMetadata]);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(storageKey);
      if (stored) {
        setStagedMetadata(JSON.parse(stored) as MetadataDraft);
      }
    } catch {
      // ignore malformed local state
    } finally {
      setHydrated(true);
    }
  }, [storageKey]);

  useEffect(() => {
    if (!hydrated) return;
    if (!stagedMetadata) {
      window.localStorage.removeItem(storageKey);
      return;
    }
    window.localStorage.setItem(storageKey, JSON.stringify(stagedMetadata));
  }, [hydrated, stagedMetadata, storageKey]);

  const handleChange =
    (field: keyof MetadataDraft) =>
    (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const value = event.target.value;
      setDraft((current) => ({ ...current, [field]: value }));
    };

  const handleSubmit = () => {
    if (!draft.name.trim() || !draft.symbol.trim() || !draft.uri.trim()) {
      setStatus({ tone: "error", message: "Name, symbol, and URI are all required to update metadata." });
      return;
    }

    setStagedMetadata({
      name: draft.name.trim(),
      symbol: draft.symbol.trim(),
      uri: draft.uri.trim(),
    });
    setStatus({
      tone: "success",
      message: "Metadata update staged in the console. Wire the final instruction when the SDK exposes the write path.",
    });
  };

  return (
    <>
      {sss.error ? <StatusBanner tone="error" message={sss.error} /> : null}
      {status ? <StatusBanner tone={status.tone} message={status.message} /> : null}

      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard
          label="Current Name"
          value={onChainMetadata.name || "Not Loaded"}
          hint={`Mint ${shortAddress(sss.mint)}`}
        />
        <MetricCard
          label="Current Symbol"
          value={onChainMetadata.symbol || "--"}
          hint={onChainMetadata.uri ? "Metadata is present on the stablecoin config." : "No URI found in config."}
          accent="#4488FF"
        />
        <MetricCard
          label="Last Config Update"
          value={sss.config ? formatTimestamp(sss.config.updatedAt.toNumber()) : "--"}
          hint="Derived from the on-chain config timestamp."
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
                placeholder="Stablecoin Name"
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
                placeholder="SSS"
                className="dark-input"
              />
            </div>
            <div>
              <FieldLabel htmlFor="metadata-uri">URI</FieldLabel>
              <textarea
                id="metadata-uri"
                value={draft.uri}
                onChange={handleChange("uri")}
                placeholder="https://example.com/metadata.json"
                className="dark-input min-h-[120px] resize-y"
              />
            </div>
            <PrimaryButton onClick={handleSubmit} className="w-full">
              <FilePenLine size={16} />
              Update Metadata
            </PrimaryButton>
          </div>
        </div>

        <div className="space-y-4">
          <SectionLabel className="pt-2">Current Metadata Values</SectionLabel>
          <div className="space-y-4">
            <div className="dark-card">
              <div className="flex items-center gap-2 text-[#D4FF00]" style={{ fontFamily: "var(--font-jetbrains-mono)" }}>
                <Database size={14} />
                <span className="text-[11px] uppercase tracking-[0.2em]">On-Chain Config</span>
              </div>
              <div className="mt-6 space-y-4">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.2em] text-[#666]" style={{ fontFamily: "var(--font-jetbrains-mono)" }}>
                    Name
                  </div>
                  <div className="mt-2 text-2xl font-bold uppercase tracking-tight text-white" style={{ fontFamily: "var(--font-space-grotesk)" }}>
                    {onChainMetadata.name || "--"}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-[0.2em] text-[#666]" style={{ fontFamily: "var(--font-jetbrains-mono)" }}>
                    Symbol
                  </div>
                  <div className="mt-2 text-lg text-white" style={{ fontFamily: "var(--font-jetbrains-mono)" }}>
                    {onChainMetadata.symbol || "--"}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-[0.2em] text-[#666]" style={{ fontFamily: "var(--font-jetbrains-mono)" }}>
                    URI
                  </div>
                  <div className="mt-2 break-all text-sm leading-relaxed text-[#999]" style={{ fontFamily: "var(--font-jetbrains-mono)" }}>
                    {onChainMetadata.uri || "--"}
                  </div>
                </div>
              </div>
            </div>

            <div className="dark-card">
              <div className="flex items-center gap-2 text-[#4488FF]" style={{ fontFamily: "var(--font-jetbrains-mono)" }}>
                <Link2 size={14} />
                <span className="text-[11px] uppercase tracking-[0.2em]">Staged Update</span>
              </div>
              {stagedMetadata ? (
                <div className="mt-6 space-y-4">
                  <div className="rounded-lg border border-[#1e1e1e] bg-[#080808] p-4">
                    <div className="text-[11px] uppercase tracking-[0.2em] text-[#666]" style={{ fontFamily: "var(--font-jetbrains-mono)" }}>
                      Name
                    </div>
                    <div className="mt-2 text-white" style={{ fontFamily: "var(--font-jetbrains-mono)" }}>
                      {stagedMetadata.name}
                    </div>
                  </div>
                  <div className="rounded-lg border border-[#1e1e1e] bg-[#080808] p-4">
                    <div className="text-[11px] uppercase tracking-[0.2em] text-[#666]" style={{ fontFamily: "var(--font-jetbrains-mono)" }}>
                      Symbol
                    </div>
                    <div className="mt-2 text-white" style={{ fontFamily: "var(--font-jetbrains-mono)" }}>
                      {stagedMetadata.symbol}
                    </div>
                  </div>
                  <div className="rounded-lg border border-[#1e1e1e] bg-[#080808] p-4">
                    <div className="text-[11px] uppercase tracking-[0.2em] text-[#666]" style={{ fontFamily: "var(--font-jetbrains-mono)" }}>
                      URI
                    </div>
                    <div className="mt-2 break-all text-sm leading-relaxed text-[#999]" style={{ fontFamily: "var(--font-jetbrains-mono)" }}>
                      {stagedMetadata.uri}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mt-6 text-sm leading-relaxed text-[#666]" style={{ fontFamily: "var(--font-jetbrains-mono)" }}>
                  No staged metadata update yet.
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
      description="Review the current token identity fields and stage the next metadata payload for operators to publish."
    >
      <MetadataPageContent />
    </ConsoleShell>
  );
}
