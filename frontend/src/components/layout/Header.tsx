import React, { useState } from "react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { useStablecoinContext } from "../../contexts/StablecoinContext";
import { useWalletConnection } from "../../hooks/useWalletConnection";
import { LoadingSpinner } from "../shared/LoadingSpinner";

// ── Network indicator ────────────────────────────────────────────────────────

function NetworkBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full
                     bg-emerald-900/40 border border-emerald-700/40 text-xs font-medium text-emerald-400">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse-slow" />
      Devnet
    </span>
  );
}

// ── Mint selector ─────────────────────────────────────────────────────────────

function MintSelector() {
  const { mintAddress, setMintAddress, infoLoading, infoError, info } =
    useStablecoinContext();
  const [draft, setDraft] = useState(mintAddress);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setMintAddress(draft.trim());
  };

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2">
      <div className="relative">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Paste mint address…"
          className="input w-72 pr-8 text-xs font-mono"
          spellCheck={false}
          autoCorrect="off"
          autoCapitalize="off"
        />
        {infoLoading && (
          <span className="absolute right-2.5 top-1/2 -translate-y-1/2">
            <LoadingSpinner size={14} />
          </span>
        )}
        {!infoLoading && info && !infoError && (
          <span className="absolute right-2.5 top-1/2 -translate-y-1/2">
            <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </span>
        )}
        {!infoLoading && infoError && (
          <span className="absolute right-2.5 top-1/2 -translate-y-1/2">
            <svg className="w-3.5 h-3.5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </span>
        )}
      </div>
      <button type="submit" className="btn-secondary text-xs px-3 py-1.5">
        Load
      </button>
    </form>
  );
}

// ── SOL balance chip ─────────────────────────────────────────────────────────

function SolBalanceChip() {
  const { connected, solBalance, balanceLoading, displayAddress } =
    useWalletConnection();

  if (!connected) return null;

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg
                    bg-surface border border-surface-border text-xs text-slate-400">
      <span className="font-mono text-slate-300">{displayAddress}</span>
      <span className="text-surface-border">|</span>
      {balanceLoading ? (
        <LoadingSpinner size={12} />
      ) : (
        <span className="font-medium text-slate-200">
          {solBalance !== null ? `${solBalance.toFixed(3)} SOL` : "—"}
        </span>
      )}
    </div>
  );
}

// ── Header ───────────────────────────────────────────────────────────────────

interface HeaderProps {
  onMenuToggle: () => void;
}

export function Header({ onMenuToggle }: HeaderProps) {
  return (
    <header className="h-16 flex items-center justify-between gap-4 px-6
                       bg-surface-card border-b border-surface-border
                       sticky top-0 z-30">
      {/* Left: hamburger (mobile) + logo */}
      <div className="flex items-center gap-3">
        {/* Mobile hamburger */}
        <button
          onClick={onMenuToggle}
          className="lg:hidden btn-ghost p-1.5"
          aria-label="Toggle navigation"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        {/* Logo */}
        <div className="flex items-center gap-2 select-none">
          <div className="w-7 h-7 rounded-lg bg-gradient-brand flex items-center justify-center shadow-glow">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <span className="font-semibold text-white text-sm hidden sm:inline">
            SSS<span className="text-gradient"> Admin</span>
          </span>
        </div>
      </div>

      {/* Center: mint selector */}
      <div className="hidden md:flex flex-1 justify-center">
        <MintSelector />
      </div>

      {/* Right: network badge + balance + wallet button */}
      <div className="flex items-center gap-2 sm:gap-3">
        <NetworkBadge />
        <SolBalanceChip />
        <WalletMultiButton />
      </div>
    </header>
  );
}
