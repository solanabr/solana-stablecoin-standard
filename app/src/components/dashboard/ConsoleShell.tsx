"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Hexagon, Power } from "lucide-react";
import { useWallet } from "@solana/wallet-adapter-react";
import WalletProvider from "@/providers/WalletProvider";
import LoginScreen from "@/components/dashboard/LoginScreen";
import { PageIntro } from "@/components/dashboard/ConsolePrimitives";
import { shortAddress } from "@/components/dashboard/consoleUtils";
import { useDashboardCursor } from "@/hooks/useDashboardCursor";
// dashboard.css is loaded by the dashboard layout — do not re-import here
// to avoid leaking :root overrides into the landing page.

const CONSOLE_LINKS = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Allowlist", href: "/allowlist" },
  { label: "Authority", href: "/authority" },
  { label: "Metadata", href: "/metadata" },
  { label: "Transfer", href: "/transfer" },
  { label: "Audit", href: "/audit" },
];

type ConsoleShellProps = {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
  heroAside?: ReactNode;
};

function ConsoleShellBody({
  eyebrow,
  title,
  description,
  children,
  heroAside,
}: ConsoleShellProps) {
  const pathname = usePathname();
  const { connected, disconnect, publicKey } = useWallet();

  if (!connected) {
    return (
      <div className="dashboard-wrapper dashboard-cursor-scope">
        <LoginScreen />
      </div>
    );
  }

  return (
    <div className="dashboard-wrapper dashboard-cursor-scope min-h-screen bg-[#030303] text-white relative">
      <div className="bg-noise">
        <svg>
          <filter id="consoleNoise">
            <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch" />
          </filter>
          <rect width="100%" height="100%" filter="url(#consoleNoise)" />
        </svg>
      </div>

      <header className="relative z-20 flex items-center justify-between border-b border-[#1e1e1e] px-6 py-5 md:px-10">
        <div className="flex items-center gap-3">
          <Hexagon size={22} className="text-[#D4FF00]" strokeWidth={1.5} />
          <span className="text-base font-semibold tracking-tight text-white" style={{ fontFamily: "var(--font-space-grotesk)" }}>
            SSS<span className="text-[#555]">.CORE</span>
          </span>
        </div>

        <div className="flex items-center gap-5">
          <div className="hidden items-center gap-2 md:flex">
            <span className="h-2 w-2 rounded-full bg-[#D4FF00] pulse-live" />
            <span
              className="text-[11px] uppercase tracking-widest text-[#555]"
              style={{ fontFamily: "var(--font-jetbrains-mono)" }}
            >
              Devnet
            </span>
          </div>

          {publicKey ? (
            <span
              className="hidden text-[11px] text-[#555] md:block"
              style={{ fontFamily: "var(--font-jetbrains-mono)" }}
            >
              {shortAddress(publicKey)}
            </span>
          ) : null}

          <button
            onClick={() => disconnect()}
            className="hover-trigger flex items-center gap-2 rounded-full border border-[#2a2a2a] px-3 py-1.5 text-[#666] transition-colors hover:border-[#FF3366] hover:text-[#FF3366]"
          >
            <Power size={14} />
            <span
              className="hidden text-[11px] uppercase tracking-wider sm:inline"
              style={{ fontFamily: "var(--font-space-grotesk)" }}
            >
              Exit
            </span>
          </button>
        </div>
      </header>

      <nav className="relative z-20 overflow-x-auto border-b border-[#1e1e1e] hide-scrollbar">
        <div className="flex min-w-max gap-2 px-5 py-3 md:px-10">
          {CONSOLE_LINKS.map((link) => {
            const isActive =
              pathname === link.href || pathname?.startsWith(`${link.href}/`);

            return (
              <Link
                key={link.href}
                href={link.href}
                className={`hover-trigger rounded-full border px-3 py-1.5 text-[11px] uppercase tracking-[0.25em] transition-colors ${
                  isActive
                    ? "border-[#D4FF00] bg-[#D4FF00] text-[#030303]"
                    : "border-[#2a2a2a] text-[#666] hover:border-[#D4FF00] hover:text-[#D4FF00]"
                }`}
                style={{ fontFamily: "var(--font-jetbrains-mono)" }}
              >
                {link.label}
              </Link>
            );
          })}
        </div>
      </nav>

      <main className="relative z-10 px-5 py-8 pb-24 md:px-10 md:py-10">
        <div className={`grid gap-4 ${heroAside ? "xl:grid-cols-[minmax(0,1.45fr)_minmax(280px,360px)]" : ""}`}>
          <PageIntro eyebrow={eyebrow} title={title} description={description} />
          {heroAside ? heroAside : null}
        </div>
        <div className="mt-8 space-y-8">{children}</div>
      </main>

    </div>
  );
}

export default function ConsoleShell(props: ConsoleShellProps) {
  const cursorRef = useDashboardCursor();

  return (
    <div
      className="dashboard-wrapper dashboard-cursor-scope min-h-screen bg-[#030303]"
      style={{ fontFamily: "var(--font-space-grotesk), sans-serif" }}
    >
      <WalletProvider>
        <ConsoleShellBody {...props} />
      </WalletProvider>
      <div ref={cursorRef} className="award-cursor" />
    </div>
  );
}
