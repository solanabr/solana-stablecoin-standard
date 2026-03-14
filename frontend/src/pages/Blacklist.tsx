import { useState, useEffect } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import toast from "react-hot-toast";
import { motion } from "framer-motion";
import { Search, UserX, UserCheck, AlertTriangle, RefreshCw, Wallet } from "lucide-react";
import { useStablecoin } from "../hooks/useStablecoin";
import { getRoleAddress, getBlacklistAddress, ROLE_BLACKLISTER, shortenAddress } from "../utils/pda";
import { parseError } from "../utils/errors";

interface Props { mintAddress: string }

export default function Blacklist({ mintAddress }: Props) {
  const wallet = useWallet();
  const { state, configPDA, program, refetch } = useStablecoin(mintAddress);
  const [checkAddr, setCheckAddr] = useState("");
  const [checkResult, setCheckResult] = useState<any>(null);
  const [addAddr, setAddAddr] = useState("");
  const [reason, setReason] = useState("");
  const [removeAddr, setRemoveAddr] = useState("");
  const [entries, setEntries] = useState<any[]>([]);
  const [busy, setBusy] = useState("");

  useEffect(() => {
    if (program && configPDA && state?.complianceEnabled) fetchEntries();
  }, [program, configPDA, state?.complianceEnabled]);

  const fetchEntries = async () => {
    if (!program || !configPDA) return;
    try {
      const all = await (program.account as any).blacklistEntry.all([
        { memcmp: { offset: 8, bytes: configPDA.toBase58() } },
      ]);
      setEntries(all);
    } catch { setEntries([]); }
  };

  const handleCheck = async () => {
    if (!program || !configPDA) return;
    try {
      setBusy("check");
      const [pda] = getBlacklistAddress(configPDA, new PublicKey(checkAddr));
      const acct = await (program.account as any).blacklistEntry.fetch(pda);
      setCheckResult(acct);
    } catch {
      setCheckResult(null);
      toast.error("Address not found on blacklist");
    } finally { setBusy(""); }
  };

  const handleAdd = async () => {
    if (!wallet.publicKey || !program || !configPDA) return;
    try {
      setBusy("add");
      const addr = new PublicKey(addAddr);
      const [blacklisterRole] = getRoleAddress(configPDA, ROLE_BLACKLISTER, wallet.publicKey);
      const [blacklistEntry] = getBlacklistAddress(configPDA, addr);

      await (program.methods as any)
        .addToBlacklist(addr, reason)
        .accounts({
          blacklister: wallet.publicKey,
          config: configPDA,
          blacklisterRole,
          blacklistEntry,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      toast.success("Address blacklisted");
      setAddAddr(""); setReason("");
      fetchEntries(); refetch();
    } catch (err: any) { toast.error(parseError(err)); }
    finally { setBusy(""); }
  };

  const handleRemove = async () => {
    if (!wallet.publicKey || !program || !configPDA) return;
    try {
      setBusy("remove");
      const addr = new PublicKey(removeAddr);
      const [blacklisterRole] = getRoleAddress(configPDA, ROLE_BLACKLISTER, wallet.publicKey);
      const [blacklistEntry] = getBlacklistAddress(configPDA, addr);

      await (program.methods as any)
        .removeFromBlacklist(addr)
        .accounts({
          blacklister: wallet.publicKey,
          config: configPDA,
          blacklisterRole,
          blacklistEntry,
        })
        .rpc();

      toast.success("Address removed from blacklist");
      setRemoveAddr("");
      fetchEntries(); refetch();
    } catch (err: any) { toast.error(parseError(err)); }
    finally { setBusy(""); }
  };

  if (!mintAddress || !state) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <AlertTriangle className="w-12 h-12 text-slate-600 mb-4" />
        <p className="text-slate-500 text-sm">Select a mint address.</p>
      </div>
    );
  }

  if (!state.complianceEnabled) {
    return (
      <div>
        <h1 className="page-title">Blacklist</h1>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card p-6"
        >
          <div className="flex items-start gap-4">
            <AlertTriangle className="w-6 h-6 text-amber-400 mt-0.5 flex-shrink-0" />
            <div>
              <h3 className="text-amber-400 font-semibold mb-1">Compliance Not Enabled</h3>
              <p className="text-sm text-slate-400">Blacklist is only available for SSS-2 and SSS-3 tokens.</p>
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="page-title">Blacklist Management</h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* Check */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0 }}
          className="glass-card p-6"
        >
          <div className="flex items-center gap-2 mb-4">
            <Search className="w-5 h-5 text-brand-400" />
            <h2 className="section-title">Check Status</h2>
          </div>
          <input
            value={checkAddr}
            onChange={(e) => setCheckAddr(e.target.value.trim())}
            placeholder="Address to check"
            className="glass-input font-mono mb-3"
          />
          <button
            onClick={handleCheck}
            disabled={busy === "check" || !checkAddr}
            className="btn-secondary w-full"
          >
            {busy === "check" ? "Checking..." : "Check"}
          </button>
          {checkResult && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="mt-4 bg-surface-2 rounded-lg p-4 text-xs space-y-2 border border-border"
            >
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Status:</span>
                <span className={checkResult.active ? "badge-danger" : "badge-neutral"}>
                  {checkResult.active ? "Active" : "Inactive"}
                </span>
              </div>
              <div className="flex items-start justify-between">
                <span className="text-slate-400">Reason:</span>
                <span className="text-slate-300 text-right ml-2">{checkResult.reason}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">By:</span>
                <span className="text-slate-300 font-mono">{shortenAddress(checkResult.blacklistedBy.toBase58())}</span>
              </div>
            </motion.div>
          )}
        </motion.div>

        {/* Add */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="glass-card p-6"
        >
          <div className="flex items-center gap-2 mb-4">
            <UserX className="w-5 h-5 text-red-400" />
            <h2 className="section-title">Add to Blacklist</h2>
          </div>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                Address
              </label>
              <div className="flex gap-2">
                <input
                  value={addAddr}
                  onChange={(e) => setAddAddr(e.target.value.trim())}
                  placeholder="Address"
                  className="glass-input font-mono flex-1"
                />
                <button
                  onClick={() => wallet.publicKey && setAddAddr(wallet.publicKey.toBase58())}
                  className="px-3 text-brand-400 hover:text-brand-300 transition-colors flex items-center gap-1"
                  title="Use my wallet"
                >
                  <Wallet className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                Reason
              </label>
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g., OFAC match"
                className="glass-input w-full"
              />
            </div>
            <button
              onClick={handleAdd}
              disabled={busy === "add" || !addAddr || !reason}
              className="btn-danger w-full"
            >
              {busy === "add" ? "Adding..." : "Blacklist Address"}
            </button>
          </div>
          <p className="text-xs text-slate-500 mt-3 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" />
            Requires Blacklister role
          </p>
        </motion.div>

        {/* Remove */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="glass-card p-6"
        >
          <div className="flex items-center gap-2 mb-4">
            <UserCheck className="w-5 h-5 text-emerald-400" />
            <h2 className="section-title">Remove from Blacklist</h2>
          </div>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                Select Address
              </label>
              <select
                value={removeAddr}
                onChange={(e) => setRemoveAddr(e.target.value)}
                className="glass-input w-full"
              >
                <option value="">Select address...</option>
                {entries.filter((e) => e.account.active).map((e) => (
                  <option key={e.account.address.toBase58()} value={e.account.address.toBase58()}>
                    {shortenAddress(e.account.address.toBase58())} — {e.account.reason}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                Or Paste Address
              </label>
              <input
                value={removeAddr}
                onChange={(e) => setRemoveAddr(e.target.value.trim())}
                placeholder="Address"
                className="glass-input font-mono w-full"
              />
            </div>
            <button
              onClick={handleRemove}
              disabled={busy === "remove" || !removeAddr}
              className="btn-primary w-full"
            >
              {busy === "remove" ? "Removing..." : "Remove from Blacklist"}
            </button>
          </div>
        </motion.div>
      </div>

      {/* Table */}
      {entries.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="glass-card overflow-hidden"
        >
          <div className="px-6 py-4 border-b border-border flex items-center justify-between">
            <h2 className="section-title">
              Blacklisted Addresses ({entries.filter((e) => e.account.active).length})
            </h2>
            <button
              onClick={fetchEntries}
              className="text-xs text-brand-400 hover:text-brand-300 transition-colors flex items-center gap-1"
            >
              <RefreshCw className="w-3 h-3" />
              Refresh
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="border-b border-border">
                  <th className="table-header">Address</th>
                  <th className="table-header">Reason</th>
                  <th className="table-header">Status</th>
                  <th className="table-header">Blacklisted By</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.account.address.toBase58()} className="table-row">
                    <td className="table-cell font-mono text-slate-300">
                      {shortenAddress(e.account.address.toBase58(), 6)}
                    </td>
                    <td className="table-cell text-slate-400">{e.account.reason}</td>
                    <td className="table-cell">
                      <span className={e.account.active ? "badge-danger" : "badge-neutral"}>
                        {e.account.active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="table-cell font-mono text-slate-400">
                      {shortenAddress(e.account.blacklistedBy.toBase58())}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>
      )}
    </div>
  );
}
