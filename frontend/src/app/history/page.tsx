"use client";

import { useState } from "react";
import { Navbar } from "@/components/navbar";

type TxType =
  | "mint"
  | "burn"
  | "transfer"
  | "freeze"
  | "thaw"
  | "pause"
  | "unpause"
  | "grant_role"
  | "revoke_role"
  | "seize"
  | "blacklist_add"
  | "blacklist_remove";

interface HistoryEntry {
  signature: string;
  type: TxType;
  timestamp: number;
  slot: number;
  actor: string;
  details: string;
  success: boolean;
}

const TX_TYPE_CONFIG: Record<
  TxType,
  { label: string; color: string; bg: string }
> = {
  mint: { label: "Mint", color: "text-success", bg: "bg-success/10" },
  burn: { label: "Burn", color: "text-destructive", bg: "bg-destructive/10" },
  transfer: { label: "Transfer", color: "text-accent", bg: "bg-accent/10" },
  freeze: { label: "Freeze", color: "text-warning", bg: "bg-warning/10" },
  thaw: { label: "Thaw", color: "text-success", bg: "bg-success/10" },
  pause: { label: "Pause", color: "text-destructive", bg: "bg-destructive/10" },
  unpause: { label: "Unpause", color: "text-success", bg: "bg-success/10" },
  grant_role: { label: "Grant Role", color: "text-accent", bg: "bg-accent/10" },
  revoke_role: {
    label: "Revoke Role",
    color: "text-warning",
    bg: "bg-warning/10",
  },
  seize: { label: "Seize", color: "text-destructive", bg: "bg-destructive/10" },
  blacklist_add: {
    label: "Blacklist Add",
    color: "text-destructive",
    bg: "bg-destructive/10",
  },
  blacklist_remove: {
    label: "Blacklist Remove",
    color: "text-success",
    bg: "bg-success/10",
  },
};

