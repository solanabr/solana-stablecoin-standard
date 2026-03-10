"use client";

import {
  TrendingUp,
  Flame,
  Gavel,
  Activity,
  AlertTriangle,
  Key,
} from "lucide-react";
import BN from "bn.js";
import type { StablecoinConfig, TokenMetadata } from "@/hooks/use-stablecoin";
import { StatCard } from "@/components/ui/stat-card";
import { Address } from "@/components/ui/address";
import { Badge } from "@/components/ui/badge";
import { formatAmount } from "@/lib/utils";

interface OverviewTabProps {
  config: StablecoinConfig;
  tokenMeta: TokenMetadata | null | undefined;
  mintAddress: string;
}

export function OverviewTab({ config, tokenMeta, mintAddress }: OverviewTabProps) {
  const decimals = tokenMeta?.decimals ?? 6;
  const netSupply = config.totalMinted.sub(config.totalBurned).sub(config.totalSeized);
  const netDisplay = netSupply.lt(new BN(0)) ? new BN(0) : netSupply;

  return (
    <div className="space-y-6">
      {/* Pause banner */}
      {config.paused && (
        <div className="flex items-center gap-3 px-5 py-4 rounded-xl bg-[var(--danger-muted)] border border-[rgba(239,68,68,0.3)]">
          <AlertTriangle className="w-5 h-5 text-[var(--danger)] shrink-0" />
          <div>
            <p className="text-sm font-medium text-[var(--danger)]">
              All operations are paused
            </p>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              Minting, burning, and transfers are currently disabled by the pauser.
            </p>
          </div>
        </div>
      )}

      {/* Stats grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Minted"
          value={formatAmount(config.totalMinted, decimals)}
          icon={<TrendingUp className="w-4 h-4" />}
          color="success"
        />
        <StatCard
          label="Total Burned"
          value={formatAmount(config.totalBurned, decimals)}
          icon={<Flame className="w-4 h-4" />}
          color="danger"
        />
        <StatCard
          label="Total Seized"
          value={formatAmount(config.totalSeized, decimals)}
          icon={<Gavel className="w-4 h-4" />}
          color="warning"
        />
        <StatCard
          label="Net Supply"
          value={formatAmount(netDisplay, decimals)}
          icon={<Activity className="w-4 h-4" />}
          color="accent"
        />
      </div>

      {/* Configuration details */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Mint info */}
        <div className="rounded-xl bg-[var(--bg-card)] border border-[var(--border)] p-5">
          <h3 className="text-sm font-medium text-[var(--text-secondary)] mb-4 flex items-center gap-2">
            <Key className="w-4 h-4" />
            Mint Details
          </h3>
          <div className="space-y-3">
            <DetailRow label="Mint Address">
              <Address address={mintAddress} chars={6} showExplorer />
            </DetailRow>
            <DetailRow label="Preset">
              <Badge variant={config.preset === 2 ? "info" : "neutral"}>
                {config.preset === 1 ? "SSS-1 Minimal" : "SSS-2 Compliant"}
              </Badge>
            </DetailRow>
            {tokenMeta && (
              <>
                <DetailRow label="Name">
                  <span className="text-sm text-[var(--text-primary)]">
                    {tokenMeta.name}
                  </span>
                </DetailRow>
                <DetailRow label="Symbol">
                  <span className="text-sm font-[family-name:var(--font-jetbrains)] text-[var(--text-primary)]">
                    {tokenMeta.symbol}
                  </span>
                </DetailRow>
                <DetailRow label="Decimals">
                  <span className="text-sm font-[family-name:var(--font-jetbrains)] text-[var(--text-primary)]">
                    {tokenMeta.decimals}
                  </span>
                </DetailRow>
              </>
            )}
            <DetailRow label="Status">
              <Badge variant={config.paused ? "danger" : "success"}>
                {config.paused ? "Paused" : "Active"}
              </Badge>
            </DetailRow>
          </div>
        </div>

        {/* Role assignments */}
        <div className="rounded-xl bg-[var(--bg-card)] border border-[var(--border)] p-5">
          <h3 className="text-sm font-medium text-[var(--text-secondary)] mb-4 flex items-center gap-2">
            <Key className="w-4 h-4" />
            Role Assignments
          </h3>
          <div className="space-y-3">
            <DetailRow label="Authority">
              <Address address={config.authority} chars={6} showExplorer />
            </DetailRow>
            <DetailRow label="Master Minter">
              <Address address={config.masterMinter} chars={6} showExplorer />
            </DetailRow>
            <DetailRow label="Pauser">
              <Address address={config.pauser} chars={6} showExplorer />
            </DetailRow>
            {config.preset === 2 && (
              <DetailRow label="Blacklister">
                <Address address={config.blacklister} chars={6} showExplorer />
              </DetailRow>
            )}
            {config.pendingAuthority !==
              "11111111111111111111111111111111" && (
              <DetailRow label="Pending Authority">
                <div className="flex items-center gap-2">
                  <Address
                    address={config.pendingAuthority}
                    chars={6}
                    showExplorer
                  />
                  <Badge variant="warning">Pending</Badge>
                </div>
              </DetailRow>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function DetailRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-xs text-[var(--text-muted)] uppercase tracking-wider">
        {label}
      </span>
      <div>{children}</div>
    </div>
  );
}
