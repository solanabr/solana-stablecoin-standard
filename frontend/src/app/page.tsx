"use client";

import { useState } from "react";
import { Navbar } from "@/components/navbar";
import { MintSelector } from "@/components/mint-selector";

// TODO: Connect to RPC — replace with on-chain data
const PLACEHOLDER_CONFIG = {
  preset: "SSS-2 (Compliant)",
  authority: "7xKX...m9Fp",
  paused: false,
  supplyCap: 1_000_000_000,
  totalMinted: 245_800_000,
  totalBurned: 12_300_000,
  decimals: 6,
  name: "USD Stablecoin",
  symbol: "USDS",
};

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

export default function DashboardPage() {
  const [activeMint, setActiveMint] = useState<string | null>(
    "So11111111111111111111111111111111111111112",
  );

  const config = PLACEHOLDER_CONFIG;
  const circulatingSupply = config.totalMinted - config.totalBurned;
  const supplyRatio = config.supplyCap
    ? (config.totalMinted / config.supplyCap) * 100
    : 0;

  return (
    <div>
      <Navbar title="Dashboard" />
      <div className="p-6 space-y-6">
        <MintSelector onSelect={setActiveMint} currentMint={activeMint} />

        {activeMint && (
          <>
            {/* Token identity */}
            <div className="rounded-xl border border-border bg-card p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/10 text-accent">
                    <span className="text-lg font-bold">{config.symbol[0]}</span>
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
                  {config.preset}
                </span>
              </div>
            </div>

            {/* Stats grid */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                label="Circulating Supply"
                value={circulatingSupply.toLocaleString()}
                subtext={`${supplyRatio.toFixed(1)}% of supply cap`}
                variant="success"
              />
              <StatCard
                label="Total Minted"
                value={config.totalMinted.toLocaleString()}
                subtext="Lifetime issuance"
              />
              <StatCard
                label="Total Burned"
                value={config.totalBurned.toLocaleString()}
                subtext="Lifetime burns"
              />
              <StatCard
                label="Pause Status"
                value={config.paused ? "Paused" : "Active"}
                subtext={config.paused ? "All operations halted" : "Operations running normally"}
                variant={config.paused ? "destructive" : "success"}
              />
            </div>

            {/* Supply cap bar */}
            <div className="rounded-xl border border-border bg-card p-5">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-muted-foreground">
                  Supply Cap Utilization
                </p>
                <p className="text-sm font-medium text-foreground">
                  {config.totalMinted.toLocaleString()} /{" "}
                  {config.supplyCap?.toLocaleString() ?? "Unlimited"}
                </p>
              </div>
              <div className="h-2 w-full rounded-full bg-muted">
                <div
                  className="h-2 rounded-full bg-accent transition-all"
                  style={{ width: `${Math.min(supplyRatio, 100)}%` }}
                />
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
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
