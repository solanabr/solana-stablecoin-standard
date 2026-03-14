import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { PauseCircle, PlayCircle, AlertCircle } from "lucide-react";
import { motion } from "framer-motion";
import toast from "react-hot-toast";
import { useStablecoin } from "../hooks/useStablecoin";
import { parseError } from "../utils/errors";

interface Props { mintAddress: string }

export default function PauseUnpause({ mintAddress }: Props) {
  const wallet = useWallet();
  const { state, configPDA, program, refetch } = useStablecoin(mintAddress);
  const [busy, setBusy] = useState(false);

  if (!mintAddress || !state) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <AlertCircle className="w-12 h-12 text-slate-600 mb-4" />
        <h3 className="text-lg font-semibold text-slate-400 mb-2">No Mint Selected</h3>
        <p className="text-sm text-slate-500">Select a mint address to continue.</p>
      </div>
    );
  }

  const handleToggle = async () => {
    if (!wallet.publicKey || !program || !configPDA) return;
    try {
      setBusy(true);
      if (state.paused) {
        await (program.methods as any).unpause().accounts({ authority: wallet.publicKey, config: configPDA }).rpc();
        toast.success("Token unpaused");
      } else {
        await (program.methods as any).pause().accounts({ authority: wallet.publicKey, config: configPDA }).rpc();
        toast.success("Token paused");
      }
      refetch();
    } catch (err: any) { toast.error(parseError(err)); }
    finally { setBusy(false); }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <h1 className="page-title">Pause / Unpause</h1>

      <div className="glass-card flex flex-col items-center text-center max-w-2xl mx-auto">
        {/* Large Animated Status Indicator */}
        <motion.div
          className={`relative w-32 h-32 rounded-full flex items-center justify-center mb-8 ${
            state.paused
              ? "bg-red-500/10 border-2 border-red-500/30"
              : "bg-brand-400/10 border-2 border-brand-400/30"
          }`}
          initial={{ scale: 0.8 }}
          animate={{ scale: 1 }}
          transition={{ duration: 0.4 }}
        >
          {/* Glow effect */}
          <div
            className={`absolute inset-0 rounded-full blur-xl ${
              state.paused
                ? "bg-red-500/30 animate-pulse"
                : "bg-brand-400/30"
            }`}
          />

          {/* Pulsing dot */}
          <motion.div
            className={`relative w-12 h-12 rounded-full ${
              state.paused ? "bg-red-500" : "bg-brand-400"
            }`}
            animate={state.paused ? {
              scale: [1, 1.2, 1],
              opacity: [1, 0.7, 1]
            } : {}}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: "easeInOut"
            }}
          />
        </motion.div>

        {/* Status Text */}
        <h2 className={`text-3xl font-bold mb-3 ${
          state.paused ? "text-red-400" : "text-brand-400"
        }`}>
          {state.paused ? "PAUSED" : "ACTIVE"}
        </h2>

        <p className="text-sm text-slate-400 mb-8 max-w-md leading-relaxed">
          {state.paused
            ? "All token operations are currently blocked. Mint, burn, transfer, freeze, and compliance operations will fail."
            : "Token is operating normally. All authorized operations are enabled."}
        </p>

        {/* Toggle Button */}
        <button
          onClick={handleToggle}
          disabled={busy || !wallet.publicKey}
          className={`px-8 py-3 rounded-lg text-sm font-semibold transition-all ${
            state.paused
              ? "btn-primary"
              : "btn-danger"
          } disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          {busy ? (
            "Processing..."
          ) : state.paused ? (
            <span className="flex items-center gap-2">
              <PlayCircle className="w-4 h-4" />
              Unpause Token
            </span>
          ) : (
            <span className="flex items-center gap-2">
              <PauseCircle className="w-4 h-4" />
              Pause Token
            </span>
          )}
        </button>

        <p className="text-xs text-slate-500 mt-6">
          Only authority or pauser role can toggle pause state.
        </p>
      </div>
    </motion.div>
  );
}
