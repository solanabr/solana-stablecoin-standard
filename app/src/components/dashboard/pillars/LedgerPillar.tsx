"use client";

import { useState, useEffect } from "react";
import { useConnection } from "@solana/wallet-adapter-react";
import { ExternalLink, Radio } from "lucide-react";
import type { ConfirmedSignatureInfo } from "@solana/web3.js";
import type { SSSState } from "@/hooks/useSSS";
import { explorerTxUrl } from "@/components/dashboard/consoleUtils";

export default function LedgerPillar({ sss }: { sss: SSSState }) {
  const { connection } = useConnection();
  const [signatures, setSignatures] = useState<ConfirmedSignatureInfo[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!sss.client) return;

    const fetchSignatures = async () => {
      setLoading(true);
      try {
        const [configPda] = sss.client!.getConfigPda(sss.mint);
        const sigs = await connection.getSignaturesForAddress(configPda, {
          limit: 20,
        });
        setSignatures(sigs);
      } catch {
        // silently fail
      } finally {
        setLoading(false);
      }
    };

    fetchSignatures();
  }, [sss.client, sss.mint, connection]);

  const formatTime = (blockTime: number | null | undefined) => {
    if (!blockTime) return "--";
    const now = Date.now() / 1000;
    const diff = now - blockTime;
    if (diff < 60) return `${Math.floor(diff)}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return new Date(blockTime * 1000).toLocaleDateString();
  };

  return (
    <div className="space-y-6">
      {loading && (
        <div
          className="text-[#D4FF00] text-[11px] uppercase tracking-widest animate-pulse"
          style={{ fontFamily: "var(--font-jetbrains-mono)" }}
        >
          Loading transactions...
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div
          className="text-[#666] text-[11px] uppercase tracking-[0.25em]"
          style={{ fontFamily: "var(--font-jetbrains-mono)" }}
        >
          Recent Transactions ({signatures.length})
        </div>
        <div className="flex items-center gap-2">
          <Radio size={12} className="text-[#D4FF00] pulse-live" />
          <span
            className="text-[#555] text-[10px] uppercase tracking-widest"
            style={{ fontFamily: "var(--font-jetbrains-mono)" }}
          >
            Live RPC Sync
          </span>
        </div>
      </div>

      {/* Transaction log */}
      {signatures.length === 0 && !loading && (
        <div className="dark-card text-center py-12">
          <div
            className="text-[#333] text-sm uppercase tracking-widest"
            style={{ fontFamily: "var(--font-jetbrains-mono)" }}
          >
            No transactions found
          </div>
          <div
            className="text-[#333] text-[11px] mt-2"
            style={{ fontFamily: "var(--font-jetbrains-mono)" }}
          >
            Transactions will appear after on-chain activity
          </div>
        </div>
      )}

      <div className="space-y-2">
        {signatures.map((sig, i) => (
          <a
            key={i}
            href={explorerTxUrl(sig.signature)}
            target="_blank"
            rel="noreferrer"
            className="hover-trigger dark-card flex items-center justify-between group hover:border-[#D4FF00]/20 transition-colors"
          >
            <div className="flex items-center gap-4 min-w-0">
              <span
                className="text-[#333] text-[11px] w-6 text-right shrink-0"
                style={{ fontFamily: "var(--font-jetbrains-mono)" }}
              >
                {(i + 1).toString().padStart(2, "0")}
              </span>
              <div className="min-w-0">
                <div
                  className="text-white text-[13px] group-hover:text-[#D4FF00] transition-colors"
                  style={{ fontFamily: "var(--font-jetbrains-mono)" }}
                >
                  {sig.signature.slice(0, 8)}...{sig.signature.slice(-6)}
                </div>
                <div
                  className="text-[#555] text-[10px] mt-0.5"
                  style={{ fontFamily: "var(--font-jetbrains-mono)" }}
                >
                  Slot {sig.slot.toLocaleString()}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <span
                className="text-[#555] text-[11px]"
                style={{ fontFamily: "var(--font-jetbrains-mono)" }}
              >
                {formatTime(sig.blockTime)}
              </span>
              <ExternalLink
                size={12}
                className="text-[#333] group-hover:text-[#D4FF00] transition-colors"
              />
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
