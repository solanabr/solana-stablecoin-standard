"use client";

import { useState, useEffect } from "react";
import { PublicKey } from "@solana/web3.js";
import { useConnection } from "@solana/wallet-adapter-react";
import { Navbar } from "@/components/navbar";
import { MintSelector } from "@/components/mint-selector";
import { deriveConfigPda } from "@/lib/pda";

interface HistoryEntry {
  signature: string;
  timestamp: number;
  slot: number;
  memo: string | null;
  success: boolean;
}

function formatTime(ts: number): string {
  if (ts === 0) return "--:--:--";
  const d = new Date(ts);
  return d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatDate(ts: number): string {
  if (ts === 0) return "Unknown";
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function HistoryPage() {
  const { connection } = useConnection();
  const [activeMint, setActiveMint] = useState<string | null>(null);
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!activeMint) {
      setEntries([]);
      setError(null);
      return;
    }

    let cancelled = false;

    async function fetchHistory() {
      setLoading(true);
      setError(null);

      try {
        const mintPubkey = new PublicKey(activeMint!);
        const [configPda] = deriveConfigPda(mintPubkey);

        const sigs = await connection.getSignaturesForAddress(configPda, {
          limit: 50,
        });

        if (cancelled) return;

        const results: HistoryEntry[] = sigs.map((sig) => ({
          signature: sig.signature,
          timestamp: (sig.blockTime ?? 0) * 1000,
          slot: sig.slot,
          memo: sig.memo,
          success: sig.err === null,
        }));

        setEntries(results);
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : "Failed to fetch history";
        setError(message);
        setEntries([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchHistory();

    return () => {
      cancelled = true;
    };
  }, [activeMint, connection]);

  const successCount = entries.filter((e) => e.success).length;
  const failCount = entries.filter((e) => !e.success).length;

  return (
    <div>
      <Navbar title="Transaction History" />
      <div className="p-6 space-y-6">
        <MintSelector onSelect={setActiveMint} currentMint={activeMint} />

        {!activeMint && (
          <div className="rounded-xl border border-border bg-card p-8 text-center">
            <p className="text-sm text-muted-foreground">
              Select a mint address above to view transaction history from on-chain data.
            </p>
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-5">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}

        {loading && (
          <div className="rounded-xl border border-border bg-card p-8 text-center">
            <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
              <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Fetching transaction history...
            </div>
          </div>
        )}

        {activeMint && !loading && entries.length > 0 && (
          <>
            {/* Summary stats */}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div className="rounded-xl border border-border bg-card p-4">
                <p className="text-xs text-muted-foreground">Total Transactions</p>
                <p className="text-xl font-semibold text-foreground">
                  {entries.length}
                </p>
              </div>
              <div className="rounded-xl border border-success/20 bg-card p-4">
                <p className="text-xs text-muted-foreground">Successful</p>
                <p className="text-xl font-semibold text-success">
                  {successCount}
                </p>
              </div>
              <div className="rounded-xl border border-destructive/20 bg-card p-4">
                <p className="text-xs text-muted-foreground">Failed</p>
                <p className="text-xl font-semibold text-destructive">
                  {failCount}
                </p>
              </div>
              <div className="rounded-xl border border-border bg-card p-4">
                <p className="text-xs text-muted-foreground">Latest Slot</p>
                <p className="text-xl font-semibold text-foreground font-mono">
                  {entries[0]?.slot.toLocaleString() ?? "--"}
                </p>
              </div>
            </div>

            {/* Transaction list */}
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="divide-y divide-border">
                {entries.map((entry) => (
                  <div
                    key={entry.signature}
                    className="flex items-center gap-4 px-5 py-4 hover:bg-muted/30 transition-colors"
                  >
                    {/* Status icon */}
                    <div className="shrink-0">
                      {entry.success ? (
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-success/10">
                          <svg
                            className="h-3.5 w-3.5 text-success"
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
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-destructive/10">
                          <svg
                            className="h-3.5 w-3.5 text-destructive"
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
                    </div>

                    {/* Details */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-foreground font-mono truncate">
                        {entry.signature.slice(0, 32)}...
                      </p>
                      <div className="flex items-center gap-3 mt-0.5">
                        <span className="text-xs text-muted-foreground">
                          {formatDate(entry.timestamp)} {formatTime(entry.timestamp)}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          Slot {entry.slot.toLocaleString()}
                        </span>
                        {entry.memo && (
                          <span className="text-xs text-muted-foreground truncate max-w-[200px]">
                            {entry.memo}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Signature link */}
                    <div className="shrink-0">
                      <code className="text-xs text-muted-foreground font-mono">
                        {entry.signature.slice(0, 8)}...{entry.signature.slice(-4)}
                      </code>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {activeMint && !loading && entries.length === 0 && !error && (
          <div className="rounded-xl border border-border bg-card p-8 text-center">
            <p className="text-sm text-muted-foreground">
              No transactions found for this stablecoin config.
            </p>
          </div>
        )}

        <p className="text-xs text-muted-foreground text-center">
          Transaction history is fetched from on-chain signatures for the stablecoin
          config PDA. Select a mint to view live data.
        </p>
      </div>
    </div>
  );
}
