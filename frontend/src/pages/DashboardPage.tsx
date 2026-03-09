import React from "react";
import BN from "bn.js";
import { Link } from "react-router-dom";
import { useStablecoinContext } from "../contexts/StablecoinContext";
import { AddressDisplay } from "../components/shared/AddressDisplay";
import { LoadingSpinner } from "../components/shared/LoadingSpinner";
import {
  formatTokenCompact,
  formatTokenAmount,
  presetLabel,
} from "../utils/format";

// ── Stat card ────────────────────────────────────────────────────────────────

interface StatCardProps {
  label:    string;
  value:    string;
  subValue?: string;
  icon:     React.ReactNode;
  accent:   string; // tailwind bg class for icon bg
}

function StatCard({ label, value, subValue, icon, accent }: StatCardProps) {
  return (
    <div className="stat-card">
      <div className="flex items-center justify-between">
        <span className="stat-label">{label}</span>
        <span className={`w-8 h-8 rounded-lg ${accent} flex items-center justify-center flex-shrink-0`}>
          {icon}
        </span>
      </div>
      <span className="stat-value mt-1">{value}</span>
      {subValue && <span className="text-xs text-slate-500">{subValue}</span>}
    </div>
  );
}

// ── Quick action tile ────────────────────────────────────────────────────────

interface QuickActionProps {
  to:          string;
  label:       string;
  description: string;
  icon:        React.ReactNode;
  color:       string;
}

function QuickAction({ to, label, description, icon, color }: QuickActionProps) {
  return (
    <Link
      to={to}
      className="card p-4 flex items-start gap-3 hover:bg-surface-hover
                 transition-colors duration-150 group"
    >
      <span className={`w-9 h-9 rounded-lg ${color} flex items-center justify-center flex-shrink-0 mt-0.5`}>
        {icon}
      </span>
      <div>
        <p className="text-sm font-medium text-slate-200 group-hover:text-white transition-colors">
          {label}
        </p>
        <p className="text-xs text-slate-500 mt-0.5">{description}</p>
      </div>
    </Link>
  );
}

// ── Empty state ──────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="card flex flex-col items-center justify-center py-20 text-center">
      <div className="w-16 h-16 rounded-2xl bg-indigo-600/10 border border-indigo-700/30
                      flex items-center justify-center mb-4">
        <svg className="w-8 h-8 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round"
            d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
      <h3 className="text-base font-semibold text-white mb-1">No mint selected</h3>
      <p className="text-sm text-slate-500 max-w-xs">
        Paste a stablecoin mint address in the search bar above to load its data.
      </p>
    </div>
  );
}

// ── Dashboard page ────────────────────────────────────────────────────────────

const DECIMALS = 6; // default display decimals; real value comes from on-chain metadata

