"use client";

import type { ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Activity, Coins, Droplets, Users } from "lucide-react";
import { getOperations } from "@/lib/api";
import { fetchMintStatus } from "@/lib/mint-status";
import { env } from "@/lib/env";
import {
  formatAmount,
  formatDate,
  truncateMiddle,
} from "@/lib/format";
import type { OperationStatus } from "@/lib/types";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

function getStatusColor(status: OperationStatus): string {
  switch (status) {
    case "finalized":
      return "bg-success/20 text-success";
    case "failed":
    case "cancelled":
      return "bg-destructive/20 text-destructive";
    case "requested":
    case "approved":
    case "signing":
    case "submitted":
      return "bg-warning/20 text-warning";
    default:
      return "bg-muted text-muted-foreground";
  }
}

function getFeatureBadge(enabled: boolean) {
  return enabled ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/25" : "bg-muted text-muted-foreground";
}

function getRoleLabel(address: string) {
  return address === "11111111111111111111111111111111" ? "Unset" : truncateMiddle(address);
}

function OverviewMetric({
  label,
  value,
  supporting,
  icon,
}: {
  label: string;
  value: string;
  supporting: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-background/40 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <div className="text-muted-foreground">{icon}</div>
      </div>
      <p className="mt-3 text-3xl font-semibold tracking-tight">{value}</p>
      <p className="mt-1 text-sm text-muted-foreground">{supporting}</p>
    </div>
  );
}

function DetailRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border/50 py-3 last:border-b-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={`max-w-[65%] text-right text-sm font-medium ${mono ? "font-mono text-xs" : ""}`}>
        {value}
      </span>
    </div>
  );
}

const PIE_COLORS = [
  "#22c55e",
  "#3b82f6",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#06b6d4",
  "#ec4899",
  "#84cc16",
];

