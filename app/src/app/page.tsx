"use client";

import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import {
  Shield,
  Activity,
  Coins,
  LockKeyhole,
  ArrowRightLeft,
} from "lucide-react";

export default function Home() {
  const { connection } = useConnection();
  const { publicKey, connected } = useWallet();

  return (
    <div className="min-h-screen p-8 sm:p-20 font-[family-name:var(--font-geist-sans)]">
      <header className="flex flex-col sm:flex-row justify-between items-center mb-16 gap-6">
        <div className="flex items-center gap-3">
          <div className="bg-indigo-500/20 p-3 rounded-xl border border-indigo-500/30">
            <Shield className="w-8 h-8 text-indigo-400" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-indigo-400 to-cyan-400 bg-clip-text text-transparent">
              SSS Admin Terminal
            </h1>
            <p className="text-sm text-slate-400">
              Solana Stablecoin Standard • Target: Devnet
            </p>
          </div>
        </div>
        <WalletMultiButton className="!bg-indigo-600 hover:!bg-indigo-500 !transition-colors !rounded-lg" />
      </header>

      <main className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Connection Status Card */}
        <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 backdrop-blur-sm shadow-xl">
          <div className="flex items-center gap-3 mb-6">
            <Activity className="w-5 h-5 text-emerald-400" />
            <h2 className="text-lg font-semibold">Network Target</h2>
          </div>
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-slate-400">Provider</span>
              <span className="font-mono text-sm bg-slate-800 px-2 py-1 rounded">
                @solana/web3.js
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-400">Endpoint</span>
              <span
                className="text-sm truncate max-w-[150px]"
                title={connection.rpcEndpoint}
              >
                {connection.rpcEndpoint}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-400">Wallet</span>
              <span
                className={`text-sm ${
                  connected ? "text-emerald-400" : "text-amber-400"
                }`}
              >
                {connected ? "Connected" : "Disconnected"}
              </span>
            </div>
          </div>
        </div>

        {/* Stablecoin Overview */}
        <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 backdrop-blur-sm shadow-xl">
          <div className="flex items-center gap-3 mb-6">
            <Coins className="w-5 h-5 text-cyan-400" />
            <h2 className="text-lg font-semibold">Active Token</h2>
          </div>
          <div className="flex flex-col items-center justify-center py-6 text-center h-[140px]">
            {connected ? (
              <div className="space-y-2">
                <p className="text-slate-400">No token loaded</p>
                <button className="text-sm text-cyan-400 hover:text-cyan-300 underline underline-offset-4">
                  Initialize SSS Token
                </button>
              </div>
            ) : (
              <p className="text-slate-500">Connect wallet to view tokens</p>
            )}
          </div>
        </div>

        {/* Permissions & Compliance */}
        <div className="bg-indigo-950/20 border border-indigo-900/50 rounded-2xl p-6 backdrop-blur-sm shadow-xl relative overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />
          <div className="flex items-center gap-3 mb-6 relative z-10">
            <LockKeyhole className="w-5 h-5 text-purple-400" />
            <h2 className="text-lg font-semibold">Compliance Hook</h2>
          </div>
          <div className="space-y-3 relative z-10">
            <button className="w-full flex items-center justify-between p-3 rounded-lg bg-slate-800/50 hover:bg-slate-800 border border-slate-700/50 transition-colors">
              <span className="text-sm font-medium">Manage Blacklist</span>
              <ArrowRightLeft className="w-4 h-4 text-slate-400" />
            </button>
            <button className="w-full flex items-center justify-between p-3 rounded-lg bg-slate-800/50 hover:bg-slate-800 border border-slate-700/50 transition-colors">
              <span className="text-sm font-medium">RBAC Roles</span>
              <ArrowRightLeft className="w-4 h-4 text-slate-400" />
            </button>
          </div>
        </div>
      </main>

      <footer className="mt-20 text-center text-slate-500 text-sm">
        Built with Anchor • Token-2022 • Next.js 15
        <br />
        <span className="text-xs text-slate-600 mt-2 block">
          (Note: This is a UI Mockup. Full functionality is available via CLI &
          Admin TUI)
        </span>
      </footer>
    </div>
  );
}