export default function DashboardPage() {
  const { info, infoLoading, infoError, mintAddress, isAdmin } =
    useStablecoinContext();

  if (infoLoading) {
    return <LoadingSpinner centered />;
  }

  if (!mintAddress) {
    return <EmptyState />;
  }

  if (infoError) {
    return (
      <div className="card p-6 flex items-start gap-3">
        <svg className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
        </svg>
        <div>
          <p className="text-sm font-medium text-red-400">Failed to load stablecoin data</p>
          <p className="text-xs text-slate-500 mt-1">{infoError}</p>
        </div>
      </div>
    );
  }

  if (!info) return null;

  // Circulating = minted - burned. Seized tokens are already counted in both
  // totalBurned (burn from source) and totalMinted (mint to treasury), so the
  // net effect on circulating supply is zero. totalSeized is a separate stat.
  const rawNet = info.totalMinted.sub(info.totalBurned);
  const netMinted = rawNet.isNeg() ? new BN(0) : rawNet;

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Dashboard</h1>
          <div className="flex items-center gap-2 mt-1">
            <AddressDisplay address={mintAddress} showExplorer textSize="text-xs" />
            <span
              className={`badge ${info.paused ? "badge-yellow" : "badge-green"}`}
            >
              {info.paused ? "Paused" : "Active"}
            </span>
            <span className="badge badge-blue">{presetLabel(info.preset)}</span>
            {isAdmin && <span className="badge badge-gray">Admin</span>}
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Minted"
          value={formatTokenCompact(info.totalMinted, DECIMALS)}
          subValue={formatTokenAmount(info.totalMinted, DECIMALS) + " tokens"}
          accent="bg-indigo-600/20"
          icon={
            <svg className="w-4 h-4 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
          }
        />
        <StatCard
          label="Total Burned"
          value={formatTokenCompact(info.totalBurned, DECIMALS)}
          subValue={formatTokenAmount(info.totalBurned, DECIMALS) + " tokens"}
          accent="bg-red-600/20"
          icon={
            <svg className="w-4 h-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          }
        />
        <StatCard
          label="Total Seized"
          value={formatTokenCompact(info.totalSeized, DECIMALS)}
          subValue={formatTokenAmount(info.totalSeized, DECIMALS) + " tokens"}
          accent="bg-amber-600/20"
          icon={
            <svg className="w-4 h-4 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          }
        />
        <StatCard
          label="Circulating Supply"
          value={formatTokenCompact(netMinted, DECIMALS)}
          subValue="minted − burned"
          accent="bg-emerald-600/20"
          icon={
            <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          }
        />
      </div>

      {/* Config info */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card p-5 space-y-4">
          <h2 className="section-title">Configuration</h2>
          <dl className="space-y-3 text-sm">
            <div className="flex items-center justify-between gap-4">
              <dt className="text-slate-500">Admin</dt>
              <dd><AddressDisplay address={info.admin.toBase58()} showExplorer /></dd>
            </div>
            {info.pendingAdmin && info.pendingAdmin.toBase58() !== "11111111111111111111111111111111" && (
              <div className="flex items-center justify-between gap-4">
                <dt className="text-slate-500">Pending Admin</dt>
                <dd><AddressDisplay address={info.pendingAdmin.toBase58()} /></dd>
              </div>
            )}
            <div className="flex items-center justify-between gap-4">
              <dt className="text-slate-500">Mint</dt>
              <dd><AddressDisplay address={info.mint.toBase58()} showExplorer /></dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-slate-500">Preset</dt>
              <dd className="badge badge-blue">{presetLabel(info.preset)}</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-slate-500">Status</dt>
              <dd className={`badge ${info.paused ? "badge-yellow" : "badge-green"}`}>
                {info.paused ? "Paused" : "Active"}
              </dd>
            </div>
            {info.treasury && (
              <div className="flex items-center justify-between gap-4">
                <dt className="text-slate-500">Treasury</dt>
                <dd><AddressDisplay address={info.treasury.toBase58()} showExplorer /></dd>
              </div>
            )}
            {info.transferHookProgram && (
              <div className="flex items-center justify-between gap-4">
                <dt className="text-slate-500">Transfer Hook</dt>
                <dd><AddressDisplay address={info.transferHookProgram.toBase58()} /></dd>
              </div>
            )}
          </dl>
        </div>

        {/* Quick actions */}
        <div className="space-y-3">
          <h2 className="section-title">Quick Actions</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <QuickAction
              to="/operations"
              label="Mint Tokens"
              description="Issue new tokens to a wallet"
              color="bg-indigo-600/20"
              icon={<svg className="w-5 h-5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6m0 0v6m0-6h6m-6 0H6"/></svg>}
            />
            <QuickAction
              to="/operations"
              label="Burn Tokens"
              description="Remove tokens from circulation"
              color="bg-red-600/20"
              icon={<svg className="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7"/></svg>}
            />
            <QuickAction
              to="/compliance"
              label="Blacklist Wallet"
              description="Block a wallet from transfers"
              color="bg-amber-600/20"
              icon={<svg className="w-5 h-5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"/></svg>}
            />
            <QuickAction
              to="/roles"
              label="Manage Roles"
              description="Grant or revoke operator roles"
              color="bg-purple-600/20"
              icon={<svg className="w-5 h-5 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/></svg>}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
