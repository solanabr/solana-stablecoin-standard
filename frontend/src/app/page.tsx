"use client";

import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { Navbar } from "@/components/navbar";
import { MintSelector } from "@/components/mint-selector";
import { useStablecoinConfig } from "@/hooks/use-stablecoin-config";

function StatCard({
  label,
  value,
  subtext,
  variant = "default",
}: {
  label: string;
  value: string;
  subtext?: string;
  variant?: "default" | "success" | "warning" | "destructive";
}) {
  const variantStyles = {
    default: "border-border",
    success: "border-success/30",
    warning: "border-warning/30",
    destructive: "border-destructive/30",
  };

  const dotStyles = {
    default: "bg-accent",
    success: "bg-success",
    warning: "bg-warning",
    destructive: "bg-destructive",
  };

  return (
    <div
      className={`rounded-xl border bg-card p-5 ${variantStyles[variant]}`}
    >
      <div className="flex items-center gap-2 mb-1">
        <div className={`h-2 w-2 rounded-full ${dotStyles[variant]}`} />
        <p className="text-sm text-muted-foreground">{label}</p>
      </div>
      <p className="text-2xl font-semibold text-card-foreground">{value}</p>
      {subtext && (
        <p className="mt-1 text-xs text-muted-foreground">{subtext}</p>
      )}
    </div>
  );
}

function QuickAction({
  label,
  description,
  href,
}: {
  label: string;
  description: string;
  href: string;
}) {
  return (
    <a
      href={href}
      className="group flex items-center justify-between rounded-xl border border-border bg-card p-4 transition-colors hover:border-accent/40 hover:bg-card/80"
    >
      <div>
        <p className="text-sm font-medium text-foreground group-hover:text-accent transition-colors">
          {label}
        </p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <svg
        className="w-4 h-4 text-muted-foreground group-hover:text-accent transition-colors"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={2}
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M8.25 4.5l7.5 7.5-7.5 7.5"
        />
      </svg>
    </a>
  );
}

function formatSupply(raw: number, decimals: number): string {
  const human = raw / Math.pow(10, decimals);
  return human.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

export default function DashboardPage() {
  const { connected } = useWallet();
  const [activeMint, setActiveMint] = useState<string | null>(null);
  const { config, loading, error } = useStablecoinConfig(activeMint);

  return (
    <div>
      <Navbar title="Dashboard" />
      <div className="p-6 space-y-6">
        <MintSelector onSelect={setActiveMint} currentMint={activeMint} />

        {!connected && (
          <div className="rounded-xl border border-warning/20 bg-warning/5 p-5 text-center">
            <p className="text-sm text-warning">
              Connect your wallet to fetch on-chain stablecoin data.
            </p>
          </div>
        )}

        {loading && (
          <div className="rounded-xl border border-border bg-card p-8 text-center">
            <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
              <svg
                className="h-4 w-4 animate-spin"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
              Fetching on-chain data...
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-5">
            <p className="text-sm text-destructive">{error}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Make sure the mint address belongs to an SSS stablecoin.
            </p>
          </div>
        )}

        {config && !loading && (
          <>
            {/* Token identity */}
            <div className="rounded-xl border border-border bg-card p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/10 text-accent">
                    <span className="text-lg font-bold">
                      {config.symbol[0]}
                    </span>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-foreground">
                      {config.name}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {config.symbol} &middot; {config.decimals} decimals
                    </p>
                  </div>
                </div>
                <span className="rounded-full bg-accent/10 px-3 py-1 text-xs font-medium text-accent">
                  {config.presetName}
                </span>
              </div>
            </div>

            {/* Stats grid */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                label="Current Supply"
                value={formatSupply(config.currentSupply, config.decimals)}
                subtext={
                  config.supplyCap
                    ? `${((config.totalMinted / config.supplyCap) * 100).toFixed(1)}% of supply cap`
                    : "No supply cap"
                }
                variant="success"
              />
              <StatCard
                label="Total Minted"
                value={formatSupply(config.totalMinted, config.decimals)}
                subtext="Lifetime issuance"
              />
              <StatCard
                label="Total Burned"
                value={formatSupply(config.totalBurned, config.decimals)}
                subtext="Lifetime burns"
              />
              <StatCard
                label="Pause Status"
                value={config.paused ? "Paused" : "Active"}
                subtext={
                  config.paused
                    ? "All operations halted"
                    : "Operations running normally"
                }
                variant={config.paused ? "destructive" : "success"}
              />
            </div>

            {/* Supply cap bar */}
            {config.supplyCap && (
              <div className="rounded-xl border border-border bg-card p-5">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium text-muted-foreground">
                    Supply Cap Utilization
                  </p>
                  <p className="text-sm font-medium text-foreground">
                    {formatSupply(config.totalMinted, config.decimals)} /{" "}
                    {formatSupply(config.supplyCap, config.decimals)}
                  </p>
                </div>
                <div className="h-2 w-full rounded-full bg-muted">
                  <div
                    className="h-2 rounded-full bg-accent transition-all"
                    style={{
                      width: `${Math.min((config.totalMinted / config.supplyCap) * 100, 100)}%`,
                    }}
                  />
                </div>
              </div>
            )}

            {/* Authority info */}
            <div className="rounded-xl border border-border bg-card p-5">
              <h3 className="text-sm font-medium text-muted-foreground mb-2">
                Configuration
              </h3>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Authority</span>
                  <code className="text-xs text-foreground font-mono">
                    {config.authority}
                  </code>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Preset</span>
                  <span className="text-sm text-foreground">
                    {config.presetName}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Mint Address</span>
                  <code className="text-xs text-foreground font-mono">
                    {activeMint}
                  </code>
                </div>
              </div>
            </div>

            {/* Quick actions */}
            <div>
              <h3 className="mb-3 text-sm font-medium text-muted-foreground">
                Quick Actions
              </h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <QuickAction
                  label="Mint Tokens"
                  description="Issue new tokens to an address"
                  href="/operations"
                />
                <QuickAction
                  label="Manage Roles"
                  description="Grant or revoke operator roles"
                  href="/roles"
                />
                <QuickAction
                  label="Blacklist Management"
                  description="Add or remove addresses from blacklist"
                  href="/blacklist"
                />
                <QuickAction
                  label="Freeze / Thaw"
                  description="Freeze or unfreeze token accounts"
                  href="/operations"
                />
                {config.preset === 3 && (
                  <QuickAction
                    label="Confidential Transfers"
                    description="Manage private transfer operations"
                    href="/confidential"
                  />
                )}
                <QuickAction
                  label="Transaction History"
                  description="View audit trail of all operations"
                  href="/history"
                />
              </div>
            </div>
          </>
        )}

        {!activeMint && connected && (
          <div className="rounded-xl border border-border bg-card p-8 text-center">
            <p className="text-sm text-muted-foreground">
              Enter a mint address above to view stablecoin dashboard.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
