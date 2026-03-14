import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import { ShieldCheck, AlertTriangle, Shield, TrendingUp } from "lucide-react";
import { motion } from "framer-motion";
import toast from "react-hot-toast";
import { useStablecoin } from "../hooks/useStablecoin";
import { shortenAddress } from "../utils/pda";
import { parseError } from "../utils/errors";

interface Props { mintAddress: string }

export default function Authority({ mintAddress }: Props) {
  const wallet = useWallet();
  const { state, configPDA, program, decimals, refetch } = useStablecoin(mintAddress);
  const [proposeAddr, setProposeAddr] = useState("");
  const [directAddr, setDirectAddr] = useState("");
  const [supplyCap, setSupplyCap] = useState("");
  const [busy, setBusy] = useState("");

  if (!mintAddress || !state) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <ShieldCheck className="w-12 h-12 text-slate-600 mb-4" />
        <h3 className="text-lg font-medium text-slate-400 mb-2">No Mint Selected</h3>
        <p className="text-sm text-slate-500">Select a mint address to manage authority.</p>
      </div>
    );
  }

  const hasPending = !state.pendingAuthority.equals(PublicKey.default);

  const handlePropose = async () => {
    if (!wallet.publicKey || !program || !configPDA) return;
    try {
      setBusy("propose");
      await (program.methods as any).proposeAuthority(new PublicKey(proposeAddr)).accounts({ authority: wallet.publicKey, config: configPDA }).rpc();
      toast.success("Authority transfer proposed"); setProposeAddr(""); refetch();
    } catch (err: any) { toast.error(parseError(err)); } finally { setBusy(""); }
  };

  const handleAccept = async () => {
    if (!wallet.publicKey || !program || !configPDA) return;
    try {
      setBusy("accept");
      await (program.methods as any).acceptAuthority().accounts({ newAuthority: wallet.publicKey, config: configPDA }).rpc();
      toast.success("Authority accepted!"); refetch();
    } catch (err: any) { toast.error(parseError(err)); } finally { setBusy(""); }
  };

  const handleCancel = async () => {
    if (!wallet.publicKey || !program || !configPDA) return;
    try {
      setBusy("cancel");
      await (program.methods as any).cancelAuthorityTransfer().accounts({ authority: wallet.publicKey, config: configPDA }).rpc();
      toast.success("Transfer cancelled"); refetch();
    } catch (err: any) { toast.error(parseError(err)); } finally { setBusy(""); }
  };

  const handleDirect = async () => {
    if (!wallet.publicKey || !program || !configPDA) return;
    try {
      setBusy("direct");
      await (program.methods as any).transferAuthority(new PublicKey(directAddr)).accounts({ authority: wallet.publicKey, config: configPDA }).rpc();
      toast.success("Authority transferred!"); setDirectAddr(""); refetch();
    } catch (err: any) { toast.error(parseError(err)); } finally { setBusy(""); }
  };

  const handleSetCap = async () => {
    if (!wallet.publicKey || !program || !configPDA) return;
    try {
      setBusy("cap");
      const raw = Number(supplyCap) * 10 ** decimals;
      await (program.methods as any).setSupplyCap(new BN(raw)).accounts({ authority: wallet.publicKey, config: configPDA }).rpc();
      toast.success("Supply cap updated"); setSupplyCap(""); refetch();
    } catch (err: any) { toast.error(parseError(err)); } finally { setBusy(""); }
  };

  const capRaw = Number(state.supplyCap.toString());
  const currentCap = capRaw === 0 ? "Unlimited" : (capRaw / 10 ** decimals).toLocaleString();

  return (
    <div>
      <h1 className="page-title">Authority & Supply Cap</h1>

      <motion.div
        className="glass-card mb-6"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
              <ShieldCheck className="w-3.5 h-3.5 inline mr-1" />
              Current Authority
            </label>
            <p className="text-sm text-slate-200 font-mono break-all">{state.authority.toBase58()}</p>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
              <AlertTriangle className="w-3.5 h-3.5 inline mr-1" />
              Pending Authority
            </label>
            <p className="text-sm font-mono break-all">
              {hasPending ? (
                <span className="badge-warning inline-block">{shortenAddress(state.pendingAuthority.toBase58(), 8)}</span>
              ) : (
                <span className="text-slate-600">None</span>
              )}
            </p>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
              <TrendingUp className="w-3.5 h-3.5 inline mr-1" />
              Supply Cap
            </label>
            <p className="text-sm text-slate-200 font-mono">{currentCap}</p>
          </div>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Propose */}
        <motion.div
          className="glass-card"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <h2 className="section-title">
            <Shield className="w-5 h-5" />
            Propose Authority Transfer
          </h2>
          <p className="text-xs text-slate-400 mb-3">Two-step: propose then the new authority must accept.</p>
          <input
            value={proposeAddr}
            onChange={(e) => setProposeAddr(e.target.value.trim())}
            placeholder="New authority address"
            className="glass-input w-full font-mono mb-3"
          />
          <div className="flex gap-2">
            <button
              onClick={handlePropose}
              disabled={busy === "propose" || !proposeAddr}
              className="btn-primary flex-1"
            >
              {busy === "propose" ? "..." : "Propose"}
            </button>
            {hasPending && (
              <button
                onClick={handleCancel}
                disabled={busy === "cancel"}
                className="btn-secondary"
              >
                {busy === "cancel" ? "..." : "Cancel"}
              </button>
            )}
          </div>
        </motion.div>

        {/* Accept */}
        <motion.div
          className="glass-card"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <h2 className="section-title">
            <ShieldCheck className="w-5 h-5" />
            Accept Authority
          </h2>
          <p className="text-xs text-slate-400 mb-3">If you are the pending authority, click to accept.</p>
          {hasPending && (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 mb-3 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-400">
                Pending transfer to: <span className="font-mono">{shortenAddress(state.pendingAuthority.toBase58(), 8)}</span>
              </p>
            </div>
          )}
          <button
            onClick={handleAccept}
            disabled={busy === "accept" || !hasPending || !wallet.publicKey}
            className="btn-primary w-full"
          >
            {busy === "accept" ? "Accepting..." : "Accept Authority"}
          </button>
        </motion.div>

        {/* Direct */}
        <motion.div
          className="glass-card"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <h2 className="section-title">
            <AlertTriangle className="w-5 h-5" />
            Direct Transfer
          </h2>
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 mb-3 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-400">Immediately transfers authority without confirmation step.</p>
          </div>
          <input
            value={directAddr}
            onChange={(e) => setDirectAddr(e.target.value.trim())}
            placeholder="New authority address"
            className="glass-input w-full font-mono mb-3"
          />
          <button
            onClick={handleDirect}
            disabled={busy === "direct" || !directAddr}
            className="btn-danger w-full"
          >
            {busy === "direct" ? "..." : "Transfer Now"}
          </button>
        </motion.div>

        {/* Supply Cap */}
        <motion.div
          className="glass-card"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <h2 className="section-title">
            <TrendingUp className="w-5 h-5" />
            Set Supply Cap
          </h2>
          <p className="text-xs text-slate-400 mb-3">
            Set to 0 for unlimited. Current: <span className="font-mono text-brand-400">{currentCap}</span>
          </p>
          <input
            type="number"
            min={0}
            step="any"
            value={supplyCap}
            onChange={(e) => setSupplyCap(e.target.value)}
            placeholder="0 = unlimited"
            className="glass-input w-full mb-3"
          />
          <button
            onClick={handleSetCap}
            disabled={busy === "cap" || supplyCap === ""}
            className="btn-primary w-full"
          >
            {busy === "cap" ? "..." : "Update Supply Cap"}
          </button>
        </motion.div>
      </div>
    </div>
  );
}
