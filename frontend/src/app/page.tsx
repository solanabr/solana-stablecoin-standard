"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  Coins,
  Database,
  ExternalLink,
  Globe,
  Loader2,
  RefreshCw,
  Server,
  Shield,
  Sparkles,
  XCircle,
} from "lucide-react";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Preset, BackingType, BankingRail } from "@sss/sdk";
import { useStablecoin } from "../hooks/useStablecoin";
import { useTransactionStatus } from "../hooks/useTransactionStatus";

type OverviewResponse = {
  success: boolean;
  data: {
    circulatingSupply: string;
    totalHolders: number;
    transactions24h: number;
    volume24h: string;
    confidentialTransfers: {
      total: number;
      last24h: number;
      percentageOfTotal: number;
    };
    compliance: {
      complianceAlerts24h: number;
    };
  };
};

type TimeSeriesResponse = {
  success: boolean;
  data: {
    dataPoints: Array<{ timestamp: string; value: string }>;
  };
};

type ConfidentialResponse = {
  success: boolean;
  data: {
    proofSuccessRate: number;
    totalCTTransactions: number;
    breakdown: {
      deposits: number;
      transfers: number;
      withdrawals: number;
    };
  };
};

type HealthResponse = {
  status: string;
  environment: string;
  solana: {
    network: string;
    rpcEndpoint: string;
  };
};

type CTTransactionsResponse = {
  success: boolean;
  data: {
    trackingAddress?: string;
    transactions: Array<{
      signature: string;
      type: string;
      amount?: string;
      status: string;
      timestamp?: string | null;
      blockTime?: number | null;
    }>;
  };
};

type TransactionsResponse = {
  success: boolean;
  data: {
    trackingAddress?: string;
    transactions: Array<{
      signature: string;
      status: string;
      timestamp?: string | null;
      blockTime?: number | null;
    }>;
  };
};

type NetworkResponse = {
  success: boolean;
  data: {
    status: string;
    network: string;
    rpcEndpoint: string;
    currentSlot?: number;
    blockHeight?: number;
  };
};

type BackingStatusResponse = {
  success: boolean;
  data: {
    bankWiring: {
      enabled: boolean;
      providers: string[];
      webhookConfigured: boolean;
      apiBaseConfigured: boolean;
    };
    backingOptions: {
      fiatReservesEnabled: boolean;
      collateralizedEnabled: boolean;
      providerCount: number;
      providers: string[];
      attestationEndpointConfigured: boolean;
      oracleConfigured: boolean;
    };
    runtime: {
      fullyOperational: boolean;
      environment: string;
      checkedAt: string;
    };
  };
};

const getApiCandidates = () => {
  const envCandidate = process.env.NEXT_PUBLIC_API_URL;
  const browserCandidates =
    typeof window !== "undefined"
      ? [
          `${window.location.protocol}//${window.location.hostname}:3001`,
          `${window.location.protocol}//${window.location.hostname}:3011`,
        ]
      : [];

  return Array.from(
    new Set([envCandidate, ...browserCandidates, "http://localhost:3001", "http://localhost:3011"].filter(Boolean))
  ) as string[];
};

const formatCompact = (value: number) =>
  new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(value);

const formatMoney = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(value);

const toHourLabel = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

const groupByHour = (timestamps: Array<string | null | undefined>) => {
  const now = Date.now();
  const buckets = Array.from({ length: 24 }, (_, index) => {
    const ts = new Date(now - (23 - index) * 60 * 60 * 1000);
    const label = ts.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    return { hour: label, value: 0 };
  });

  const map = new Map(buckets.map((bucket) => [bucket.hour, bucket]));

  for (const timestamp of timestamps) {
    if (!timestamp) continue;
    const hour = toHourLabel(timestamp);
    const bucket = map.get(hour);
    if (bucket) {
      bucket.value += 1;
    }
  }

  return buckets;
};

