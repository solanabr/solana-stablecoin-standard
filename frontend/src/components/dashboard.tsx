"use client";

import { useState, useCallback } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import {
  LayoutDashboard,
  Users,
  ArrowLeftRight,
  Shield,
  ShieldAlert,
  Search,
  Loader2,
  Coins,
} from "lucide-react";
import { useStablecoinConfig, useTokenMetadata } from "@/hooks/use-stablecoin";
import { Badge } from "@/components/ui/badge";
import { ToastProvider } from "@/components/ui/toast";
import { OverviewTab } from "@/components/tabs/overview";
import { MintersTab } from "@/components/tabs/minters";
import { OperationsTab } from "@/components/tabs/operations";
import { RolesTab } from "@/components/tabs/roles";
import { ComplianceTab } from "@/components/tabs/compliance";
import { isValidPublicKey } from "@/lib/utils";

type TabId = "overview" | "minters" | "operations" | "roles" | "compliance";

interface TabDef {
  id: TabId;
  label: string;
  icon: React.ReactNode;
  sss2Only?: boolean;
}

const tabs: TabDef[] = [
  { id: "overview", label: "Overview", icon: <LayoutDashboard className="w-4 h-4" /> },
  { id: "minters", label: "Minters", icon: <Users className="w-4 h-4" /> },
  { id: "operations", label: "Operations", icon: <ArrowLeftRight className="w-4 h-4" /> },
  { id: "roles", label: "Roles", icon: <Shield className="w-4 h-4" /> },
  { id: "compliance", label: "Compliance", icon: <ShieldAlert className="w-4 h-4" />, sss2Only: true },
];

