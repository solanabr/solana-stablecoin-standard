import { useState, useEffect } from "react";
import { useConnection } from "@solana/wallet-adapter-react";
import { motion } from "framer-motion";
import { ScrollText, RefreshCw, Clock } from "lucide-react";
import { useStablecoin } from "../hooks/useStablecoin";
import { shortenAddress } from "../utils/pda";

interface Props { mintAddress: string }

interface LogEntry {
  signature: string;
  blockTime: number | null;
  slot: number;
  err: boolean;
}

export default function AuditLog({ mintAddress }: Props) {
  const { connection } = useConnection();
  const { state, configPDA } = useStablecoin(mintAddress);
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (configPDA) fetchLog();
  }, [configPDA]);

  const fetchLog = async () => {
    if (!configPDA) return;
    try {
      setLoading(true);
      const sigs = await connection.getSignaturesForAddress(configPDA, { limit: 50 }, "confirmed");
      setEntries(
        sigs.map((s) => ({
          signature: s.signature,
          blockTime: s.blockTime || null,
          slot: s.slot,
          err: !!s.err,
        }))
      );
    } catch { setEntries([]); }
    finally { setLoading(false); }
  };

  if (!mintAddress || !state) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <ScrollText className="w-12 h-12 text-surface-2 mb-4" />
        <h3 className="text-white font-semibold mb-2">No Mint Selected</h3>
        <p className="text-slate-400 text-sm">Select a mint address to view audit logs.</p>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div className="flex items-center justify-between mb-6">
        <h1 className="page-title mb-0">Audit Log</h1>
        <button
          onClick={fetchLog}
          disabled={loading}
          className="btn-secondary flex items-center gap-2"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          {loading ? "Loading..." : "Refresh"}
        </button>
      </div>

      <div className="glass-card overflow-hidden">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-16">
            <RefreshCw className="w-8 h-8 text-brand-400 mb-3 animate-spin" />
            <p className="text-slate-400 text-sm">Loading transactions...</p>
          </div>
        ) : entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <Clock className="w-12 h-12 text-surface-2 mb-4" />
            <h3 className="text-white font-semibold mb-2">No Transactions Found</h3>
            <p className="text-slate-400 text-sm">No transactions found for this stablecoin.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="table-header">Signature</th>
                  <th className="table-header">Time</th>
                  <th className="table-header">Slot</th>
                  <th className="table-header">Status</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e, i) => (
                  <motion.tr
                    key={e.signature}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.02 }}
                    className="table-row"
                  >
                    <td className="table-cell">
                      <a
                        href={`https://explorer.solana.com/tx/${e.signature}?cluster=devnet`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-brand-400 hover:text-brand-300 font-mono transition-colors"
                      >
                        {shortenAddress(e.signature, 8)}
                      </a>
                    </td>
                    <td className="table-cell text-slate-400">
                      {e.blockTime ? new Date(e.blockTime * 1000).toLocaleString() : "N/A"}
                    </td>
                    <td className="table-cell text-slate-400 font-mono">
                      {e.slot.toLocaleString()}
                    </td>
                    <td className="table-cell">
                      <span className={e.err ? "badge-danger" : "badge-success"}>
                        {e.err ? "Failed" : "Success"}
                      </span>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </motion.div>
  );
}