export default function DashboardPage() {
  // Keep candidates in a ref so fetchJson never forces loadDashboardData to recreate
  const apiCandidatesRef = useRef<string[]>(["http://localhost:3001", "http://localhost:3011"]);
  const fetchingRef = useRef(false); // in-flight dedup guard
  const [refreshing, setRefreshing] = useState(false);
  const [activeView, setActiveView] = useState<"overview" | "operations" | "security">("overview");
  const [apiBase, setApiBase] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [network, setNetwork] = useState<NetworkResponse["data"] | null>(null);
  const [backingStatus, setBackingStatus] = useState<BackingStatusResponse["data"] | null>(null);
  const [supplySeries, setSupplySeries] = useState<Array<{ hour: string; supply: number }>>([]);
  const [txSeries, setTxSeries] = useState<Array<{ hour: string; tx: number }>>([]);
  const [ctAnalytics, setCtAnalytics] = useState<ConfidentialResponse["data"] | null>(null);
  const [recentOps, setRecentOps] = useState<
    Array<{ id: number; label: string; detail: string; status: "success" | "warning"; time: string }>
  >([]);

  // ── SDK Operations state ──────────────────────────────────────────────────
  const [sdkMintAddress, setSdkMintAddress] = useState("");
  const [sdkForm, setSdkForm] = useState({
    name: "USD Stablecoin",
    symbol: "USDS",
    preset: Preset.SSS1 as number,
    decimals: 6,
    backing: BackingType.Fiat as number,
    rail: BankingRail.None as number,
    recipient: "",
    amount: "1000000",
    targetAccount: "",
    bankRef: "WIRE-REF-001",
    role: 0,
  });

  const { txState, run: runSdkOp, reset: resetSdkTx } = useTransactionStatus();
  const sdk = useStablecoin(sdkMintAddress || undefined);
  const { connected } = useWallet();

  const fetchJson = useCallback(async <T,>(path: string, init?: RequestInit) => {
    let lastError: unknown;

    for (const candidate of apiCandidatesRef.current) {
      try {
        const response = await fetch(`${candidate}${path}`, {
          cache: "no-store",
          ...(init || {}),
        });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        setApiBase(candidate);
        return (await response.json()) as T;
      } catch (fetchError) {
        lastError = fetchError;
      }
    }

    throw lastError;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // stable — reads ref, never recreates

  useEffect(() => {
    // Seed candidates once on mount, then start 30s auto-refresh
    apiCandidatesRef.current = getApiCandidates();
    if (apiCandidatesRef.current.length > 0) {
      setApiBase(apiCandidatesRef.current[0]);
    }
  }, []); // mount-only — no deps needed

  const loadDashboardData = useCallback(async (force = false) => {
    if (!force && fetchingRef.current) return; // dedup: skip if already in-flight
    fetchingRef.current = true;
    setLoading((prev) => (prev ? prev : true)); // don't flicker if already loading
    setError(null);

    try {
      const [healthRes, networkRes, txRes, ctRes, backingRes] = await Promise.allSettled([
        fetchJson<HealthResponse>("/api/v1/health"),
        fetchJson<NetworkResponse>("/api/v1/analytics/network"),
        fetchJson<TransactionsResponse>("/api/v1/transactions?limit=120"),
        fetchJson<CTTransactionsResponse>("/api/v1/transactions/confidential?limit=5"),
        fetchJson<BackingStatusResponse>("/api/v1/tokens/backing/status"),
      ]);

      if (healthRes.status === "fulfilled") {
        setHealth(healthRes.value);
      }

      if (networkRes.status === "fulfilled") {
        setNetwork(networkRes.value.data);
      }

      if (backingRes.status === "fulfilled") {
        setBackingStatus(backingRes.value.data);
      }

      if (ctRes.status === "fulfilled") {
        const ctTransactions = ctRes.value.data.transactions;
        setCtAnalytics({
          proofSuccessRate:
            ctTransactions.length > 0
              ? Number(
                  (
                    (ctTransactions.filter((tx) => tx.status === "verified" || tx.status === "success").length /
                      ctTransactions.length) *
                    100
                  ).toFixed(2)
                )
              : 0,
          totalCTTransactions: ctTransactions.length,
          breakdown: {
            deposits: 0,
            transfers: ctTransactions.length,
            withdrawals: 0,
          },
        });
      }

      if (txRes.status === "fulfilled") {
        const allTx = txRes.value.data.transactions;
        const allTimestamps = allTx.map((tx) => tx.timestamp ?? null);
        const hourly = groupByHour(allTimestamps);

        setTxSeries(
          hourly.map((bucket) => ({
            hour: bucket.hour,
            tx: bucket.value,
          }))
        );

        setSupplySeries(
          hourly.map((bucket) => ({
            hour: bucket.hour,
            supply: bucket.value,
          }))
        );
      }

      if (ctRes.status === "fulfilled") {
        const ctTransactions = ctRes.value.data.transactions;
        setRecentOps(
          ctTransactions.map((tx, index) => ({
            id: index + 1,
            label: tx.type.toUpperCase(),
            detail: `${tx.amount ? formatMoney(Number(tx.amount) / 1_000_000_000) : "N/A"} • ${tx.signature.slice(0, 8)}...`,
            status: tx.status === "verified" || tx.status === "success" ? "success" : "warning",
            time: tx.timestamp ? new Date(tx.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "N/A",
          }))
        );
      }

      const successfulResponses = [healthRes, networkRes, txRes, ctRes, backingRes].filter(
        (result) => result.status === "fulfilled"
      ).length;

      if (successfulResponses === 0) {
        setError("Unable to reach backend API. Start backend on port 3001 or 3011.");
      } else if (successfulResponses < 5) {
        setError("Dashboard is live with partial data. Some backend endpoints are temporarily unavailable.");
      }
    } catch {
      setError("Unable to reach backend API. Start backend on port 3001 or 3011.");
    } finally {
      setLoading(false);
      setRefreshing(false);
      fetchingRef.current = false;
    }
  }, [fetchJson]);

  const kpis = useMemo(
    () => [
      {
        title: "24h Transactions",
        value: formatCompact(txSeries.reduce((sum, item) => sum + item.tx, 0)),
        delta: "live",
        positive: true,
        icon: Activity,
      },
      {
        title: "CT Transactions",
        value: ctAnalytics ? formatCompact(ctAnalytics.totalCTTransactions) : "0",
        delta: "live",
        positive: true,
        icon: Shield,
      },
      {
        title: "Network",
        value: health?.solana.network ?? "--",
        delta: network?.status ?? "--",
        positive: true,
        icon: Globe,
      },
      {
        title: "Bank Wiring",
        value: backingStatus?.bankWiring.enabled ? "enabled" : "disabled",
        delta: backingStatus?.runtime.fullyOperational ? "operational" : "not-ready",
        positive: Boolean(backingStatus?.runtime.fullyOperational),
        icon: Database,
      },
    ],
    [backingStatus, ctAnalytics, health?.solana.network, network?.status, txSeries]
  );

  const isPartialData = error?.includes("partial data") ?? false;
  const opBusy = txState.status === "sending" || txState.status === "confirming";

  const f = sdkForm;
  const setF = (patch: Partial<typeof sdkForm>) => setSdkForm((p) => ({ ...p, ...patch }));

  const handleRefresh = () => {
    setRefreshing(true);
    void loadDashboardData(true);
  };

  useEffect(() => {
    void loadDashboardData(true);
    // Auto-refresh every 30 seconds
    const timer = setInterval(() => void loadDashboardData(), 30_000);
    return () => clearInterval(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // mount-only — loadDashboardData is now stable

  return (
    <div className="min-h-screen bg-gradient-to-b from-white via-slate-50 to-slate-100 text-slate-900">
      <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-600 via-violet-500 to-cyan-500 text-white shadow-sm">
              <Coins className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight">SSS Control Center</h1>
              <p className="text-xs text-slate-500">Solana Stablecoin Standard </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleRefresh}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-100"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
              Refresh
            </button>
            <WalletMultiButton className="!rounded-xl !bg-slate-900 !px-4 !py-2 !text-sm !font-semibold" />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-6 py-8">
        <section className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold">Stablecoin Operations Command Deck</h2>
              <p className="text-sm text-slate-500">
                Live data from backend analytics, health, and confidential transfer APIs.
              </p>
              <div className="mt-2 inline-flex items-center gap-2 rounded-full border border-indigo-100 bg-indigo-50 px-3 py-1 text-xs text-indigo-700">
                <Sparkles className="h-3.5 w-3.5" /> API source: {apiBase || "unavailable"}
              </div>
              <div className="mt-2 inline-flex items-center gap-2 rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1 text-xs text-emerald-700">
                <Server className="h-3.5 w-3.5" /> Backend: {health?.status === "healthy" ? "Connected" : "Waiting"}
              </div>
            </div>

            <div className="inline-flex rounded-xl border border-slate-200 bg-slate-100 p-1">
              {(["overview", "operations", "security"] as const).map((view) => (
                <button
                  key={view}
                  onClick={() => setActiveView(view)}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium capitalize transition ${
                    activeView === view ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"
                  }`}
                >
                  {view}
                </button>
              ))}
            </div>
          </div>

          {error ? (
            <div
              className={`mb-4 rounded-2xl px-4 py-3 text-sm ${
                isPartialData
                  ? "border border-amber-200 bg-amber-50 text-amber-700"
                  : "border border-rose-200 bg-rose-50 text-rose-700"
              }`}
            >
              {error}
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            {kpis.map((kpi, index) => (
              <motion.div
                key={kpi.title}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className="rounded-2xl border border-slate-200 bg-white p-4"
              >
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-medium text-slate-500">{kpi.title}</p>
                  <kpi.icon className="h-4 w-4 text-slate-500" />
                </div>
                <p className="text-2xl font-semibold tracking-tight">{loading ? "Loading..." : kpi.value}</p>
                <div className="mt-2 flex items-center gap-1 text-xs">
                  {kpi.positive ? (
                    <ArrowUpRight className="h-3.5 w-3.5 text-emerald-600" />
                  ) : (
                    <ArrowDownRight className="h-3.5 w-3.5 text-rose-600" />
                  )}
                  <span className={kpi.positive ? "text-emerald-600" : "text-rose-600"}>{kpi.delta}</span>
                  <span className="text-slate-400">vs last 24h</span>
                </div>
              </motion.div>
            ))}
          </div>
        </section>

        {activeView === "overview" ? (
          <>
            <section className="grid grid-cols-1 gap-6 xl:grid-cols-3">
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm xl:col-span-2">
                <div className="mb-4">
                  <h3 className="text-base font-semibold">Transactions Per Hour</h3>
                  <p className="text-sm text-slate-500">Derived from `/api/v1/transactions` live block times</p>
                </div>
                <ResponsiveContainer width="100%" height={260}>
                  <AreaChart data={supplySeries}>
                    <defs>
                      <linearGradient id="txByHour" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#7c3aed" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="#7c3aed" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="hour" stroke="#94a3b8" tick={{ fontSize: 11 }} />
                    <YAxis stroke="#94a3b8" tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(value: number) => [value, "Tx Count"]} />
                    <Area type="monotone" dataKey="supply" stroke="#7c3aed" strokeWidth={2} fill="url(#txByHour)" />
                  </AreaChart>
                </ResponsiveContainer>
              </motion.div>

              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm">
                <div className="mb-4">
                  <h3 className="text-base font-semibold">Confidential Throughput</h3>
                  <p className="text-sm text-slate-500">Derived from `/api/v1/transactions/confidential`</p>
                </div>
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={txSeries}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="hour" stroke="#94a3b8" tick={{ fontSize: 11 }} />
                    <YAxis stroke="#94a3b8" tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Line type="monotone" dataKey="tx" stroke="#0ea5e9" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </motion.div>
            </section>

            <section className="grid grid-cols-1 gap-6 xl:grid-cols-3">
              <div className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm xl:col-span-2">
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="text-base font-semibold">Recent Confidential Operations</h3>
                  <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">Live</span>
                </div>
                <div className="space-y-3">
                  {recentOps.map((op) => (
                    <div key={op.id} className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3">
                      <div className="flex items-center gap-3">
                        <CheckCircle2 className={`h-4 w-4 ${op.status === "success" ? "text-emerald-600" : "text-amber-600"}`} />
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{op.label}</p>
                          <p className="text-xs text-slate-500">{op.detail}</p>
                        </div>
                      </div>
                      <span className="text-xs text-slate-400">{op.time}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm">
                <h3 className="mb-4 text-base font-semibold">Live System Signals</h3>
                <div className="space-y-3 text-sm text-slate-600">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <p className="font-semibold text-slate-800">Environment</p>
                    <p>{health?.environment ?? "unknown"} • {health?.solana.network ?? "unknown"}</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <p className="font-semibold text-slate-800">RPC Status</p>
                    <p>{network?.status ?? "unknown"}</p>
                    <p className="truncate text-xs">{network?.rpcEndpoint ?? health?.solana.rpcEndpoint ?? "N/A"}</p>
                  </div>
                </div>
              </div>
            </section>
          </>
        ) : null}

        {activeView === "operations" ? (
          <section className="space-y-6">
            {/* ── Wallet + Mint Address header ──────────────────────────────── */}
            <div className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h3 className="text-base font-semibold">On-Chain Operations</h3>
                  <p className="mt-0.5 text-sm text-slate-500">
                    Transactions are signed by your connected wallet and sent directly to Devnet.
                  </p>
                </div>
                <WalletMultiButton />
              </div>

              {connected && (
                <div className="mt-4">
                  <label className="mb-1 block text-xs font-medium text-slate-600">
                    Active Mint Address <span className="text-slate-400">(required for all post-create operations)</span>
                  </label>
                  <input
                    value={sdkMintAddress}
                    onChange={(e) => setSdkMintAddress(e.target.value)}
                    placeholder="e.g. 7nKM…xPQ2"
                    className="w-full max-w-lg rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                  />
                </div>
              )}

              {!connected && (
                <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  Connect your wallet above to sign and send transactions.
                </div>
              )}
            </div>

            {/* ── Tx status banner ──────────────────────────────────────────── */}
            {txState.status !== "idle" && (
              <div
                className={`flex items-start gap-3 rounded-2xl border px-5 py-4 text-sm ${
                  txState.status === "error"
                    ? "border-red-200 bg-red-50 text-red-800"
                    : txState.status === "confirmed"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                    : "border-indigo-200 bg-indigo-50 text-indigo-800"
                }`}
              >
                {(txState.status === "sending" || txState.status === "confirming") && (
                  <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin" />
                )}
                {txState.status === "error" && <XCircle className="mt-0.5 h-4 w-4 shrink-0" />}
                <div className="flex-1 space-y-1">
                  <p className="font-medium">{txState.label}</p>
                  {txState.status === "sending" && <p className="text-xs opacity-75">Waiting for wallet signature…</p>}
                  {txState.status === "confirming" && <p className="text-xs opacity-75">Broadcasting and confirming on-chain…</p>}
                  {txState.status === "confirmed" && txState.signature && (
                    <a
                      href={`https://explorer.solana.com/tx/${txState.signature}?cluster=devnet`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-medium underline"
                    >
                      View on Explorer <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                  {txState.status === "error" && <p className="text-xs opacity-75">{txState.error}</p>}
                </div>
                <button onClick={resetSdkTx} className="ml-auto text-xs opacity-60 hover:opacity-100">Dismiss</button>
              </div>
            )}

            {/* ── Bootstrap Roles ───────────────────────────────────────────── */}
            {connected && sdkMintAddress && (
              <div className="rounded-3xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="font-semibold text-amber-900">⚡ Step required for existing mints</p>
                    <p className="mt-1 text-sm text-amber-800">
                      If you just created this mint <strong>in a previous session</strong> or the mint was created before
                      the role-bundle update, your wallet may not have operator roles yet.
                      Run this once to grant yourself all roles (Minter, Burner, Pauser, Freezer, Blacklister, Seizer)
                      so Mint / Burn / Freeze etc work.
                    </p>
                    <p className="mt-1 text-xs text-amber-700">
                      Mints created <strong>now</strong> (via the Create card below) already include roles — skip this.
                    </p>
                  </div>
                  <button
                    disabled={!connected || !sdkMintAddress || opBusy}
                    onClick={() => runSdkOp(() => sdk.bootstrapRoles(sdkMintAddress), "Bootstrap Roles")}
                    className="shrink-0 rounded-xl bg-amber-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 hover:bg-amber-800"
                  >
                    {opBusy ? "Sending…" : "Grant All Roles to My Wallet"}
                  </button>
                </div>
              </div>
            )}

            {/* ── CREATE ────────────────────────────────────────────────────── */}
            <div className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-base font-semibold">Create Stablecoin</h3>
                <span className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-medium text-violet-700">SSS Standard</span>
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                <input value={f.name} onChange={(e) => setF({ name: e.target.value })} placeholder="Token name" className="rounded-xl border border-slate-300 px-3 py-2 text-sm" />
                <input value={f.symbol} onChange={(e) => setF({ symbol: e.target.value })} placeholder="Symbol (e.g. USDS)" className="rounded-xl border border-slate-300 px-3 py-2 text-sm" />
                <select value={f.preset} onChange={(e) => setF({ preset: Number(e.target.value) })} className="rounded-xl border border-slate-300 px-3 py-2 text-sm">
                  <option value={Preset.SSS1}>SSS-1 (Basic)</option>
                  <option value={Preset.SSS2}>SSS-2 (Transfer-hook)</option>
                  <option value={Preset.SSS3}>SSS-3 (Full)</option>
                </select>
                <input value={f.decimals} onChange={(e) => setF({ decimals: Number(e.target.value) })} type="number" placeholder="Decimals (6)" className="rounded-xl border border-slate-300 px-3 py-2 text-sm" />
                <select value={f.backing} onChange={(e) => setF({ backing: Number(e.target.value) })} className="rounded-xl border border-slate-300 px-3 py-2 text-sm">
                  <option value={BackingType.Fiat}>Fiat</option>
                  <option value={BackingType.Gold}>Gold</option>
                  <option value={BackingType.Crypto}>Crypto</option>
                  <option value={BackingType.Commodity}>Commodity</option>
                  <option value={BackingType.RealEstate}>Real Estate</option>
                  <option value={BackingType.MultiAsset}>Multi-Asset</option>
                  <option value={BackingType.Algorithmic}>Algorithmic</option>
                </select>
                <select value={f.rail} onChange={(e) => setF({ rail: Number(e.target.value) })} className="rounded-xl border border-slate-300 px-3 py-2 text-sm">
                  <option value={BankingRail.Swift}>SWIFT</option>
                  <option value={BankingRail.Ach}>ACH</option>
                  <option value={BankingRail.Sepa}>SEPA</option>
                  <option value={BankingRail.Fedwire}>Fedwire</option>
                  <option value={BankingRail.Fps}>FPS</option>
                  <option value={BankingRail.Pix}>PIX</option>
                  <option value={BankingRail.Upi}>UPI</option>
                  <option value={BankingRail.None}>None</option>
                </select>
              </div>
              <button
                disabled={!connected || opBusy}
                onClick={() =>
                  runSdkOp(
                    () =>
                      sdk.create({
                        name: f.name,
                        symbol: f.symbol,
                        preset: f.preset as Preset,
                        decimals: f.decimals,
                        supplyCap: BigInt(0),
                        uri: "",
                        backingType: f.backing as BackingType,
                        bankingRail: f.rail as BankingRail,
                      }),
                    "Create Stablecoin",
                  )
                }
                className="mt-4 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {opBusy ? "Sending…" : "Create Stablecoin"}
              </button>
            </div>

            {/* ── MINT / BURN ───────────────────────────────────────────────── */}
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
              <div className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm">
                <h3 className="mb-4 text-base font-semibold">Mint Tokens</h3>
                <div className="space-y-3">
                  <input value={f.recipient} onChange={(e) => setF({ recipient: e.target.value })} placeholder="Recipient wallet" className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" />
                  <input value={f.amount} onChange={(e) => setF({ amount: e.target.value })} type="number" placeholder="Amount (raw units)" className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" />
                </div>
                <button
                  disabled={!connected || !sdkMintAddress || opBusy}
                  onClick={() => runSdkOp(() => sdk.mint(sdkMintAddress, f.recipient, BigInt(f.amount)), "Mint Tokens")}
                  className="mt-4 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  {opBusy ? "Sending…" : "Mint"}
                </button>
              </div>

              <div className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm">
                <h3 className="mb-4 text-base font-semibold">Burn Tokens</h3>
                <div className="space-y-3">
                  <input value={f.amount} onChange={(e) => setF({ amount: e.target.value })} type="number" placeholder="Amount (raw units)" className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" />
                </div>
                <button
                  disabled={!connected || !sdkMintAddress || opBusy}
                  onClick={() => runSdkOp(() => sdk.burn(sdkMintAddress, BigInt(f.amount)), "Burn Tokens")}
                  className="mt-4 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  {opBusy ? "Sending…" : "Burn"}
                </button>
              </div>
            </div>

            {/* ── FREEZE / THAW / PAUSE ─────────────────────────────────────── */}
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
              <div className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm">
                <h3 className="mb-4 text-base font-semibold">Freeze Account</h3>
                <input value={f.targetAccount} onChange={(e) => setF({ targetAccount: e.target.value })} placeholder="Target token account" className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" />
                <button
                  disabled={!connected || !sdkMintAddress || opBusy}
                  onClick={() => runSdkOp(() => sdk.freeze(sdkMintAddress, f.targetAccount), "Freeze Account")}
                  className="mt-4 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  {opBusy ? "Sending…" : "Freeze"}
                </button>
              </div>

              <div className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm">
                <h3 className="mb-4 text-base font-semibold">Thaw Account</h3>
                <input value={f.targetAccount} onChange={(e) => setF({ targetAccount: e.target.value })} placeholder="Target token account" className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" />
                <button
                  disabled={!connected || !sdkMintAddress || opBusy}
                  onClick={() => runSdkOp(() => sdk.thaw(sdkMintAddress, f.targetAccount), "Thaw Account")}
                  className="mt-4 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  {opBusy ? "Sending…" : "Thaw"}
                </button>
              </div>

              <div className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm">
                <h3 className="mb-4 text-base font-semibold">Pause / Unpause</h3>
                <p className="mb-4 text-sm text-slate-500">Halt or resume all transfers for this mint.</p>
                <div className="flex gap-3">
                  <button
                    disabled={!connected || !sdkMintAddress || opBusy}
                    onClick={() => runSdkOp(() => sdk.pause(sdkMintAddress), "Pause Mint")}
                    className="flex-1 rounded-xl bg-amber-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                  >
                    Pause
                  </button>
                  <button
                    disabled={!connected || !sdkMintAddress || opBusy}
                    onClick={() => runSdkOp(() => sdk.unpause(sdkMintAddress), "Unpause Mint")}
                    className="flex-1 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                  >
                    Unpause
                  </button>
                </div>
              </div>
            </div>

            {/* ── BLACKLIST / SEIZE ─────────────────────────────────────────── */}
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
              <div className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm">
                <h3 className="mb-4 text-base font-semibold">Blacklist</h3>
                <input value={f.targetAccount} onChange={(e) => setF({ targetAccount: e.target.value })} placeholder="Wallet to blacklist/unblacklist" className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" />
                <div className="mt-3 flex gap-3">
                  <button
                    disabled={!connected || !sdkMintAddress || opBusy}
                    onClick={() => runSdkOp(() => sdk.blacklistAdd(sdkMintAddress, f.targetAccount), "Blacklist Add")}
                    className="flex-1 rounded-xl bg-red-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                  >
                    Add
                  </button>
                  <button
                    disabled={!connected || !sdkMintAddress || opBusy}
                    onClick={() => runSdkOp(() => sdk.blacklistRemove(sdkMintAddress, f.targetAccount), "Blacklist Remove")}
                    className="flex-1 rounded-xl bg-slate-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                  >
                    Remove
                  </button>
                </div>
              </div>

              <div className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm">
                <h3 className="mb-4 text-base font-semibold">Seize Funds</h3>
                <div className="space-y-3">
                  <input value={f.targetAccount} onChange={(e) => setF({ targetAccount: e.target.value })} placeholder="From token account" className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" />
                  <input value={f.recipient} onChange={(e) => setF({ recipient: e.target.value })} placeholder="To token account" className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" />
                  <input value={f.amount} onChange={(e) => setF({ amount: e.target.value })} type="number" placeholder="Amount (raw units)" className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" />
                </div>
                <button
                  disabled={!connected || !sdkMintAddress || opBusy}
                  onClick={() =>
                    runSdkOp(
                      () => sdk.seize(sdkMintAddress, f.targetAccount, f.recipient, BigInt(f.amount)),
                      "Seize Funds",
                    )
                  }
                  className="mt-4 rounded-xl bg-red-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  {opBusy ? "Sending…" : "Seize"}
                </button>
              </div>
            </div>

            {/* ── BANKING ───────────────────────────────────────────────────── */}
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
              <div className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm">
                <h3 className="mb-4 text-base font-semibold">Mint Request</h3>
                <div className="space-y-3">
                  <input value={f.recipient} onChange={(e) => setF({ recipient: e.target.value })} placeholder="Recipient wallet" className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" />
                  <input value={f.amount} onChange={(e) => setF({ amount: e.target.value })} type="number" placeholder="Amount (raw units)" className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" />
                  <input value={f.bankRef} onChange={(e) => setF({ bankRef: e.target.value })} placeholder="Bank reference ID" className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" />
                  <select value={f.rail} onChange={(e) => setF({ rail: Number(e.target.value) })} className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm">
                    <option value={BankingRail.Swift}>SWIFT</option>
                    <option value={BankingRail.Ach}>ACH</option>
                    <option value={BankingRail.Sepa}>SEPA</option>
                    <option value={BankingRail.Fedwire}>Fedwire</option>
                    <option value={BankingRail.Fps}>FPS</option>
                    <option value={BankingRail.Pix}>PIX</option>
                    <option value={BankingRail.Upi}>UPI</option>
                    <option value={BankingRail.None}>None</option>
                  </select>
                </div>
                <button
                  disabled={!connected || !sdkMintAddress || opBusy}
                  onClick={() =>
                    runSdkOp(
                      () =>
                        sdk.mintRequest(sdkMintAddress, f.recipient, {
                          amount: BigInt(f.amount),
                          bankReference: f.bankRef,
                          bankingRail: f.rail,
                        }),
                      "Mint Request",
                    )
                  }
                  className="mt-4 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  {opBusy ? "Sending…" : "Submit Mint Request"}
                </button>
              </div>

              <div className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm">
                <h3 className="mb-4 text-base font-semibold">Redemption</h3>
                <div className="space-y-3">
                  <input value={f.amount} onChange={(e) => setF({ amount: e.target.value })} type="number" placeholder="Amount (raw units)" className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" />
                  <input value={f.bankRef} onChange={(e) => setF({ bankRef: e.target.value })} placeholder="Bank reference ID" className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" />
                  <select value={f.rail} onChange={(e) => setF({ rail: Number(e.target.value) })} className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm">
                    <option value={BankingRail.Swift}>SWIFT</option>
                    <option value={BankingRail.Ach}>ACH</option>
                    <option value={BankingRail.Sepa}>SEPA</option>
                    <option value={BankingRail.Fedwire}>Fedwire</option>
                    <option value={BankingRail.Fps}>FPS</option>
                    <option value={BankingRail.Pix}>PIX</option>
                    <option value={BankingRail.Upi}>UPI</option>
                    <option value={BankingRail.None}>None</option>
                  </select>
                </div>
                <button
                  disabled={!connected || !sdkMintAddress || opBusy}
                  onClick={() =>
                    runSdkOp(
                      () =>
                        sdk.redeem(sdkMintAddress, {
                          amount: BigInt(f.amount),
                          bankReference: f.bankRef,
                          bankingRail: f.rail,
                        }),
                      "Redemption",
                    )
                  }
                  className="mt-4 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  {opBusy ? "Sending…" : "Submit Redemption"}
                </button>
              </div>
            </div>

            {/* ── ROLES ─────────────────────────────────────────────────────── */}
            <div className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm">
              <h3 className="mb-4 text-base font-semibold">Role Management</h3>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <input value={f.targetAccount} onChange={(e) => setF({ targetAccount: e.target.value })} placeholder="Target wallet" className="rounded-xl border border-slate-300 px-3 py-2 text-sm" />
                <select value={f.role} onChange={(e) => setF({ role: Number(e.target.value) })} className="rounded-xl border border-slate-300 px-3 py-2 text-sm">
                  <option value={0}>Minter</option>
                  <option value={1}>Burner</option>
                  <option value={2}>Freezer</option>
                  <option value={3}>Pauser</option>
                  <option value={4}>Blacklister</option>
                  <option value={5}>Seizer</option>
                  <option value={6}>Role Admin</option>
                </select>
                <div className="flex gap-3">
                  <button
                    disabled={!connected || !sdkMintAddress || opBusy}
                    onClick={() => runSdkOp(() => sdk.grantRoleByNum(sdkMintAddress, f.targetAccount, f.role), "Grant Role")}
                    className="flex-1 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                  >
                    Grant
                  </button>
                  <button
                    disabled={!connected || !sdkMintAddress || opBusy}
                    onClick={() => runSdkOp(() => sdk.revokeRoleByNum(sdkMintAddress, f.targetAccount, f.role), "Revoke Role")}
                    className="flex-1 rounded-xl bg-slate-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                  >
                    Revoke
                  </button>
                </div>
              </div>
            </div>
          </section>
        ) : null}

        {activeView === "security" ? (
          <section className="grid grid-cols-1 gap-6 xl:grid-cols-3">
            <div className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm xl:col-span-2">
              <h3 className="mb-4 text-base font-semibold">Security & Runtime</h3>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="rounded-xl border border-slate-200 p-3">
                  <p className="font-semibold">Health</p>
                  <p className="text-sm text-slate-600">Status: {health?.status ?? "unknown"}</p>
                  <p className="text-sm text-slate-600">Network: {health?.solana.network ?? "unknown"}</p>
                </div>
                <div className="rounded-xl border border-slate-200 p-3">
                  <p className="font-semibold">Chain</p>
                  <p className="text-sm text-slate-600">Slot: {network?.currentSlot ?? "--"}</p>
                  <p className="text-sm text-slate-600">Block Height: {network?.blockHeight ?? "--"}</p>
                </div>
                <div className="rounded-xl border border-slate-200 p-3 md:col-span-2">
                  <p className="font-semibold">Confidential Proof Quality</p>
                  <p className="text-sm text-slate-600">Verified ratio: {ctAnalytics ? `${ctAnalytics.proofSuccessRate}%` : "0%"}</p>
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm">
              <h3 className="mb-4 text-base font-semibold">Unique Features Status</h3>
              <div className="space-y-3 text-sm text-slate-600">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="font-semibold text-slate-800">Wired bank connections</p>
                  <p>Running: {String(backingStatus?.bankWiring.enabled ?? false)}</p>
                  <p>API configured: {String(backingStatus?.bankWiring.apiBaseConfigured ?? false)}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="font-semibold text-slate-800">Multiple backing options</p>
                  <p>Fiat: {String(backingStatus?.backingOptions.fiatReservesEnabled ?? false)}</p>
                  <p>Collateralized: {String(backingStatus?.backingOptions.collateralizedEnabled ?? false)}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="font-semibold text-slate-800">How to run</p>
                  <p className="text-xs">Set backend env vars: `BANK_WIRING_ENABLED`, `BANK_API_BASE_URL`, `WIRE_PROVIDERS`, `FIAT_RESERVES_ENABLED`, `COLLATERAL_BACKING_ENABLED`.</p>
                </div>
              </div>
            </div>
          </section>
        ) : null}
      </main>
    </div>
  );
}