export function Dashboard() {
  const { publicKey } = useWallet();
  const [mintAddress, setMintAddress] = useState<string>("");
  const [activeMint, setActiveMint] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("overview");

  const { data: config, isLoading, error } = useStablecoinConfig(activeMint);
  const { data: tokenMeta } = useTokenMetadata(activeMint);

  const handleLoadMint = useCallback(() => {
    if (isValidPublicKey(mintAddress)) {
      setActiveMint(mintAddress);
      setActiveTab("overview");
    }
  }, [mintAddress]);

  const visibleTabs = tabs.filter(
    (t) => !t.sss2Only || config?.preset === 2
  );

  return (
    <ToastProvider>
      <div className="min-h-screen flex flex-col">
        {/* Top bar */}
        <header className="shrink-0 border-b border-[var(--border)] bg-[var(--bg-secondary)]">
          <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-[var(--accent-muted)]">
                <Coins className="w-4.5 h-4.5 text-[var(--accent)]" />
              </div>
              <div>
                <span className="text-sm font-semibold text-[var(--text-primary)]">
                  SSS Dashboard
                </span>
                {tokenMeta && activeMint && (
                  <span className="ml-2 text-xs text-[var(--text-muted)]">
                    {tokenMeta.symbol}
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3">
              {publicKey && (
                <span className="hidden sm:block text-xs font-[family-name:var(--font-jetbrains)] text-[var(--text-muted)]">
                  {publicKey.toBase58().slice(0, 4)}...
                  {publicKey.toBase58().slice(-4)}
                </span>
              )}
              <WalletMultiButton
                style={{
                  height: "36px",
                  borderRadius: "10px",
                  fontSize: "13px",
                  backgroundColor: "var(--bg-card)",
                  border: "1px solid var(--border)",
                  padding: "0 14px",
                }}
              />
            </div>
          </div>
        </header>

        {/* Main content */}
        <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-6">
          {/* Mint address input */}
          <div className="mb-6">
            <label className="block text-xs text-[var(--text-secondary)] mb-2 uppercase tracking-wider font-medium">
              Stablecoin Mint Address
            </label>
            <div className="flex gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
                <input
                  type="text"
                  value={mintAddress}
                  onChange={(e) => setMintAddress(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleLoadMint();
                  }}
                  placeholder="Enter Token-2022 mint address..."
                  className="w-full h-11 pl-10 pr-4 rounded-xl bg-[var(--bg-card)] border border-[var(--border)] text-sm font-[family-name:var(--font-jetbrains)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] transition-colors"
                />
              </div>
              <button
                onClick={handleLoadMint}
                disabled={!isValidPublicKey(mintAddress)}
                className="h-11 px-5 rounded-xl bg-[var(--accent)] text-white text-sm font-medium hover:bg-[var(--accent-hover)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Load
              </button>
            </div>
          </div>

          {/* Loading / Error / Empty states */}
          {!activeMint && (
            <EmptyState message="Enter a stablecoin mint address to load the dashboard." />
          )}

          {activeMint && isLoading && (
            <div className="flex items-center justify-center py-24">
              <Loader2 className="w-6 h-6 text-[var(--accent)] animate-spin" />
              <span className="ml-3 text-sm text-[var(--text-secondary)]">
                Loading configuration...
              </span>
            </div>
          )}

          {activeMint && error && (
            <div className="rounded-xl bg-[var(--danger-muted)] border border-[rgba(239,68,68,0.3)] p-5 text-center">
              <p className="text-sm text-[var(--danger)]">
                Failed to load config. Make sure this is a valid SSS mint on
                devnet.
              </p>
              <p className="text-xs text-[var(--text-muted)] mt-1">
                {error instanceof Error ? error.message : "Unknown error"}
              </p>
            </div>
          )}

          {activeMint && config && !isLoading && (
            <>
              {/* Preset + Status header */}
              <div className="flex items-center gap-3 mb-6">
                <Badge variant={config.preset === 2 ? "info" : "neutral"}>
                  {config.preset === 1 ? "SSS-1 Minimal" : "SSS-2 Compliant"}
                </Badge>
                {tokenMeta && (
                  <Badge variant="neutral">
                    {tokenMeta.name} ({tokenMeta.symbol})
                  </Badge>
                )}
                <Badge variant={config.paused ? "danger" : "success"}>
                  {config.paused ? "Paused" : "Active"}
                </Badge>
              </div>

              {/* Tab navigation */}
              <div className="flex gap-1 mb-6 border-b border-[var(--border)] -mx-1 px-1">
                {visibleTabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors border-b-2 -mb-px ${
                      activeTab === tab.id
                        ? "text-[var(--accent)] border-[var(--accent)] bg-[var(--accent-muted)]"
                        : "text-[var(--text-secondary)] border-transparent hover:text-[var(--text-primary)] hover:bg-[var(--bg-card)]"
                    }`}
                  >
                    {tab.icon}
                    <span className="hidden sm:inline">{tab.label}</span>
                  </button>
                ))}
              </div>

              {/* Tab content */}
              <div>
                {activeTab === "overview" && (
                  <OverviewTab
                    config={config}
                    tokenMeta={tokenMeta}
                    mintAddress={activeMint}
                  />
                )}
                {activeTab === "minters" && (
                  <MintersTab
                    config={config}
                    mintAddress={activeMint}
                    decimals={tokenMeta?.decimals ?? 6}
                  />
                )}
                {activeTab === "operations" && (
                  <OperationsTab
                    config={config}
                    mintAddress={activeMint}
                    decimals={tokenMeta?.decimals ?? 6}
                    symbol={tokenMeta?.symbol ?? "tokens"}
                  />
                )}
                {activeTab === "roles" && (
                  <RolesTab config={config} mintAddress={activeMint} />
                )}
                {activeTab === "compliance" && config.preset === 2 && (
                  <ComplianceTab config={config} mintAddress={activeMint} />
                )}
              </div>
            </>
          )}
        </main>

        {/* Footer */}
        <footer className="shrink-0 border-t border-[var(--border)] py-4">
          <div className="max-w-7xl mx-auto px-6 flex items-center justify-between">
            <p className="text-xs text-[var(--text-muted)]">
              Solana Stablecoin Standard
            </p>
            <p className="text-xs text-[var(--text-muted)]">Devnet</p>
          </div>
        </footer>
      </div>
    </ToastProvider>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="w-14 h-14 rounded-2xl bg-[var(--bg-card)] border border-[var(--border)] flex items-center justify-center mb-4">
        <Coins className="w-6 h-6 text-[var(--text-muted)]" />
      </div>
      <p className="text-sm text-[var(--text-secondary)] max-w-sm">{message}</p>
    </div>
  );
}
