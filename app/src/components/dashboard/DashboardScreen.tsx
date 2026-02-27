"use client";

import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { Hexagon, Power, Zap } from "lucide-react";
import { useSSS } from "@/hooks/useSSS";
import SupplyPillar from "./pillars/SupplyPillar";
import CompliancePillar from "./pillars/CompliancePillar";
import AccessPillar from "./pillars/AccessPillar";
import LedgerPillar from "./pillars/LedgerPillar";

const PILLARS = [
  { id: "supply", label: "Supply & Operations", short: "Supply", num: "01" },
  { id: "compliance", label: "Compliance Engine", short: "Compliance", num: "02" },
  { id: "access", label: "Access Control", short: "Access", num: "03" },
  { id: "ledger", label: "Audit Ledger", short: "Ledger", num: "04" },
] as const;

type PillarId = (typeof PILLARS)[number]["id"];

export default function DashboardScreen() {
  const [active, setActive] = useState<PillarId>("supply");
  const { disconnect, publicKey } = useWallet();
  const sss = useSSS();

  const activePillar = PILLARS.find((p) => p.id === active)!;

  return (
    <div className="min-h-screen bg-[#030303] text-white relative">
      {/* Noise overlay */}
      <div className="bg-noise">
        <svg>
          <filter id="dashNoise">
            <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch" />
          </filter>
          <rect width="100%" height="100%" filter="url(#dashNoise)" />
        </svg>
      </div>

      {/* ── Top bar ──────────────────────────────────────── */}
      <header className="relative z-20 flex items-center justify-between px-6 md:px-10 py-5 border-b border-[#1e1e1e]">
        <div className="flex items-center gap-3">
          <Hexagon size={22} className="text-[#D4FF00]" strokeWidth={1.5} />
          <span
            className="text-white text-base font-semibold tracking-tight"
            style={{ fontFamily: "var(--font-space-grotesk)" }}
          >
            SSS<span className="text-[#555]">.CORE</span>
          </span>
        </div>

        <div className="flex items-center gap-5">
          <div className="hidden md:flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#D4FF00] pulse-live" />
            <span
              className="text-[#555] text-[11px] uppercase tracking-widest"
              style={{ fontFamily: "var(--font-jetbrains-mono)" }}
            >
              Devnet
            </span>
          </div>

          {publicKey && (
            <span
              className="hidden md:block text-[#555] text-[11px]"
              style={{ fontFamily: "var(--font-jetbrains-mono)" }}
            >
              {publicKey.toBase58().slice(0, 4)}...{publicKey.toBase58().slice(-4)}
            </span>
          )}

          <button
            onClick={() => disconnect()}
            className="hover-trigger flex items-center gap-2 px-3 py-1.5 rounded-full border border-[#2a2a2a] text-[#666] hover:text-[#FF3366] hover:border-[#FF3366] transition-colors"
          >
            <Power size={14} />
            <span
              className="text-[11px] uppercase tracking-wider hidden sm:inline"
              style={{ fontFamily: "var(--font-space-grotesk)" }}
            >
              Exit
            </span>
          </button>
        </div>
      </header>

      {/* ── Mobile tab bar ────────────────────────────────── */}
      <nav className="md:hidden relative z-20 flex border-b border-[#1e1e1e] overflow-x-auto hide-scrollbar">
        {PILLARS.map((p) => (
          <button
            key={p.id}
            onClick={() => setActive(p.id)}
            className={`mobile-tab flex-1 min-w-0 px-4 py-3 text-center text-[11px] uppercase tracking-wider whitespace-nowrap border-b-2 ${
              active === p.id
                ? "active text-[#D4FF00] border-[#D4FF00]"
                : "text-[#555] border-transparent"
            }`}
            style={{ fontFamily: "var(--font-jetbrains-mono)" }}
          >
            {p.short}
          </button>
        ))}
      </nav>

      {/* ── Desktop: pillar accordion ─────────────────────── */}
      <div className="hidden md:flex relative z-10" style={{ height: "calc(100vh - 65px)" }}>
        {PILLARS.map((pillar) => {
          const isActive = active === pillar.id;
          return (
            <div
              key={pillar.id}
              className={`pillar-panel relative overflow-hidden ${
                isActive
                  ? "flex-[12]"
                  : "flex-[1] inactive-pillar"
              } ${pillar.id !== "ledger" ? "border-r border-[#1e1e1e]" : ""}`}
              onClick={() => { if (!isActive) setActive(pillar.id); }}
              style={{ minWidth: isActive ? 0 : 72 }}
            >
              {/* Inactive state */}
              {!isActive && (
                <div className="hover-trigger h-full flex flex-col items-center justify-between py-8 px-2 select-none">
                  <span
                    className="text-[#D4FF00] text-[11px] tracking-widest font-medium"
                    style={{ fontFamily: "var(--font-jetbrains-mono)" }}
                  >
                    {pillar.num}
                  </span>
                  <span
                    className="vertical-text text-[#444] text-[13px] uppercase tracking-[0.25em] font-medium whitespace-nowrap"
                    style={{ fontFamily: "var(--font-space-grotesk)" }}
                  >
                    {pillar.label}
                  </span>
                  <div className="w-1.5 h-1.5 rounded-full bg-[#333]" />
                </div>
              )}

              {/* Active state */}
              {isActive && (
                <div className="pillar-content h-full overflow-y-auto hide-scrollbar">
                  {/* Pillar header */}
                  <div className="px-10 pt-10 pb-8 border-b border-[#1e1e1e]">
                    <div className="flex items-center gap-3 mb-3">
                      <Zap size={14} className="text-[#D4FF00]" />
                      <span
                        className="text-[#D4FF00] text-[11px] uppercase tracking-[0.3em]"
                        style={{ fontFamily: "var(--font-jetbrains-mono)" }}
                      >
                        Module {pillar.num}
                      </span>
                    </div>
                    <h2
                      className="text-white text-3xl lg:text-5xl font-bold uppercase tracking-tight leading-none"
                      style={{ fontFamily: "var(--font-space-grotesk)" }}
                    >
                      {pillar.label}
                    </h2>
                    {sss.config && (
                      <div
                        className="mt-4 text-[#555] text-[11px] uppercase tracking-widest"
                        style={{ fontFamily: "var(--font-jetbrains-mono)" }}
                      >
                        {sss.config.symbol} &middot; {sss.config.name}
                      </div>
                    )}
                  </div>

                  {/* Pillar body */}
                  <div className="px-10 py-8">
                    {pillar.id === "supply" && <SupplyPillar sss={sss} />}
                    {pillar.id === "compliance" && <CompliancePillar sss={sss} />}
                    {pillar.id === "access" && <AccessPillar sss={sss} />}
                    {pillar.id === "ledger" && <LedgerPillar sss={sss} />}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Mobile: active pillar content ─────────────────── */}
      <div className="md:hidden relative z-10">
        <div className="px-5 pt-6 pb-4">
          <div className="flex items-center gap-2 mb-2">
            <Zap size={12} className="text-[#D4FF00]" />
            <span
              className="text-[#D4FF00] text-[10px] uppercase tracking-[0.3em]"
              style={{ fontFamily: "var(--font-jetbrains-mono)" }}
            >
              Module {activePillar.num}
            </span>
          </div>
          <h2
            className="text-white text-2xl font-bold uppercase tracking-tight"
            style={{ fontFamily: "var(--font-space-grotesk)" }}
          >
            {activePillar.label}
          </h2>
        </div>
        <div className="px-5 pb-24">
          {active === "supply" && <SupplyPillar sss={sss} />}
          {active === "compliance" && <CompliancePillar sss={sss} />}
          {active === "access" && <AccessPillar sss={sss} />}
          {active === "ledger" && <LedgerPillar sss={sss} />}
        </div>
      </div>

      {/* Loading state */}
      {sss.loading && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-2.5 rounded-full bg-[#111] border border-[#2a2a2a]">
          <span
            className="text-[#D4FF00] text-[11px] uppercase tracking-widest animate-pulse"
            style={{ fontFamily: "var(--font-jetbrains-mono)" }}
          >
            Syncing...
          </span>
        </div>
      )}

      {sss.error && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-2.5 rounded-full bg-[#1a0a10] border border-[#FF3366]/20">
          <span
            className="text-[#FF3366] text-[11px]"
            style={{ fontFamily: "var(--font-jetbrains-mono)" }}
          >
            {sss.error}
          </span>
        </div>
      )}
    </div>
  );
}
