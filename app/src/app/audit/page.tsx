"use client";

import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Radio, ScrollText } from "lucide-react";
import { useConnection } from "@solana/wallet-adapter-react";
import ConsoleShell from "@/components/dashboard/ConsoleShell";
import {
  MetricCard,
  SectionLabel,
  StatusBanner,
} from "@/components/dashboard/ConsolePrimitives";
import {
  explorerTxUrl,
  formatRelativeTime,
  formatTimestamp,
  shortAddress,
} from "@/components/dashboard/consoleUtils";
import {
  buildRetryMessage,
  getRpcErrorMessage,
  withRpcRetry,
} from "@/components/dashboard/rpcUtils";
import { useSSS } from "@/hooks/useSSS";

type TransactionRow = {
  signature: string;
  actionType: string;
  timestamp: number | null;
  slot: number;
};

type ReserveAttestationRow = {
  index: number;
  timestamp: number;
  attestationUri: string;
  totalReservesUsd: string;
  totalOutstanding: string;
  collateralization: string;
  attestedBy: string;
};

const ACTION_OPTIONS = [
  "All",
  "Initialize",
  "Mint",
  "Burn",
  "Freeze",
  "Thaw",
  "Pause",
  "Unpause",
  "Role Update",
  "Minter Update",
  "Authority Transfer",
  "Blacklist Add",
  "Blacklist Remove",
  "Seize",
  "Reserve Attestation",
  "Unknown",
] as const;

function inferActionType(logMessages: string[] | null | undefined): string {
  const logs = (logMessages ?? []).join(" ").toLowerCase();
  if (logs.includes("initialize")) return "Initialize";
  if (logs.includes("minttokens")) return "Mint";
  if (logs.includes("burntokens")) return "Burn";
  if (logs.includes("freezeaccount")) return "Freeze";
  if (logs.includes("thawaccount")) return "Thaw";
  if (logs.includes("unpause")) return "Unpause";
  if (logs.includes("pause")) return "Pause";
  if (logs.includes("updateroles")) return "Role Update";
  if (logs.includes("updateminter")) return "Minter Update";
  if (logs.includes("transferauthority")) return "Authority Transfer";
  if (logs.includes("blacklistadd")) return "Blacklist Add";
  if (logs.includes("blacklistremove")) return "Blacklist Remove";
  if (logs.includes("attestreserve")) return "Reserve Attestation";
  if (logs.includes("seize")) return "Seize";
  return "Unknown";
}

function formatUsdMinorUnits(value: { toNumber(): number }): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value.toNumber() / 100);
}

