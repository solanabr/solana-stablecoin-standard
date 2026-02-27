"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { Hexagon, Fingerprint, ArrowUpRight } from "lucide-react";

export default function LoginScreen() {
  const { select, wallets } = useWallet();

  const connectWallet = (name: string) => {
    const adapter = wallets.find(
      (w) => w.adapter.name.toLowerCase() === name.toLowerCase()
    );
    if (adapter) {
      select(adapter.adapter.name);
    }
  };

  return (
    <div className="min-h-screen bg-[#030303] flex flex-col relative overflow-hidden">
      {/* Noise overlay */}
      <div className="bg-noise">
        <svg>
          <filter id="loginNoise">
            <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch" />
          </filter>
          <rect width="100%" height="100%" filter="url(#loginNoise)" />
        </svg>
      </div>

      {/* Header */}
      <header className="flex items-center justify-between px-8 md:px-12 py-8 relative z-10">
        <div className="flex items-center gap-3">
          <Hexagon size={24} className="text-[#D4FF00]" strokeWidth={1.5} />
          <span
            className="text-white text-lg font-semibold tracking-tight"
            style={{ fontFamily: "var(--font-space-grotesk)" }}
          >
            SSS<span className="text-[#555]">.CORE</span>
          </span>
        </div>
        <span
          className="text-[#555] text-[11px] tracking-widest uppercase"
          style={{ fontFamily: "var(--font-jetbrains-mono)" }}
        >
          System v2.1.0
        </span>
      </header>

      {/* Center */}
      <main className="flex-1 flex flex-col items-center justify-center px-8 relative z-10">
        {/* Glow */}
        <div className="absolute w-[50vw] h-[50vw] max-w-[500px] max-h-[500px] bg-[#D4FF00] rounded-full blur-[180px] opacity-[0.04]" />

        <Fingerprint
          size={100}
          className="text-white opacity-10 mb-12 relative z-10"
          strokeWidth={0.5}
        />

        <h1
          className="text-white font-bold uppercase tracking-tighter leading-[0.85] text-center mb-6 relative z-10"
          style={{
            fontFamily: "var(--font-space-grotesk)",
            fontSize: "clamp(2.5rem, 7vw, 7rem)",
          }}
        >
          Authorize
          <br />
          <span className="text-[#D4FF00]">Connection</span>
        </h1>

        <p
          className="text-[#666] max-w-lg text-center text-[13px] leading-relaxed mb-16 relative z-10"
          style={{ fontFamily: "var(--font-jetbrains-mono)" }}
        >
          Authenticate with your Solana wallet to access the stablecoin
          management console. Select a provider below.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 relative z-10">
          <button
            onClick={() => connectWallet("phantom")}
            className="hover-trigger group relative inline-flex items-center gap-4 px-10 py-4 bg-[#D4FF00] text-[#030303] rounded-full overflow-hidden transition-all hover:shadow-[0_0_40px_rgba(212,255,0,0.15)]"
            style={{ fontFamily: "var(--font-space-grotesk)" }}
          >
            <span className="font-bold text-sm uppercase tracking-widest">Phantom</span>
            <ArrowUpRight size={16} className="group-hover:rotate-45 transition-transform" />
          </button>
          <button
            onClick={() => connectWallet("solflare")}
            className="hover-trigger group relative inline-flex items-center gap-4 px-10 py-4 border border-[#333] text-[#999] rounded-full transition-all hover:border-[#D4FF00] hover:text-[#D4FF00]"
            style={{ fontFamily: "var(--font-space-grotesk)" }}
          >
            <span className="font-bold text-sm uppercase tracking-widest">Solflare</span>
            <ArrowUpRight size={16} className="group-hover:rotate-45 transition-transform" />
          </button>
        </div>
      </main>

      {/* Footer */}
      <footer className="flex items-center justify-between px-8 md:px-12 py-8 relative z-10">
        <span
          className="text-[#555] text-[11px] tracking-widest uppercase"
          style={{ fontFamily: "var(--font-jetbrains-mono)" }}
        >
          Solana Devnet
        </span>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-[#00FF88] pulse-live" />
          <span
            className="text-[#555] text-[11px] tracking-widest uppercase"
            style={{ fontFamily: "var(--font-jetbrains-mono)" }}
          >
            Network Live
          </span>
        </div>
      </footer>
    </div>
  );
}
