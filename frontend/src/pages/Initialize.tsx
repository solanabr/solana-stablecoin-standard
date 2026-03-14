import { useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { Keypair, SystemProgram, SYSVAR_RENT_PUBKEY } from "@solana/web3.js";
import { Program, AnchorProvider, BN } from "@coral-xyz/anchor";
import { TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import toast from "react-hot-toast";
import { motion } from "framer-motion";
import { getConfigAddress, SSS_TRANSFER_HOOK_PROGRAM_ID } from "../utils/pda";
import { parseError } from "../utils/errors";
import { CirclePlus, Check, Copy, Sparkles, Shield, ShieldCheck } from "lucide-react";
import idl from "../idl/sss_core.json";

const PRESETS = [
  {
    id: "sss-1",
    name: "SSS-1",
    subtitle: "Minimal",
    desc: "Basic token with mint/freeze authority and metadata.",
    gradient: "from-emerald-400/20 to-emerald-600/5",
    border: "border-emerald-400/30",
    dot: "bg-emerald-400",
    icon: Sparkles,
    features: ["Mint Authority", "Freeze Authority", "Metadata", "Supply Cap"],
  },
  {
    id: "sss-2",
    name: "SSS-2",
    subtitle: "Compliant",
    desc: "Permanent delegate, transfer hook & blacklist for regulated tokens.",
    gradient: "from-blue-400/20 to-blue-600/5",
    border: "border-blue-400/30",
    dot: "bg-blue-400",
    icon: Shield,
    features: ["All SSS-1", "Permanent Delegate", "Transfer Hook", "Blacklist", "Seize"],
  },
  {
    id: "sss-3",
    name: "SSS-3",
    subtitle: "Allowlist",
    desc: "Full compliance + allowlist. Only approved addresses can hold tokens.",
    gradient: "from-purple-400/20 to-purple-600/5",
    border: "border-purple-400/30",
    dot: "bg-purple-400",
    icon: ShieldCheck,
    features: ["All SSS-2", "Allowlist Enforcement"],
  },
];

export default function Initialize() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [preset, setPreset] = useState("sss-2");
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [uri, setUri] = useState("");
  const [decimals, setDecimals] = useState(6);
  const [loading, setLoading] = useState(false);
  const [createdMint, setCreatedMint] = useState("");

  const handleSubmit = async () => {
    if (!wallet.publicKey || !wallet.signTransaction || !wallet.signAllTransactions) {
      toast.error("Connect your wallet first");
      return;
    }
    if (!name || !symbol) {
      toast.error("Name and symbol are required");
      return;
    }
    try {
      setLoading(true);
      const provider = new AnchorProvider(connection, wallet as any, { commitment: "confirmed" });
      const program = new Program(idl as any, provider);
      const mint = Keypair.generate();
      const [configPDA] = getConfigAddress(mint.publicKey);

      const input = {
        name,
        symbol,
        uri: uri || "",
        decimals,
        complianceEnabled: preset !== "sss-1",
        enableAllowlist: preset === "sss-3",
        supplyCap: null as (BN | null),
      };

      await (program.methods as any)
        .initialize(input)
        .accounts({
          authority: wallet.publicKey,
          mint: mint.publicKey,
          config: configPDA,
          transferHookProgram: SSS_TRANSFER_HOOK_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          token2022Program: TOKEN_2022_PROGRAM_ID,
          rent: SYSVAR_RENT_PUBKEY,
        })
        .signers([mint])
        .rpc();

      setCreatedMint(mint.publicKey.toBase58());
      toast.success("Stablecoin initialized!");
    } catch (err: any) {
      toast.error(parseError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h1 className="page-title mb-2">Initialize Stablecoin</h1>
      <p className="text-sm text-slate-500 mb-8">Create a new Token-2022 stablecoin with configurable compliance features.</p>

      {createdMint ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="glass-card p-8 max-w-lg mx-auto text-center border-brand-400/20"
        >
          <div className="w-14 h-14 rounded-2xl bg-brand-400/10 flex items-center justify-center mx-auto mb-4">
            <Check size={28} className="text-brand-400" />
          </div>
          <h3 className="text-xl font-bold text-white mb-2">Token Created!</h3>
          <p className="text-sm text-slate-400 mb-5">Copy this mint address and paste it in the bar above to manage your token.</p>
          <div className="flex items-center gap-2 bg-surface-1 rounded-xl p-3">
            <code className="flex-1 text-sm text-brand-400 font-mono break-all text-left">{createdMint}</code>
            <button
              onClick={() => { navigator.clipboard.writeText(createdMint); toast.success("Copied!"); }}
              className="btn-secondary !p-2.5 shrink-0"
            >
              <Copy size={14} />
            </button>
          </div>
          <button onClick={() => setCreatedMint("")} className="mt-4 text-sm text-slate-500 hover:text-slate-300 transition-colors">
            Create another token
          </button>
        </motion.div>
      ) : (
        <>
          {/* Preset Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            {PRESETS.map((p, i) => (
              <motion.button
                key={p.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.08 }}
                onClick={() => setPreset(p.id)}
                className={`text-left glass-card p-5 transition-all duration-300 ${
                  preset === p.id
                    ? `${p.border} shadow-card bg-gradient-to-br ${p.gradient}`
                    : "hover:border-border-light"
                }`}
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${preset === p.id ? `bg-gradient-to-br ${p.gradient}` : "bg-surface-3"}`}>
                    <p.icon size={18} className={preset === p.id ? "text-white" : "text-slate-400"} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">{p.name}</h3>
                    <p className="text-[11px] text-slate-500 font-medium">{p.subtitle}</p>
                  </div>
                  {preset === p.id && (
                    <div className="ml-auto w-5 h-5 rounded-full bg-brand-400 flex items-center justify-center">
                      <Check size={12} className="text-surface-0" strokeWidth={3} />
                    </div>
                  )}
                </div>
                <p className="text-xs text-slate-400 mb-3 leading-relaxed">{p.desc}</p>
                <div className="flex flex-wrap gap-1.5">
                  {p.features.map((f) => (
                    <span key={f} className="px-2 py-0.5 bg-surface-3 rounded-md text-[10px] font-medium text-slate-500">{f}</span>
                  ))}
                </div>
              </motion.button>
            ))}
          </div>

          {/* Form */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="glass-card p-6 space-y-5 max-w-2xl"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Token Name</label>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. My Stablecoin" className="w-full glass-input" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Symbol</label>
                <input value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="e.g. MYUSD" className="w-full glass-input" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Metadata URI</label>
              <input value={uri} onChange={(e) => setUri(e.target.value)} placeholder="https://..." className="w-full glass-input" />
            </div>
            <div className="max-w-[200px]">
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Decimals</label>
              <input type="number" min={0} max={9} value={decimals} onChange={(e) => setDecimals(Number(e.target.value))} className="w-full glass-input" />
            </div>
            <button
              onClick={handleSubmit}
              disabled={loading || !wallet.publicKey}
              className="btn-primary w-full flex items-center justify-center gap-2"
            >
              <CirclePlus size={16} />
              {loading ? "Creating..." : `Create ${PRESETS.find((p) => p.id === preset)?.name} Token`}
            </button>
          </motion.div>
        </>
      )}
    </div>
  );
}
