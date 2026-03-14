import { PublicKey } from "@solana/web3.js";
import { useStablecoin } from "../hooks/useStablecoin";
import { shortenAddress } from "../utils/pda";
import { DashboardSkeleton } from "../components/Skeleton";
import { motion } from "framer-motion";
import {
  Hexagon,
  RefreshCw,
  Shield,
  ShieldCheck,
  ListChecks,
  TrendingUp,
  Flame,
  Activity,
  Crown,
  AlertTriangle,
} from "lucide-react";

interface Props { mintAddress: string }

const cardVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.05, duration: 0.35, ease: "easeOut" as const },
  }),
};

export default function Dashboard({ mintAddress }: Props) {
  const { state, loading, error, currentSupply, decimals, refetch } = useStablecoin(mintAddress);

  if (!mintAddress) {
    return (
      <div className="flex flex-col items-center justify-center h-[50vh] text-center">
        <div className="w-20 h-20 rounded-2xl bg-surface-2 border border-border flex items-center justify-center mb-5">
          <Hexagon size={32} className="text-slate-600" strokeWidth={1.5} />
        </div>
        <h2 className="text-lg font-semibold text-slate-300 mb-2">No Mint Selected</h2>
        <p className="text-sm text-slate-500 max-w-sm">Enter a mint address in the bar above to view its dashboard, or create a new stablecoin via Initialize.</p>
      </div>
    );
  }

  if (loading) {
    return <DashboardSkeleton />;
  }

  if (error || !state) {
    return (
      <div className="glass-card p-8 text-center max-w-md mx-auto mt-12 border-red-500/20">
        <AlertTriangle size={28} className="text-red-400 mx-auto mb-3" />
        <p className="text-red-400 text-sm mb-4">{error || "No config found for this mint."}</p>
        <button onClick={refetch} className="btn-danger">Retry</button>
      </div>
    );
  }

  const divisor = 10 ** decimals;
  const totalMinted = Number(state.totalMinted.toString()) / divisor;
  const totalBurned = Number(state.totalBurned.toString()) / divisor;
  const supply = Number(currentSupply) / divisor;
  const capRaw = Number(state.supplyCap.toString());
  const supplyCap = capRaw === 0 ? null : capRaw / divisor;
  const capPct = supplyCap ? Math.min((supply / supplyCap) * 100, 100) : 0;
  const hasPending = !state.pendingAuthority.equals(PublicKey.default);

  const kpiCards = [
    { label: "Total Minted", value: totalMinted.toLocaleString(), icon: TrendingUp, iconColor: "text-emerald-400", iconBg: "bg-emerald-400/10" },
    { label: "Total Burned", value: totalBurned.toLocaleString(), icon: Flame, iconColor: "text-orange-400", iconBg: "bg-orange-400/10" },
    { label: "Circulating Supply", value: supply.toLocaleString(), icon: Activity, iconColor: "text-cyan-400", iconBg: "bg-cyan-400/10" },
    { label: "Supply Cap", value: supplyCap ? supplyCap.toLocaleString() : "Unlimited", icon: Crown, iconColor: "text-amber-400", iconBg: "bg-amber-400/10" },
  ];

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="page-title mb-1">Dashboard</h1>
          <p className="text-sm text-slate-500">
            Token <span className="font-mono text-slate-400">{shortenAddress(mintAddress, 6)}</span>
          </p>
        </div>
        <button onClick={refetch} className="btn-secondary flex items-center gap-2 !py-2.5">
          <RefreshCw size={14} />
          Refresh
        </button>
      </div>

      {/* Status Row */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="flex items-center gap-2">
          <div className={`status-dot ${state.paused ? "status-dot-paused" : "status-dot-active"}`} />
          <span className={`badge ${state.paused ? "badge-warning" : "badge-success"}`}>
            {state.paused ? "Paused" : "Active"}
          </span>
        </div>
        <span className={`badge ${state.complianceEnabled ? "badge-info" : "badge-neutral"}`}>
          <Shield size={12} />
          Compliance {state.complianceEnabled ? "On" : "Off"}
        </span>
        <span className={`badge ${state.enableAllowlist ? "bg-purple-400/10 text-purple-400 border border-purple-400/20" : "badge-neutral"}`}>
          <ListChecks size={12} />
          Allowlist {state.enableAllowlist ? "On" : "Off"}
        </span>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {kpiCards.map((card, i) => (
          <motion.div
            key={card.label}
            custom={i}
            variants={cardVariants}
            initial="hidden"
            animate="visible"
            className="glass-card glass-card-hover p-5"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">{card.label}</span>
              <div className={`w-8 h-8 rounded-lg ${card.iconBg} flex items-center justify-center`}>
                <card.icon size={16} className={card.iconColor} />
              </div>
            </div>
            <p className="text-2xl font-bold text-white font-mono tracking-tight">{card.value}</p>
          </motion.div>
        ))}
      </div>

      {/* Supply Cap Progress */}
      {supplyCap && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="glass-card p-5 mb-6"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Supply Utilization</span>
            <span className="text-sm font-mono font-semibold text-white">{capPct.toFixed(1)}%</span>
          </div>
          <div className="w-full bg-surface-1 rounded-full h-2.5 overflow-hidden">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-brand-400 to-cyan-400"
              initial={{ width: 0 }}
              animate={{ width: `${capPct}%` }}
              transition={{ duration: 0.8, ease: "easeOut", delay: 0.3 }}
            />
          </div>
          <p className="text-xs text-slate-500 mt-2">
            {supply.toLocaleString()} / {supplyCap.toLocaleString()} tokens used
          </p>
        </motion.div>
      )}

      {/* Authority Info */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="glass-card p-5 mb-6"
      >
        <div className="flex items-center gap-2 mb-3">
          <ShieldCheck size={16} className="text-brand-400" />
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Authority</span>
        </div>
        <p className="text-sm font-mono text-slate-300 break-all">{state.authority.toBase58()}</p>
      </motion.div>

      {/* Pending Authority */}
      {hasPending && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
          className="glass-card p-5 border-amber-400/20"
        >
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle size={16} className="text-amber-400" />
            <h3 className="text-sm font-semibold text-amber-400">Pending Authority Transfer</h3>
          </div>
          <p className="text-sm text-slate-400 mb-2">
            Awaiting acceptance from:
          </p>
          <p className="text-sm font-mono text-amber-300 break-all">{state.pendingAuthority.toBase58()}</p>
        </motion.div>
      )}
    </div>
  );
}