function AuditPageContent() {
  const sss = useSSS();
  const { connection } = useConnection();
  const [actionFilter, setActionFilter] =
    useState<(typeof ACTION_OPTIONS)[number]>("All");
  const [transactions, setTransactions] = useState<TransactionRow[]>([]);
  const [attestations, setAttestations] = useState<ReserveAttestationRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!sss.client || !sss.config) {
      setTransactions([]);
      setAttestations([]);
      setStatus(null);
      return;
    }

    let active = true;

    const loadAuditData = async () => {
      setLoading(true);
      setStatus(null);

      try {
        const result = await withRpcRetry(
          async () => {
            const [configPda] = sss.client!.getConfigPda(sss.mint);
            const signatures = await connection.getSignaturesForAddress(configPda, {
              limit: 20,
            });

            const fetchedTransactions = signatures.length
              ? await connection.getTransactions(
                  signatures.map((entry) => entry.signature),
                  {
                    commitment: "confirmed",
                    maxSupportedTransactionVersion: 0,
                  }
                )
              : [];

            const txRows = signatures.map((entry, index) => ({
              signature: entry.signature,
              actionType: inferActionType(
                fetchedTransactions[index]?.meta?.logMessages
              ),
              timestamp:
                entry.blockTime ?? fetchedTransactions[index]?.blockTime ?? null,
              slot: entry.slot,
            }));

            const reserveCount = Math.min(
              sss.config!.reserveAttestationIndex.toNumber(),
              6
            );

            const reserveRows =
              reserveCount > 0
                ? await Promise.all(
                    Array.from({ length: reserveCount }, (_, offset) => {
                      const index =
                        sss.config!.reserveAttestationIndex.toNumber() -
                        offset -
                        1;
                      return sss.client!.fetchReserveAttestation(configPda, index);
                    })
                  )
                : [];

            return {
              transactions: txRows,
              attestations: reserveRows.map((attestation) => {
                const reserves = attestation.totalReservesUsd.toNumber();
                const outstanding = attestation.totalOutstanding.toNumber();
                const collateralization =
                  outstanding > 0
                    ? `${((reserves / outstanding) * 100).toFixed(2)}%`
                    : "--";

                return {
                  index: attestation.index.toNumber(),
                  timestamp: attestation.timestamp.toNumber(),
                  attestationUri: attestation.attestationUri,
                  totalReservesUsd: formatUsdMinorUnits(
                    attestation.totalReservesUsd
                  ),
                  totalOutstanding: formatUsdMinorUnits(
                    attestation.totalOutstanding
                  ),
                  collateralization,
                  attestedBy: attestation.attestedBy.toBase58(),
                };
              }),
            };
          },
          {
            fallbackMessage: "Failed to load audit history.",
            onRetry: (error, delayMs) => {
              if (!active) return;
              setStatus(buildRetryMessage(error, delayMs));
            },
          }
        );

        if (!active) return;

        setTransactions(result.transactions);
        setAttestations(result.attestations);
        setStatus(null);
      } catch (error) {
        if (!active) return;
        setTransactions([]);
        setAttestations([]);
        setStatus(getRpcErrorMessage(error, "Failed to load audit history."));
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void loadAuditData();

    return () => {
      active = false;
    };
  }, [connection, sss.client, sss.config, sss.mint]);

  const filteredTransactions = useMemo(() => {
    if (actionFilter === "All") return transactions;
    return transactions.filter((row) => row.actionType === actionFilter);
  }, [actionFilter, transactions]);

  return (
    <>
      {sss.error ? <StatusBanner tone="error" message={sss.error} /> : null}
      {status ? <StatusBanner tone="error" message={status} /> : null}

      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard
          label="Recent Transactions"
          value={transactions.length.toString().padStart(2, "0")}
          hint="Fetched from the stablecoin config PDA."
        />
        <MetricCard
          label="Reserve Attestations"
          value={attestations.length.toString().padStart(2, "0")}
          hint="Most recent attestations loaded from on-chain accounts."
          accent="#4488FF"
        />
        <MetricCard
          label="RPC Sync"
          value={loading ? "Syncing" : "Live"}
          hint={loading ? "Refreshing transaction and attestation history." : "Dashboard is in sync with the cluster."}
          accent="#FF9933"
        />
      </div>

      <div className="grid gap-6">
        <div className="space-y-4">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <SectionLabel className="pt-2">Transaction Log</SectionLabel>
            <div className="w-full md:w-64">
              <select
                value={actionFilter}
                onChange={(event) =>
                  setActionFilter(
                    event.target.value as (typeof ACTION_OPTIONS)[number]
                  )
                }
                className="dark-input"
              >
                {ACTION_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="dark-card overflow-hidden">
            {filteredTransactions.length === 0 ? (
              <div className="py-14 text-center">
                <ScrollText size={30} className="mx-auto text-[#333]" />
                <div className="mt-4 text-sm uppercase tracking-[0.25em] text-[#444]" style={{ fontFamily: "var(--font-jetbrains-mono)" }}>
                  No transactions for this filter
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-left">
                  <thead className="border-b border-[#1e1e1e] bg-[#0d0d0d]">
                    <tr>
                      <th className="px-4 py-3 text-[11px] uppercase tracking-[0.2em] text-[#666]" style={{ fontFamily: "var(--font-jetbrains-mono)" }}>
                        Action Type
                      </th>
                      <th className="px-4 py-3 text-[11px] uppercase tracking-[0.2em] text-[#666]" style={{ fontFamily: "var(--font-jetbrains-mono)" }}>
                        Timestamp
                      </th>
                      <th className="px-4 py-3 text-[11px] uppercase tracking-[0.2em] text-[#666]" style={{ fontFamily: "var(--font-jetbrains-mono)" }}>
                        Signature
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTransactions.map((row) => (
                      <tr key={row.signature} className="border-b border-[#141414] last:border-b-0">
                        <td className="px-4 py-4 align-top">
                          <div className="text-sm text-white" style={{ fontFamily: "var(--font-jetbrains-mono)" }}>
                            {row.actionType}
                          </div>
                          <div className="mt-1 text-[11px] text-[#555]" style={{ fontFamily: "var(--font-jetbrains-mono)" }}>
                            Slot {row.slot.toLocaleString()}
                          </div>
                        </td>
                        <td className="px-4 py-4 align-top text-sm text-[#999]" style={{ fontFamily: "var(--font-jetbrains-mono)" }}>
                          <div>{formatTimestamp(row.timestamp)}</div>
                          <div className="mt-1 text-[11px] text-[#555]">{formatRelativeTime(row.timestamp)}</div>
                        </td>
                        <td className="px-4 py-4 align-top">
                          <a
                            href={explorerTxUrl(row.signature)}
                            target="_blank"
                            rel="noreferrer"
                            className="hover-trigger inline-flex items-center gap-2 text-sm text-[#D4FF00] transition-colors hover:text-white"
                            style={{ fontFamily: "var(--font-jetbrains-mono)" }}
                          >
                            {shortAddress(row.signature, 8, 6)}
                            <ExternalLink size={12} />
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <SectionLabel>Reserve Attestation History</SectionLabel>
            <div className="flex items-center gap-2">
              <Radio size={12} className="text-[#D4FF00] pulse-live" />
              <span className="text-[10px] uppercase tracking-[0.25em] text-[#555]" style={{ fontFamily: "var(--font-jetbrains-mono)" }}>
                Live RPC Sync
              </span>
            </div>
          </div>

          <div className="dark-card overflow-hidden">
            {attestations.length === 0 ? (
              <div className="py-14 text-center">
                <ScrollText size={30} className="mx-auto text-[#333]" />
                <div className="mt-4 text-sm uppercase tracking-[0.25em] text-[#444]" style={{ fontFamily: "var(--font-jetbrains-mono)" }}>
                  No reserve attestations found
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-left">
                  <thead className="border-b border-[#1e1e1e] bg-[#0d0d0d]">
                    <tr>
                      <th className="px-4 py-3 text-[11px] uppercase tracking-[0.2em] text-[#666]" style={{ fontFamily: "var(--font-jetbrains-mono)" }}>
                        Index
                      </th>
                      <th className="px-4 py-3 text-[11px] uppercase tracking-[0.2em] text-[#666]" style={{ fontFamily: "var(--font-jetbrains-mono)" }}>
                        Timestamp
                      </th>
                      <th className="px-4 py-3 text-[11px] uppercase tracking-[0.2em] text-[#666]" style={{ fontFamily: "var(--font-jetbrains-mono)" }}>
                        Reserves / Outstanding
                      </th>
                      <th className="px-4 py-3 text-[11px] uppercase tracking-[0.2em] text-[#666]" style={{ fontFamily: "var(--font-jetbrains-mono)" }}>
                        Attestation
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {attestations.map((row) => (
                      <tr key={row.index} className="border-b border-[#141414] last:border-b-0">
                        <td className="px-4 py-4 align-top text-sm text-white" style={{ fontFamily: "var(--font-jetbrains-mono)" }}>
                          #{row.index}
                        </td>
                        <td className="px-4 py-4 align-top text-sm text-[#999]" style={{ fontFamily: "var(--font-jetbrains-mono)" }}>
                          <div>{formatTimestamp(row.timestamp)}</div>
                          <div className="mt-1 text-[11px] text-[#555]">Attested by {shortAddress(row.attestedBy)}</div>
                        </td>
                        <td className="px-4 py-4 align-top text-sm text-[#999]" style={{ fontFamily: "var(--font-jetbrains-mono)" }}>
                          <div>{row.totalReservesUsd}</div>
                          <div className="mt-1 text-[11px] text-[#555]">
                            Outstanding {row.totalOutstanding} · {row.collateralization}
                          </div>
                        </td>
                        <td className="px-4 py-4 align-top">
                          <a
                            href={row.attestationUri}
                            target="_blank"
                            rel="noreferrer"
                            className="hover-trigger inline-flex items-center gap-2 text-sm text-[#D4FF00] transition-colors hover:text-white"
                            style={{ fontFamily: "var(--font-jetbrains-mono)" }}
                          >
                            View Report
                            <ExternalLink size={12} />
                          </a>
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

export default function AuditPage() {
  return (
    <ConsoleShell
      eyebrow="Audit Ledger"
      title="Audit History"
      description="Inspect recent on-chain activity, filter by action type, and review the reserve attestation trail published for the stablecoin."
    >
      <AuditPageContent />
    </ConsoleShell>
  );
}