// Placeholder data matching devnet proof transactions
const PLACEHOLDER_HISTORY: HistoryEntry[] = [
  {
    signature: "5QnFYS65FhB1GoV7uZh7NoAG9D2jyaKRvz8Xch7Axjew",
    type: "unpause",
    timestamp: Date.now() - 120_000,
    slot: 345_892_100,
    actor: "AiYU56...K4AG",
    details: "Resumed all stablecoin operations",
    success: true,
  },
  {
    signature: "4p41KoQ57Bfcpzd5P2LurPnPmUgcr4LVHnNyJjns3WqG",
    type: "pause",
    timestamp: Date.now() - 180_000,
    slot: 345_892_050,
    actor: "AiYU56...K4AG",
    details: "Halted all stablecoin operations",
    success: true,
  },
  {
    signature: "N/A",
    type: "seize",
    timestamp: Date.now() - 240_000,
    slot: 345_892_000,
    actor: "AiYU56...K4AG",
    details: "Seize attempt (expected failure: hook extra accounts)",
    success: false,
  },
  {
    signature: "fpiCRazKpdNJGs6dU9bBcyJGtre51mY698DGJj8WpLsw",
    type: "blacklist_remove",
    timestamp: Date.now() - 300_000,
    slot: 345_891_950,
    actor: "AiYU56...K4AG",
    details: "Removed address from blacklist",
    success: true,
  },
  {
    signature: "2dqkYer3DrdwPn92wqAcCzQneHuHR2K2xSp9ZBwKXNSR",
    type: "blacklist_add",
    timestamp: Date.now() - 360_000,
    slot: 345_891_900,
    actor: "AiYU56...K4AG",
    details: "Added address to blacklist: OFAC sanctioned",
    success: true,
  },
  {
    signature: "59pSTP686ZrodqT1GiZRYSaDDioHCfNhq75S9xiw2o6b",
    type: "burn",
    timestamp: Date.now() - 420_000,
    slot: 345_891_850,
    actor: "AiYU56...K4AG",
    details: "Burned 50.000000 tokens",
    success: true,
  },
  {
    signature: "2gtK4LGKKNPcBwen5nU6fdn73Eq7hWT58SBHRNd6DTFG",
    type: "mint",
    timestamp: Date.now() - 480_000,
    slot: 345_891_800,
    actor: "AiYU56...K4AG",
    details: "Minted 1,000.000000 tokens to recipient",
    success: true,
  },
  {
    signature: "5HVHEhykcdH2Yw7dBfGm8gCxvAxsTWFZMStLngTXg8Dw",
    type: "grant_role",
    timestamp: Date.now() - 540_000,
    slot: 345_891_750,
    actor: "AiYU56...K4AG",
    details: "Granted Freezer role",
    success: true,
  },
  {
    signature: "3cUubdhP8zs56NNJFe1hTSr4KxeigWEwxApzbRjD8UE6",
    type: "grant_role",
    timestamp: Date.now() - 600_000,
    slot: 345_891_700,
    actor: "AiYU56...K4AG",
    details: "Granted Minter role",
    success: true,
  },
];

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function HistoryPage() {
  const [filter, setFilter] = useState<TxType | "all">("all");

  const entries =
    filter === "all"
      ? PLACEHOLDER_HISTORY
      : PLACEHOLDER_HISTORY.filter((e) => e.type === filter);

  const txTypes: (TxType | "all")[] = [
    "all",
    "mint",
    "burn",
    "transfer",
    "freeze",
    "thaw",
    "pause",
    "unpause",
    "grant_role",
    "revoke_role",
    "seize",
    "blacklist_add",
    "blacklist_remove",
  ];

  return (
    <div>
      <Navbar title="Transaction History" />
      <div className="p-6 space-y-6">
        {/* Summary stats */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">Total Transactions</p>
            <p className="text-xl font-semibold text-foreground">
              {PLACEHOLDER_HISTORY.length}
            </p>
          </div>
          <div className="rounded-xl border border-success/20 bg-card p-4">
            <p className="text-xs text-muted-foreground">Successful</p>
            <p className="text-xl font-semibold text-success">
              {PLACEHOLDER_HISTORY.filter((e) => e.success).length}
            </p>
          </div>
          <div className="rounded-xl border border-destructive/20 bg-card p-4">
            <p className="text-xs text-muted-foreground">Failed</p>
            <p className="text-xl font-semibold text-destructive">
              {PLACEHOLDER_HISTORY.filter((e) => !e.success).length}
            </p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">Latest Slot</p>
            <p className="text-xl font-semibold text-foreground font-mono">
              {PLACEHOLDER_HISTORY[0]?.slot.toLocaleString() ?? "—"}
            </p>
          </div>
        </div>

        {/* Filter tabs */}
        <div className="flex flex-wrap gap-2">
          {txTypes.map((type) => {
            const isActive = filter === type;
            const config =
              type === "all"
                ? { label: "All", color: "text-foreground", bg: "bg-muted" }
                : TX_TYPE_CONFIG[type];

            return (
              <button
                key={type}
                onClick={() => setFilter(type)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                  isActive
                    ? `${config.bg} ${config.color}`
                    : "bg-transparent text-muted-foreground hover:bg-muted"
                }`}
              >
                {config.label}
              </button>
            );
          })}
        </div>

        {/* Transaction list */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          {entries.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              No transactions found for this filter.
            </div>
          ) : (
            <div className="divide-y divide-border">
              {entries.map((entry, i) => {
                const typeConfig = TX_TYPE_CONFIG[entry.type];
                return (
                  <div
                    key={i}
                    className="flex items-center gap-4 px-5 py-4 hover:bg-muted/30 transition-colors"
                  >
                    {/* Type badge */}
                    <div
                      className={`shrink-0 rounded-lg px-2.5 py-1 text-xs font-medium ${typeConfig.bg} ${typeConfig.color}`}
                    >
                      {typeConfig.label}
                    </div>

                    {/* Details */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-foreground truncate">
                        {entry.details}
                      </p>
                      <div className="flex items-center gap-3 mt-0.5">
                        <span className="text-xs text-muted-foreground">
                          {formatDate(entry.timestamp)} {formatTime(entry.timestamp)}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          Slot {entry.slot.toLocaleString()}
                        </span>
                        <span className="text-xs text-muted-foreground font-mono">
                          {entry.actor}
                        </span>
                      </div>
                    </div>

                    {/* Status & signature */}
                    <div className="shrink-0 flex items-center gap-3">
                      {entry.success ? (
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-success/10">
                          <svg
                            className="h-3 w-3 text-success"
                            fill="none"
                            viewBox="0 0 24 24"
                            strokeWidth={2.5}
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="m4.5 12.75 6 6 9-13.5"
                            />
                          </svg>
                        </span>
                      ) : (
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-destructive/10">
                          <svg
                            className="h-3 w-3 text-destructive"
                            fill="none"
                            viewBox="0 0 24 24"
                            strokeWidth={2.5}
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M6 18 18 6M6 6l12 12"
                            />
                          </svg>
                        </span>
                      )}
                      {entry.signature !== "N/A" && (
                        <code className="text-xs text-muted-foreground font-mono">
                          {entry.signature.slice(0, 8)}...
                        </code>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Note */}
        <p className="text-xs text-muted-foreground text-center">
          Transaction history is fetched from on-chain program logs. Connect wallet
          and select a mint to view live data.
        </p>
      </div>
    </div>
  );
}
