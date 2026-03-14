import { useState, useEffect } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import toast from "react-hot-toast";
import { motion } from "framer-motion";
import { Gauge, RefreshCw } from "lucide-react";
import { useStablecoin } from "../hooks/useStablecoin";
import { getRoleAddress, getQuotaAddress, ROLE_MINTER, shortenAddress } from "../utils/pda";
import { parseError } from "../utils/errors";

interface Props { mintAddress: string }

export default function MinterQuotas({ mintAddress }: Props) {
  const wallet = useWallet();
  const { state, configPDA, program, decimals, refetch } = useStablecoin(mintAddress);
  const [checkAddr, setCheckAddr] = useState("");
  const [quotaInfo, setQuotaInfo] = useState<any>(null);
  const [minters, setMinters] = useState<any[]>([]);
  const [setAddr, setSetAddr] = useState("");
  const [quotaLimit, setQuotaLimit] = useState("");
  const [busy, setBusy] = useState("");

  useEffect(() => {
    if (program && configPDA) fetchMinters();
  }, [program, configPDA]);

  const fetchMinters = async () => {
    if (!program || !configPDA) return;
    try {
      const all = await (program.account as any).roleAssignment.all([
        { memcmp: { offset: 8, bytes: configPDA.toBase58() } },
      ]);
      setMinters(all.filter((a: any) => a.account.role === ROLE_MINTER && a.account.active));
    } catch { setMinters([]); }
  };

  const handleCheck = async () => {
    if (!program || !configPDA) return;
    try {
      setBusy("check");
      const [quotaPDA] = getQuotaAddress(configPDA, new PublicKey(checkAddr));
      const acct = await (program.account as any).minterQuota.fetch(quotaPDA);
      setQuotaInfo(acct);
    } catch {
      setQuotaInfo(null);
      toast.error("No quota found for this minter");
    } finally { setBusy(""); }
  };

  const handleSetQuota = async () => {
    if (!wallet.publicKey || !program || !configPDA) return;
    try {
      setBusy("set");
      const minter = new PublicKey(setAddr);
      const [minterRole] = getRoleAddress(configPDA, ROLE_MINTER, minter);
      const [minterQuota] = getQuotaAddress(configPDA, minter);

      await (program.methods as any)
        .setQuota(minter, new BN(Number(quotaLimit) * 10 ** decimals))
        .accounts({
          authority: wallet.publicKey,
          config: configPDA,
          minterRole,
          minterQuota,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      toast.success("Quota updated");
      setQuotaLimit("");
      refetch();
    } catch (err: any) { toast.error(parseError(err)); }
    finally { setBusy(""); }
  };

  if (!mintAddress || !state) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <Gauge className="w-12 h-12 text-surface-2 mb-4" />
        <p className="text-slate-400 text-sm">Select a mint address to manage minter quotas.</p>
      </div>
    );
  }

  const divisor = 10 ** decimals;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <h1 className="page-title">Minter Quotas</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Check Quota */}
        <div className="glass-card">
          <h2 className="section-title">Check Quota</h2>
          <div className="flex gap-2 mb-3">
            <input
              value={checkAddr}
              onChange={(e) => setCheckAddr(e.target.value.trim())}
              placeholder="Minter address"
              className="glass-input flex-1 font-mono"
            />
            <button
              onClick={() => wallet.publicKey && setCheckAddr(wallet.publicKey.toBase58())}
              className="text-xs text-brand-400 hover:text-brand-300 px-2 whitespace-nowrap transition-colors"
            >
              My Wallet
            </button>
          </div>
          <button
            onClick={handleCheck}
            disabled={busy === "check" || !checkAddr}
            className="btn-primary w-full"
          >
            {busy === "check" ? "Checking..." : "Check Quota"}
          </button>
          {quotaInfo && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="mt-4 bg-surface-1 rounded-lg p-4 space-y-2"
            >
              <div className="flex justify-between items-center">
                <span className="text-xs text-slate-400">Limit</span>
                <span className="text-brand-400 font-mono font-semibold">
                  {Number(quotaInfo.quotaLimit.toString()) === 0
                    ? "Unlimited"
                    : (Number(quotaInfo.quotaLimit.toString()) / divisor).toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-slate-400">Minted</span>
                <span className="text-emerald-400 font-mono font-semibold">
                  {(Number(quotaInfo.totalMinted.toString()) / divisor).toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-slate-400">Remaining</span>
                <span className="text-amber-400 font-mono font-semibold">
                  {Number(quotaInfo.quotaLimit.toString()) === 0
                    ? "Unlimited"
                    : ((Number(quotaInfo.quotaLimit.toString()) - Number(quotaInfo.totalMinted.toString())) / divisor).toLocaleString()}
                </span>
              </div>
            </motion.div>
          )}
        </div>

        {/* Set Quota */}
        <div className="glass-card">
          <h2 className="section-title">Set Quota</h2>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                Select Minter
              </label>
              <select
                value={setAddr}
                onChange={(e) => setSetAddr(e.target.value)}
                className="glass-input w-full"
              >
                <option value="">Select minter...</option>
                {minters.map((m) => (
                  <option key={m.account.holder.toBase58()} value={m.account.holder.toBase58()}>
                    {shortenAddress(m.account.holder.toBase58(), 6)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                Or Paste Address
              </label>
              <input
                value={setAddr}
                onChange={(e) => setSetAddr(e.target.value.trim())}
                placeholder="Minter address"
                className="glass-input w-full font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                Quota Limit
              </label>
              <input
                type="number"
                min={0}
                step="any"
                value={quotaLimit}
                onChange={(e) => setQuotaLimit(e.target.value)}
                placeholder="0 = unlimited"
                className="glass-input w-full"
              />
            </div>
            <button
              onClick={handleSetQuota}
              disabled={busy === "set" || !setAddr || quotaLimit === ""}
              className="btn-primary w-full"
            >
              {busy === "set" ? "Setting..." : "Set Quota"}
            </button>
          </div>
          <p className="text-xs text-slate-500 mt-3">Authority only</p>
        </div>
      </div>

      {/* Known Minters Table */}
      {minters.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="glass-card overflow-hidden"
        >
          <div className="px-6 py-4 border-b border-border flex items-center justify-between">
            <h2 className="section-title mb-0">Known Minters ({minters.length})</h2>
            <button
              onClick={fetchMinters}
              className="text-xs text-brand-400 hover:text-brand-300 flex items-center gap-1 transition-colors"
            >
              <RefreshCw className="w-3 h-3" />
              Refresh
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="table-header">Minter Address</th>
                  <th className="table-header">Actions</th>
                </tr>
              </thead>
              <tbody>
                {minters.map((m) => (
                  <tr key={m.account.holder.toBase58()} className="table-row">
                    <td className="table-cell font-mono text-slate-300">
                      {shortenAddress(m.account.holder.toBase58(), 8)}
                    </td>
                    <td className="table-cell">
                      <button
                        onClick={() => { setCheckAddr(m.account.holder.toBase58()); }}
                        className="text-xs text-brand-400 hover:text-brand-300 mr-3 transition-colors"
                      >
                        Check
                      </button>
                      <button
                        onClick={() => { setSetAddr(m.account.holder.toBase58()); }}
                        className="text-xs text-amber-400 hover:text-amber-300 transition-colors"
                      >
                        Set Quota
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}
