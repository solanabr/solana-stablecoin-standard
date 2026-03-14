import { useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, getAssociatedTokenAddressSync, getAccount } from "@solana/spl-token";
import toast from "react-hot-toast";
import { motion } from "framer-motion";
import { Snowflake, Flame, Search, AlertCircle, Wallet } from "lucide-react";
import { useStablecoin } from "../hooks/useStablecoin";
import { getRoleAddress, ROLE_FREEZER } from "../utils/pda";
import { parseError } from "../utils/errors";

interface Props { mintAddress: string }

export default function FreezeThaw({ mintAddress }: Props) {
  const { connection } = useConnection();
  const wallet = useWallet();
  const { state, configPDA, program, refetch } = useStablecoin(mintAddress);
  const [checkAddr, setCheckAddr] = useState("");
  const [frozen, setFrozen] = useState<boolean | null>(null);
  const [freezeAddr, setFreezeAddr] = useState("");
  const [thawAddr, setThawAddr] = useState("");
  const [busy, setBusy] = useState("");

  if (!mintAddress || !state) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <AlertCircle className="w-12 h-12 text-slate-500 mb-4" />
        <p className="text-slate-400 text-sm">Select a mint address to continue</p>
      </div>
    );
  }

  const mint = new PublicKey(mintAddress);

  const handleCheck = async () => {
    try {
      setBusy("check");
      const target = new PublicKey(checkAddr);
      const ata = getAssociatedTokenAddressSync(mint, target, false, TOKEN_2022_PROGRAM_ID);
      const acct = await getAccount(connection, ata, "confirmed", TOKEN_2022_PROGRAM_ID);
      setFrozen(acct.isFrozen);
    } catch {
      toast.error("Token account not found for this address");
      setFrozen(null);
    } finally { setBusy(""); }
  };

  const handleFreeze = async () => {
    if (!wallet.publicKey || !program || !configPDA) return;
    try {
      setBusy("freeze");
      const target = new PublicKey(freezeAddr);
      const targetATA = getAssociatedTokenAddressSync(mint, target, false, TOKEN_2022_PROGRAM_ID);
      const [freezerRole] = getRoleAddress(configPDA, ROLE_FREEZER, wallet.publicKey);

      await (program.methods as any).freezeAccount().accounts({
        freezer: wallet.publicKey, config: configPDA, freezerRole, mint, targetTokenAccount: targetATA, tokenProgram: TOKEN_2022_PROGRAM_ID,
      }).rpc();

      toast.success("Account frozen");
      setFreezeAddr("");
      refetch();
    } catch (err: any) { toast.error(parseError(err)); }
    finally { setBusy(""); }
  };

  const handleThaw = async () => {
    if (!wallet.publicKey || !program || !configPDA) return;
    try {
      setBusy("thaw");
      const target = new PublicKey(thawAddr);
      const targetATA = getAssociatedTokenAddressSync(mint, target, false, TOKEN_2022_PROGRAM_ID);
      const [freezerRole] = getRoleAddress(configPDA, ROLE_FREEZER, wallet.publicKey);

      await (program.methods as any).thawAccount().accounts({
        freezer: wallet.publicKey, config: configPDA, freezerRole, mint, targetTokenAccount: targetATA, tokenProgram: TOKEN_2022_PROGRAM_ID,
      }).rpc();

      toast.success("Account thawed");
      setThawAddr("");
      refetch();
    } catch (err: any) { toast.error(parseError(err)); }
    finally { setBusy(""); }
  };

  return (
    <div>
      <h1 className="page-title">Freeze / Thaw Accounts</h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0 }}
          className="glass-card"
        >
          <div className="flex items-center gap-2 mb-4">
            <Search className="w-5 h-5 text-brand-400" />
            <h2 className="section-title">Check Frozen Status</h2>
          </div>
          <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
            Wallet Address
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
          {frozen !== null && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="mt-3 flex justify-center"
            >
              {frozen ? (
                <span className="badge-info flex items-center gap-1.5">
                  <Snowflake className="w-3.5 h-3.5" />
                  Frozen
                </span>
              ) : (
                <span className="badge-success flex items-center gap-1.5">
                  <Flame className="w-3.5 h-3.5" />
                  Not Frozen
                </span>
              )}
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
            <Snowflake className="w-5 h-5 text-blue-400" />
            <h2 className="section-title">Freeze Account</h2>
          </div>
          <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
            Wallet Address
          </label>
          <div className="flex gap-2 mb-3">
            <input
              value={freezeAddr}
              onChange={(e) => setFreezeAddr(e.target.value.trim())}
              placeholder="Enter wallet address"
              className="glass-input font-mono flex-1"
            />
            <button
              onClick={() => wallet.publicKey && setFreezeAddr(wallet.publicKey.toBase58())}
              className="text-xs text-brand-400 hover:text-brand-300 px-2 whitespace-nowrap transition-colors"
            >
              My Wallet
            </button>
          </div>
          <button
            onClick={handleFreeze}
            disabled={busy === "freeze" || !freezeAddr}
            className="btn-primary w-full bg-blue-600 hover:bg-blue-700 disabled:bg-surface-3"
          >
            {busy === "freeze" ? "Freezing..." : "Freeze Account"}
          </button>
          <p className="text-xs text-slate-500 mt-2 flex items-center gap-1">
            <Snowflake className="w-3 h-3" />
            Requires Freezer role
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="glass-card"
        >
          <div className="flex items-center gap-2 mb-4">
            <Flame className="w-5 h-5 text-emerald-400" />
            <h2 className="section-title">Thaw Account</h2>
          </div>
          <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
            Wallet Address
          </label>
          <div className="flex gap-2 mb-3">
            <input
              value={thawAddr}
              onChange={(e) => setThawAddr(e.target.value.trim())}
              placeholder="Enter wallet address"
              className="glass-input font-mono flex-1"
            />
            <button
              onClick={() => wallet.publicKey && setThawAddr(wallet.publicKey.toBase58())}
              className="text-xs text-brand-400 hover:text-brand-300 px-2 whitespace-nowrap transition-colors"
            >
              My Wallet
            </button>
          </div>
          <button
            onClick={handleThaw}
            disabled={busy === "thaw" || !thawAddr}
            className="btn-primary w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-surface-3"
          >
            {busy === "thaw" ? "Thawing..." : "Thaw Account"}
          </button>
          <p className="text-xs text-slate-500 mt-2 flex items-center gap-1">
            <Flame className="w-3 h-3" />
            Requires Freezer role
          </p>
        </motion.div>
      </div>
    </div>
  );
}
