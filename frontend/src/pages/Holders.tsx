import { useState, useEffect } from "react";
import { useConnection } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { motion } from "framer-motion";
import { PieChart, RefreshCw } from "lucide-react";
import { useStablecoin } from "../hooks/useStablecoin";
import { shortenAddress } from "../utils/pda";

interface Props { mintAddress: string }

interface Holder {
  owner: string;
  balance: number;
  pct: number;
}

export default function Holders({ mintAddress }: Props) {
  const { connection } = useConnection();
  const { state, currentSupply, decimals } = useStablecoin(mintAddress);
  const [holders, setHolders] = useState<Holder[]>([]);
  const [loading, setLoading] = useState(false);
  const [minBalance, setMinBalance] = useState("");

  useEffect(() => {
    if (mintAddress) fetchHolders();
  }, [mintAddress]);

  const fetchHolders = async () => {
    try {
      setLoading(true);
      const mint = new PublicKey(mintAddress);
      const largest = await connection.getTokenLargestAccounts(mint, "confirmed");
      const divisor = 10 ** decimals;
      const totalSupply = Number(currentSupply) / divisor;

      const results: Holder[] = [];
      for (const acct of largest.value) {
        if (Number(acct.uiAmount) === 0) continue;
        try {
          const info = await connection.getParsedAccountInfo(acct.address);
          const data = (info.value?.data as any)?.parsed?.info;
          const owner = data?.owner || acct.address.toBase58();
          results.push({
            owner,
            balance: Number(acct.uiAmount || 0),
            pct: totalSupply > 0 ? (Number(acct.uiAmount || 0) / totalSupply) * 100 : 0,
          });
        } catch {
          results.push({ owner: acct.address.toBase58(), balance: Number(acct.uiAmount || 0), pct: 0 });
        }
      }
      setHolders(results);
    } catch { setHolders([]); }
    finally { setLoading(false); }
  };

  if (!mintAddress || !state) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <PieChart className="w-12 h-12 text-surface-2 mb-4" />
        <h3 className="text-white font-semibold mb-2">No Mint Selected</h3>
        <p className="text-slate-400 text-sm">Select a mint address to view token holders.</p>
      </div>
    );
  }

  const filtered = minBalance ? holders.filter((h) => h.balance >= Number(minBalance)) : holders;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <h1 className="page-title">Token Holders</h1>

      <div className="flex items-center gap-4 mb-6">
        <div>
          <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
            Min Balance
          </label>
          <input
            type="number"
            min={0}
            step="any"
            value={minBalance}
            onChange={(e) => setMinBalance(e.target.value)}
            placeholder="Filter by minimum balance"
            className="glass-input w-56"
          />
        </div>
        <div className="self-end">
          <button
            onClick={fetchHolders}
            disabled={loading}
            className="btn-secondary flex items-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            {loading ? "Loading..." : "Refresh"}
          </button>
        </div>
        <div className="self-end ml-auto">
          <span className="badge-info">
            {filtered.length} holder{filtered.length !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      <div className="glass-card overflow-hidden">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-16">
            <RefreshCw className="w-8 h-8 text-brand-400 mb-3 animate-spin" />
            <p className="text-slate-400 text-sm">Loading holders...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <PieChart className="w-12 h-12 text-surface-2 mb-4" />
            <h3 className="text-white font-semibold mb-2">No Holders Found</h3>
            <p className="text-slate-400 text-sm">
              {minBalance ? "Try adjusting your filter criteria." : "This token has no holders yet."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="table-header">#</th>
                  <th className="table-header">Owner</th>
                  <th className="table-header text-right">Balance</th>
                  <th className="table-header text-right">% Supply</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((h, i) => (
                  <motion.tr
                    key={h.owner}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.02 }}
                    className="table-row"
                  >
                    <td className="table-cell text-slate-500">{i + 1}</td>
                    <td className="table-cell">
                      <a
                        href={`https://explorer.solana.com/address/${h.owner}?cluster=devnet`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-brand-400 hover:text-brand-300 font-mono transition-colors"
                      >
                        {shortenAddress(h.owner, 6)}
                      </a>
                    </td>
                    <td className="table-cell text-right text-slate-200 font-mono">
                      {h.balance.toLocaleString()}
                    </td>
                    <td className="table-cell text-right">
                      <div className="flex items-center justify-end gap-3">
                        <div className="w-20 bg-surface-1 rounded-full h-2 overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${Math.min(h.pct, 100)}%` }}
                            transition={{ duration: 0.6, delay: i * 0.02 }}
                            className="bg-brand-400 h-2 rounded-full"
                          />
                        </div>
                        <span className="text-slate-400 text-xs w-12 text-right font-mono">
                          {h.pct.toFixed(1)}%
                        </span>
                      </div>
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
