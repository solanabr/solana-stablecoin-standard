import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { shortenAddress } from "../utils/pda";
import { useState } from "react";
import { NavLink } from "react-router-dom";
import { Menu, X, Wallet, Radio } from "lucide-react";

const mobileLinks = [
  { to: "/", label: "Dashboard" },
  { to: "/initialize", label: "Initialize" },
  { to: "/mint-burn", label: "Mint / Burn" },
  { to: "/transfer", label: "Transfer" },
  { to: "/blacklist", label: "Blacklist" },
  { to: "/allowlist", label: "Allowlist" },
  { to: "/freeze-thaw", label: "Freeze / Thaw" },
  { to: "/pause-unpause", label: "Pause" },
  { to: "/seize", label: "Seize" },
  { to: "/roles", label: "Roles" },
  { to: "/authority", label: "Authority" },
  { to: "/metadata", label: "Metadata" },
  { to: "/minter-quotas", label: "Quotas" },
  { to: "/holders", label: "Holders" },
  { to: "/audit-log", label: "Audit Log" },
];

export default function Header() {
  const { publicKey } = useWallet();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <>
      <header className="relative flex items-center justify-between px-4 md:px-6 py-3 bg-surface-1/80 border-b border-border/40 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <button
            className="md:hidden text-slate-400 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-surface-3"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          <div className="md:hidden flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center font-bold text-[10px] text-surface-0">
              S
            </div>
            <span className="text-sm font-bold text-white">SSS</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Network badge */}
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-400/8 border border-emerald-400/15">
            <Radio size={12} className="text-emerald-400 animate-pulse-slow" />
            <span className="text-[11px] font-semibold text-emerald-400 tracking-wide">DEVNET</span>
          </div>

          {/* Connected address */}
          {publicKey && (
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface-3 border border-border/50">
              <Wallet size={12} className="text-slate-500" />
              <span className="text-[11px] text-slate-400 font-mono font-medium">
                {shortenAddress(publicKey.toBase58(), 4)}
              </span>
            </div>
          )}

          {/* Wallet button */}
          <WalletMultiButton
            style={{
              background: "linear-gradient(135deg, #00FFA3 0%, #00D4AA 50%, #00B4D8 100%)",
              color: "#0A0B14",
              height: "36px",
              fontSize: "13px",
              fontWeight: 600,
              borderRadius: "12px",
              padding: "0 18px",
              fontFamily: "Inter, system-ui, sans-serif",
              border: "none",
              boxShadow: "0 0 15px rgba(0,255,163,0.15)",
            }}
          />
        </div>
      </header>

      {/* Mobile menu overlay */}
      {mobileMenuOpen && (
        <div className="absolute top-[52px] left-0 right-0 z-50 bg-surface-1/95 backdrop-blur-xl border-b border-border/40 md:hidden animate-fade-in">
          <nav className="p-3 max-h-[70vh] overflow-y-auto space-y-0.5">
            {mobileLinks.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                end={l.to === "/"}
                onClick={() => setMobileMenuOpen(false)}
                className={({ isActive }) =>
                  `block px-4 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-brand-400/10 text-brand-400"
                      : "text-slate-400 hover:text-white hover:bg-surface-3"
                  }`
                }
              >
                {l.label}
              </NavLink>
            ))}
          </nav>
        </div>
      )}
    </>
  );
}