export function DashboardClient() {
  const searchParams = useSearchParams();
  const mint = searchParams.get("mint") ?? undefined;

  const hasMint = !!mint?.trim();

  const { data: status, isPending: statusLoading, isError: statusError, error: statusErr } = useQuery({
    queryKey: ["mint-status", mint],
    queryFn: () => fetchMintStatus(mint!, env.rpcUrl),
    enabled: hasMint,
  });

  const { data: opsData, isPending: opsPending, isError: opsError, error: opsErr } = useQuery({
    queryKey: ["operations", { mint, limit: "10", offset: "0" }],
    queryFn: () => getOperations({ mint, limit: "10", offset: "0" }),
    enabled: hasMint,
  });

  const mintCount = opsData?.requests.filter((r) => r.type === "mint").length ?? 0;
  const burnCount = opsData?.requests.filter((r) => r.type === "burn").length ?? 0;
  const pendingCount =
    opsData?.requests.filter((r) =>
      ["requested", "approved", "submitted"].includes(r.status)
    ).length ?? 0;

  const decimals = status?.metadata.decimals ?? 6;
  const formattedSupply = status ? formatAmount(status.supply) : "0";
  const formattedMinted = status ? formatAmount(status.totalMinted) : "0";
  const formattedBurned = status ? formatAmount(status.totalBurned) : "0";
  const pieData =
    status?.holders.map((h) => ({
      name: truncateMiddle(h.owner, 4),
      value: parseFloat(h.percentOfSupply.replace("%", "")),
      fullOwner: h.owner,
    })) ?? [];

  if (!hasMint) {
    return (
      <div className="space-y-6">
        <h1 className="text-lg font-semibold">Overview</h1>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <p className="text-sm text-muted-foreground">
              Enter a mint address in the navbar to view the dashboard
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold">Overview</h1>

      {statusLoading && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="pt-6">
                <div className="h-4 w-16 bg-muted rounded animate-pulse" />
                <div className="h-8 w-24 bg-muted rounded animate-pulse mt-2" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      {statusError && (
        <Card className="border-destructive/50">
          <CardContent className="py-4">
            <p className="text-sm text-destructive">
              Failed to load mint status: {statusErr?.message}
            </p>
          </CardContent>
        </Card>
      )}

      {status && (
        <>
          <Card className="border-border/70 bg-card/70">
            <CardHeader className="space-y-3">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-semibold">{status.metadata.name}</h2>
                    <Badge variant="outline" className="uppercase">{status.preset}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Clean mint overview for supply, runtime status, and holder concentration.
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className={status.paused ? "border-amber-500/25 text-amber-300" : "border-emerald-500/25 text-emerald-300"}
                >
                  {status.paused ? "Paused" : "Healthy"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="grid gap-4 lg:grid-cols-5">
              <div className="lg:col-span-2">
                <OverviewMetric
                  label="Total supply"
                  value={formattedSupply}
                  supporting={`Raw on-chain units, ${decimals} decimals in metadata`}
                  icon={<Coins className="h-4 w-4" />}
                />
              </div>
              <OverviewMetric
                label="Total minted"
                value={formattedMinted}
                supporting="Cumulative mint volume"
                icon={<Coins className="h-4 w-4 text-emerald-400" />}
              />
              <OverviewMetric
                label="Total burned"
                value={formattedBurned}
                supporting="Cumulative burn volume"
                icon={<Droplets className="h-4 w-4 text-amber-400" />}
              />
              <OverviewMetric
                label="Holders"
                value={String(status.holderCount)}
                supporting="Largest funded accounts"
                icon={<Users className="h-4 w-4" />}
              />
            </CardContent>
          </Card>

          <div className="grid gap-4 xl:grid-cols-[1.35fr_0.95fr]">
            <Card className="border-border/70">
              <CardHeader className="space-y-2">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-semibold">Token Snapshot</h2>
                  <Badge variant="outline">Profile</Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  Identity, permissions, and authorities in one place.
                </p>
              </CardHeader>
              <CardContent className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
                <div>
                  <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Metadata</h3>
                  <div className="mt-3">
                    <DetailRow label="Mint" value={truncateMiddle(status.metadata.mint)} mono />
                    <DetailRow label="Name" value={status.metadata.name} />
                    <DetailRow label="Symbol" value={status.metadata.symbol} />
                    <DetailRow label="Decimals" value={String(status.metadata.decimals)} />
                    <DetailRow
                      label="URI"
                      value={
                        <a
                          href={status.metadata.uri}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline"
                        >
                          {truncateMiddle(status.metadata.uri, 12)}
                        </a>
                      }
                    />
                  </div>
                </div>

                <div className="space-y-5">
                  <div>
                    <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Features</h3>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Badge variant="outline" className={getFeatureBadge(status.features.permanentDelegate)}>
                        Permanent delegate
                      </Badge>
                      <Badge variant="outline" className={getFeatureBadge(status.features.transferHook)}>
                        Transfer hook
                      </Badge>
                      <Badge variant="outline" className={getFeatureBadge(status.features.defaultFrozen)}>
                        Default frozen
                      </Badge>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Authorities</h3>
                    <div className="mt-3">
                      <DetailRow label="Master" value={getRoleLabel(status.roles.masterAuthority)} mono />
                      <DetailRow label="Pauser" value={getRoleLabel(status.roles.pauser)} mono />
                      <DetailRow label="Burner" value={getRoleLabel(status.roles.burner)} mono />
                      <DetailRow label="Blacklister" value={getRoleLabel(status.roles.blacklister)} mono />
                      <DetailRow label="Seizer" value={getRoleLabel(status.roles.seizer)} mono />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="grid gap-4">
              <Card className="border-border/70">
                <CardHeader className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h2 className="text-base font-semibold">Runtime Health</h2>
                    <Activity className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Current operator-facing runtime configuration.
                  </p>
                </CardHeader>
                <CardContent>
                  <DetailRow label="Preset" value={status.preset.toUpperCase()} />
                  <DetailRow label="Status" value={status.paused ? "Paused" : "Active"} />
                  <DetailRow label="Runtime mint" value={truncateMiddle(status.metadata.mint)} mono />
                  <DetailRow label="RPC" value={truncateMiddle(env.rpcUrl, 18)} />
                </CardContent>
              </Card>

              <Card className="border-border/70">
                <CardHeader className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h2 className="text-base font-semibold">Holder Distribution</h2>
                    <Badge variant="outline">Top accounts</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Largest token accounts by share of reported supply.
                  </p>
                </CardHeader>
                <CardContent className="space-y-4">
                  {pieData.length > 0 ? (
                    <div className="grid gap-4 sm:grid-cols-[180px_1fr] sm:items-center">
                      <div className="h-44 min-w-0">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={pieData}
                              cx="50%"
                              cy="50%"
                              innerRadius={42}
                              outerRadius={68}
                              paddingAngle={2}
                              dataKey="value"
                              nameKey="name"
                            >
                              {pieData.map((_, i) => (
                                <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                              ))}
                            </Pie>
                            <Tooltip
                              formatter={(value: number) => `${value.toFixed(2)}%`}
                              contentStyle={{
                                backgroundColor: "hsl(var(--card))",
                                border: "1px solid hsl(var(--border))",
                                borderRadius: "var(--radius)",
                              }}
                            />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="space-y-3">
                        {status.holders.slice(0, 4).map((holder, index) => (
                          <div key={holder.tokenAccount} className="flex items-center justify-between gap-3 rounded-lg border border-border/60 p-3">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span
                                  className="h-2.5 w-2.5 rounded-full"
                                  style={{ backgroundColor: PIE_COLORS[index % PIE_COLORS.length] }}
                                />
                                <p className="truncate text-sm font-medium">{truncateMiddle(holder.owner)}</p>
                              </div>
                              <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
                                {truncateMiddle(holder.tokenAccount)}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-medium">{holder.percentOfSupply}</p>
                              <p className="text-xs text-muted-foreground">{formatAmount(holder.balance)}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
                      No holders
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </>
      )}

      <Card>
        <CardHeader>
          <h2 className="text-sm font-medium">Operations summary</h2>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-3 mb-6">
            <div>
              <p className="text-sm text-muted-foreground">Total requests</p>
              <p className="text-xl font-semibold">{opsData?.total ?? 0}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Mints / Burns</p>
              <p className="text-xl font-semibold">
                {mintCount} / {burnCount}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Pending</p>
              <p className="text-xl font-semibold">{pendingCount}</p>
            </div>
          </div>
          <div className="divide-y divide-border">
            {opsPending && (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                Loading…
              </div>
            )}
            {opsError && (
              <div className="px-4 py-8 text-center text-sm text-destructive">
                {opsErr?.message}
              </div>
            )}
            {opsData?.requests.length === 0 && !opsPending && !opsError && (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                No operations yet
              </div>
            )}
            {opsData?.requests.map((op) => (
              <div
                key={op.id}
                className="flex items-center justify-between gap-4 px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">
                    {(op.type ?? "unknown").toUpperCase()} · {formatAmount(op.amount)}
                  </p>
                  <p className="truncate text-sm text-muted-foreground">
                    {truncateMiddle(op.mint)}
                  </p>
                </div>
                <Badge
                  variant="secondary"
                  className={getStatusColor(op.status)}
                >
                  {op.status}
                </Badge>
                <span className="shrink-0 text-sm text-muted-foreground">
                  {formatDate(op.updated_at)}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
