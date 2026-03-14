import { useState, useEffect } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import toast from "react-hot-toast";
import { motion } from "framer-motion";
import { CheckCircle2, Plus, Trash2, Search, RefreshCw, UserCheck, AlertCircle, ListChecks } from "lucide-react";
import { useStablecoin } from "../hooks/useStablecoin";
import { getAllowlistAddress, shortenAddress } from "../utils/pda";
import { parseError } from "../utils/errors";

interface Props { mintAddress: string }

export default function Allowlist({ mintAddress }: Props) {
  const wallet = useWallet();
  const { state, configPDA, program, refetch } = useStablecoin(mintAddress);
  const [checkAddr, setCheckAddr] = useState("");
  const [checkResult, setCheckResult] = useState<any>(null);
  const [addAddr, setAddAddr] = useState("");
  const [removeAddr, setRemoveAddr] = useState("");
  const [entries, setEntries] = useState<any[]>([]);
  const [busy, setBusy] = useState("");

  useEffect(() => {
    if (program && configPDA && state?.enableAllowlist) fetchEntries();
  }, [program, configPDA, state?.enableAllowlist]);

  const fetchEntries = async () => {
    if (!program || !configPDA) return;
    try {
      const all = await (program.account as any).allowlistEntry.all([
        { memcmp: { offset: 8, bytes: configPDA.toBase58() } },
      ]);
      setEntries(all);
    } catch { setEntries([]); }
  };

  const handleCheck = async () => {
    if (!program || !configPDA) return;
    try {
      setBusy("check");
      const [pda] = getAllowlistAddress(configPDA, new PublicKey(checkAddr));
      const acct = await (program.account as any).allowlistEntry.fetch(pda);
      setCheckResult(acct);
      toast.success("Address is on the allowlist");
    } catch {
      setCheckResult(null);
      toast.error("Address is NOT on the allowlist");
    } finally { setBusy(""); }
  };

  const handleAdd = async () => {
    if (!wallet.publicKey || !program || !configPDA) return;
    try {
      setBusy("add");
      const addr = new PublicKey(addAddr);
      const [allowlistEntry] = getAllowlistAddress(configPDA, addr);

      await (program.methods as any)
        .addToAllowlist(addr)
        .accounts({
          authority: wallet.publicKey,
          config: configPDA,
          allowlistEntry,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      toast.success("Address added to allowlist");
      setAddAddr("");
      fetchEntries(); refetch();
    } catch (err: any) { toast.error(parseError(err)); }
    finally { setBusy(""); }
  };

  const handleRemove = async () => {
    if (!wallet.publicKey || !program || !configPDA) return;
    try {
      setBusy("remove");
      const addr = new PublicKey(removeAddr);
      const [allowlistEntry] = getAllowlistAddress(configPDA, addr);

      await (program.methods as any)
        .removeFromAllowlist(addr)
        .accounts({
          authority: wallet.publicKey,
          config: configPDA,
          allowlistEntry,
        })
        .rpc();

      toast.success("Address removed from allowlist");
      setRemoveAddr("");
      fetchEntries(); refetch();
    } catch (err: any) { toast.error(parseError(err)); }
    finally { setBusy(""); }
  };

  if (!mintAddress || !state) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <AlertCircle className="w-12 h-12 text-slate-500 mb-4" />
        <p className="text-slate-400 text-sm">Select a mint address to continue</p>
      </div>
    );
  }

  if (!state.enableAllowlist) {
    return (
      <div>
        <h1 className="page-title">Allowlist</h1>
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card border-amber-700/50 bg-amber-900/20"
        >
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-amber-400 text-sm font-medium">Allowlist Not Enabled</p>
              <p className="text-amber-400/80 text-xs mt-1">
                Allowlist is not enabled on this token. Only SSS-3 tokens have allowlist enforcement.
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="page-title">Allowlist Management</h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0 }}
          className="glass-card"
        >
          <div className="flex items-center gap-2 mb-4">
            <Search className="w-5 h-5 text-brand-400" />
            <h2 className="section-title">Check Status</h2>
          </div>
          <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
            Address to Check
          </label>
          <input
            value={checkAddr}
            onChange={(e) => setCheckAddr(e.target.value.trim())}
            placeholder="Enter wallet address"
            className="glass-input font-mono mb-3"
          />
          <button
            onClick={handleCheck}
            disabled={busy === "check" || !checkAddr}
            className="btn-primary w-full"
          >
            {busy === "check" ? "Checking..." : "Check Status"}
          </button>
          {checkResult && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="mt-3 bg-surface-2 rounded-lg p-3 text-xs space-y-2"
            >
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-brand-400" />
                <span className="badge-success">Address is allowlisted</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Added by:</span>
                <span className="font-mono text-slate-300">
                  {shortenAddress(checkResult.addedBy.toBase58())}
                </span>
              </div>
            </motion.div>
          )}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="glass-card"
        >
          <div className="flex items-center gap-2 mb-4">
            <Plus className="w-5 h-5 text-brand-400" />
            <h2 className="section-title">Add to Allowlist</h2>
          </div>
          <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
            Wallet Address
          </label>
          <div className="flex gap-2 mb-3">
            <input
              value={addAddr}
              onChange={(e) => setAddAddr(e.target.value.trim())}
              placeholder="Enter address"
              className="glass-input font-mono flex-1"
            />
            <button
              onClick={() => wallet.publicKey && setAddAddr(wallet.publicKey.toBase58())}
              className="text-xs text-brand-400 hover:text-brand-300 px-2 whitespace-nowrap transition-colors"
            >
              My Wallet
            </button>
          </div>
          <button
            onClick={handleAdd}
            disabled={busy === "add" || !addAddr}
            className="btn-primary w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-surface-3"
          >
            {busy === "add" ? "Adding..." : "Add to Allowlist"}
          </button>
          <p className="text-xs text-slate-500 mt-2 flex items-center gap-1">
            <UserCheck className="w-3 h-3" />
            Authority only
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="glass-card"
        >
          <div className="flex items-center gap-2 mb-4">
            <Trash2 className="w-5 h-5 text-red-400" />
            <h2 className="section-title">Remove from Allowlist</h2>
          </div>
          <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
            Select Address
          </label>
          <select
            value={removeAddr}
            onChange={(e) => setRemoveAddr(e.target.value)}
            className="glass-input mb-3"
          >
            <option value="">Select address...</option>
            {entries.map((e) => (
              <option key={e.account.address.toBase58()} value={e.account.address.toBase58()}>
                {shortenAddress(e.account.address.toBase58(), 6)}
              </option>
            ))}
          </select>
          <button
            onClick={handleRemove}
            disabled={busy === "remove" || !removeAddr}
            className="btn-danger w-full"
          >
            {busy === "remove" ? "Removing..." : "Remove from Allowlist"}
          </button>
          <p className="text-xs text-slate-500 mt-2 flex items-center gap-1">
            <UserCheck className="w-3 h-3" />
            Authority only
          </p>
        </motion.div>
      </div>

      {entries.length > 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="glass-card overflow-hidden p-0"
        >
          <div className="px-6 py-4 border-b border-border/50 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ListChecks className="w-5 h-5 text-brand-400" />
              <h2 className="section-title">Allowlisted Addresses ({entries.length})</h2>
            </div>
            <button
              onClick={fetchEntries}
              className="flex items-center gap-1.5 text-xs text-brand-400 hover:text-brand-300 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Refresh
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="border-b border-border/50">
                  <th className="table-header">Address</th>
                  <th className="table-header">Added By</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e, index) => (
                  <motion.tr
                    key={e.account.address.toBase58()}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: index * 0.05 }}
                    className="border-b border-border/50 transition-colors hover:bg-surface-3/50"
                  >
                    <td className="table-cell font-mono text-slate-300">
                      {shortenAddress(e.account.address.toBase58(), 8)}
                    </td>
                    <td className="table-cell font-mono text-slate-400">
                      {shortenAddress(e.account.addedBy.toBase58())}
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>
      ) : (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center justify-center py-12"
        >
          <ListChecks className="w-12 h-12 text-slate-600 mb-4" />
          <h3 className="text-slate-300 font-medium mb-2">No Allowlist Entries</h3>
          <p className="text-slate-500 text-sm">Add addresses to the allowlist to get started</p>
        </motion.div>
      )}
    </div>
  );
}
