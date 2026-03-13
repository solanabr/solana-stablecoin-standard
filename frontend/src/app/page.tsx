"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Sparkline from "../components/Sparkline";

// ── Types ───────────────────────────────────────────────────────────────

interface StatusData {
  name: string;
  symbol: string;
  decimals: number;
  mint: string;
  authority: string;
  isPaused: boolean;
  supply: { total: string; minted: string; burned: string };
  features: {
    permanentDelegate: boolean;
    transferHook: boolean;
    confidentialTransfers: boolean;
    defaultAccountFrozen: boolean;
  };
  roles: {
    masterAuthority: string;
    pauser: string;
    blacklister: string;
    seizer: string;
    minterCount: number;
    burnerCount: number;
  };
}

interface Minter {
  address: string;
  quota: string;
  minted: string;
  remaining: string;
}

interface Holder {
  address: string;
  amount: string;
}

interface AuditEvent {
  signature: string;
  blockTime: string | null;
  status: "success" | "failed";
  memo: string | null;
}

interface BlacklistEntry {
  address: string;
  pda: string;
}

interface LiveEvent {
  type: string;
  data: {
    signature?: string;
    status?: string;
    blockTime?: string;
    memo?: string;
  };
  receivedAt: string;
}

// ── Helpers ─────────────────────────────────────────────────────────────

function shortKey(key: string): string {
  if (!key || key.length < 10) return key || "—";
  return `${key.slice(0, 6)}…${key.slice(-4)}`;
}

function formatAmount(raw: string | number, decimals = 6): string {
  const n = Number(raw) / 10 ** decimals;
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// ── Dashboard ───────────────────────────────────────────────────────────

type TabKey = "minters" | "holders" | "audit" | "blacklist";

export default function Dashboard() {
  const [apiUrl, setApiUrl] = useState("http://localhost:3000");
  const [status, setStatus] = useState<StatusData | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>("minters");
  const [minters, setMinters] = useState<Minter[]>([]);
  const [holders, setHolders] = useState<Holder[]>([]);
  const [auditLog, setAuditLog] = useState<AuditEvent[]>([]);
  const [blacklist, setBlacklist] = useState<BlacklistEntry[]>([]);
  const [tabLoading, setTabLoading] = useState(false);
  const [supplyHistory, setSupplyHistory] = useState<number[]>([]);
  const [liveEvents, setLiveEvents] = useState<LiveEvent[]>([]);
  const wsRef = useRef<WebSocket | null>(null);

  // Saved mints for multi-mint support
  const [savedMints, setSavedMints] = useState<string[]>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("sss-saved-mints");
      return saved ? JSON.parse(saved) : [];
    }
    return [];
  });

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`${apiUrl}/api/v1/status`, {
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      setStatus(data);
      setConnected(true);
      setError(null);

      // Save mint to list
      if (data.mint && !savedMints.includes(data.mint)) {
        const updated = [...savedMints, data.mint];
        setSavedMints(updated);
        localStorage.setItem("sss-saved-mints", JSON.stringify(updated));
      }
    } catch (err) {
      setError(`Cannot connect to ${apiUrl}: ${(err as Error).message}`);
      setConnected(false);
    }
  }, [apiUrl, savedMints]);

  const fetchSupplyHistory = useCallback(async () => {
    try {
      const res = await fetch(`${apiUrl}/api/v1/supply/history`, {
        signal: AbortSignal.timeout(5000),
      });
      const { snapshots } = await res.json();
      setSupplyHistory(snapshots.map((s: { supply: number }) => s.supply));
    } catch { /* ignore */ }
  }, [apiUrl]);

  const loadTab = useCallback(
    async (t: TabKey) => {
      setTabLoading(true);
      try {
        const endpoints: Record<TabKey, string> = {
          minters: "/api/v1/minters",
          holders: "/api/v1/holders",
          audit: "/api/v1/audit-log?limit=20",
          blacklist: "/api/v1/blacklist",
        };
        const res = await fetch(`${apiUrl}${endpoints[t]}`, {
          signal: AbortSignal.timeout(8000),
        });
        const data = await res.json();
        if (t === "minters") setMinters(data.minters || []);
        if (t === "holders") setHolders(data.holders || []);
        if (t === "audit") setAuditLog(data.events || []);
        if (t === "blacklist") setBlacklist(data.entries || []);
      } catch {
        /* silently fail on tab load */
      }
      setTabLoading(false);
    },
    [apiUrl]
  );

  // Connect WebSocket
  const connectWs = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
    }

    const wsUrl = apiUrl.replace(/^http/, "ws") + "/ws";
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data);
        setLiveEvents((prev) => [
          { ...parsed, receivedAt: new Date().toISOString() },
          ...prev.slice(0, 49),
        ]);
      } catch { /* ignore parse errors */ }
    };

    ws.onclose = () => {
      // Auto-reconnect after 3s
      setTimeout(() => {
        if (connected) connectWs();
      }, 3000);
    };
  }, [apiUrl, connected]);

  const connect = async () => {
    await fetchStatus();
    await loadTab(tab);
    await fetchSupplyHistory();
    connectWs();
  };

  // Auto-refresh
  useEffect(() => {
    if (!connected) return;
    const interval = setInterval(() => {
      fetchStatus();
      fetchSupplyHistory();
    }, 10000);
    return () => clearInterval(interval);
  }, [connected, fetchStatus, fetchSupplyHistory]);

  // Load tab data when tab changes
  useEffect(() => {
    if (connected) loadTab(tab);
  }, [tab, connected, loadTab]);

  // Cleanup WebSocket
  useEffect(() => {
    return () => {
      if (wsRef.current) wsRef.current.close();
    };
  }, []);

  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <div className="header-left">
          <div className="logo">⬡</div>
          <h1>SSS Dashboard</h1>
          <span className="badge">Devnet</span>
        </div>
        <div className="header-right">
          <div className={`connection-dot ${connected ? "connected" : ""}`} />
          <input
            type="text"
            className="url-input"
            value={apiUrl}
            onChange={(e) => setApiUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && connect()}
            placeholder="Backend URL"
          />
          <button className="btn btn-primary" onClick={connect}>
            Connect
          </button>
        </div>
      </header>

      {/* Saved Mints Dropdown */}
      {savedMints.length > 0 && (
        <div className="mint-selector">
          <span className="mint-label">Saved Mints:</span>
          {savedMints.map((m) => (
            <button
              key={m}
              className={`mint-chip ${status?.mint === m ? "active" : ""}`}
              title={m}
            >
              {shortKey(m)}
            </button>
          ))}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="error-banner">
          <span>{error}</span>
          <button className="error-close" onClick={() => setError(null)}>
            ×
          </button>
        </div>
      )}

      {/* Connected Dashboard */}
      {status ? (
        <>
          {/* Token Header */}
          <section className="token-header">
            <div className="token-info">
              <h2>{status.name}</h2>
              <span className="token-symbol">{status.symbol}</span>
              <span
                className={`status-pill ${status.isPaused ? "paused" : "active"}`}
              >
                {status.isPaused ? "Paused" : "Active"}
              </span>
            </div>
            <div className="token-mint">Mint: {status.mint}</div>
          </section>

          {/* Stats Grid */}
          <section className="stats-grid">
            <div className="stat-card">
              <div className="stat-label">Net Supply</div>
              <div className="stat-value">
                {formatAmount(status.supply.total, status.decimals)}
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Total Minted</div>
              <div className="stat-value mint">
                {formatAmount(status.supply.minted, status.decimals)}
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Total Burned</div>
              <div className="stat-value burn">
                {formatAmount(status.supply.burned, status.decimals)}
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Minters</div>
              <div className="stat-value">{status.roles.minterCount}</div>
            </div>
          </section>

          {/* Supply Sparkline */}
          <section className="sparkline-section">
            <div className="panel">
              <h3 className="panel-title">Supply History</h3>
              <Sparkline data={supplyHistory} width={500} height={80} />
            </div>
          </section>

          {/* Live Events */}
          {liveEvents.length > 0 && (
            <section className="live-events">
              <div className="live-header">
                <span className="live-dot" />
                <span className="live-label">Live Events</span>
              </div>
              <div className="event-ticker">
                {liveEvents.slice(0, 5).map((e, i) => (
                  <div key={i} className="event-item">
                    <span className={`event-badge ${e.type}`}>{e.type}</span>
                    {e.data.signature && (
                      <span className="event-sig">{shortKey(e.data.signature)}</span>
                    )}
                    <span className="event-time">
                      {new Date(e.receivedAt).toLocaleTimeString()}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Features & Roles */}
          <section className="details-section">
            <div className="panel">
              <h3 className="panel-title">Features</h3>
              <div className="feature-grid">
                {[
                  { name: "Permanent Delegate", on: status.features.permanentDelegate },
                  { name: "Transfer Hook", on: status.features.transferHook },
                  { name: "Confidential TX", on: status.features.confidentialTransfers },
                  { name: "Default Frozen", on: status.features.defaultAccountFrozen },
                ].map((f) => (
                  <div key={f.name} className="feature-item">
                    <span className={`dot ${f.on ? "on" : "off"}`} />
                    <span>{f.name}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="panel">
              <h3 className="panel-title">Roles</h3>
              <div className="role-list">
                {[
                  { name: "Authority", value: status.roles.masterAuthority },
                  { name: "Pauser", value: status.roles.pauser },
                  { name: "Blacklister", value: status.roles.blacklister },
                  { name: "Seizer", value: status.roles.seizer },
                ].map((r) => (
                  <div key={r.name} className="role-item">
                    <span className="role-name">{r.name}</span>
                    <span className="role-value" title={r.value}>
                      {shortKey(r.value)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Tabs */}
          <section className="tab-section">
            <div className="tab-bar">
              {(["minters", "holders", "audit", "blacklist"] as const).map((t) => (
                <button
                  key={t}
                  className={`tab-btn ${tab === t ? "active" : ""}`}
                  onClick={() => setTab(t)}
                >
                  {t === "audit"
                    ? "Audit Log"
                    : t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
            <div className="tab-content">
              {tabLoading ? (
                <div className="loading">Loading...</div>
              ) : tab === "minters" ? (
                <MinterTable minters={minters} decimals={status.decimals} />
              ) : tab === "holders" ? (
                <HolderTable holders={holders} decimals={status.decimals} />
              ) : tab === "audit" ? (
                <AuditTable events={auditLog} />
              ) : (
                <BlacklistTable entries={blacklist} />
              )}
            </div>
          </section>
        </>
      ) : (
        <section className="empty-state">
          <div className="empty-icon">⬡</div>
          <h2>Solana Stablecoin Standard</h2>
          <p>Connect to your SSS backend to view the stablecoin dashboard.</p>
          <p className="dim">
            Start the backend: <code>cd backend && pnpm dev</code>
          </p>
        </section>
      )}
    </div>
  );
}

// ── Sub-Components ──────────────────────────────────────────────────────

function MinterTable({ minters, decimals }: { minters: Minter[]; decimals: number }) {
  if (minters.length === 0)
    return (
      <table className="data-table">
        <tbody>
          <tr><td className="empty-row" colSpan={4}>No minters configured</td></tr>
        </tbody>
      </table>
    );

  return (
    <table className="data-table">
      <thead>
        <tr>
          <th>Address</th><th>Quota</th><th>Minted</th><th>Remaining</th>
        </tr>
      </thead>
      <tbody>
        {minters.map((m) => (
          <tr key={m.address}>
            <td title={m.address}>{shortKey(m.address)}</td>
            <td>{formatAmount(m.quota, decimals)}</td>
            <td>{formatAmount(m.minted, decimals)}</td>
            <td>{formatAmount(m.remaining, decimals)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function HolderTable({ holders, decimals }: { holders: Holder[]; decimals: number }) {
  if (holders.length === 0)
    return (
      <table className="data-table">
        <tbody>
          <tr><td className="empty-row" colSpan={2}>No holders found</td></tr>
        </tbody>
      </table>
    );

  return (
    <table className="data-table">
      <thead>
        <tr><th>Address</th><th>Balance</th></tr>
      </thead>
      <tbody>
        {holders.map((h) => (
          <tr key={h.address}>
            <td title={h.address}>{shortKey(h.address)}</td>
            <td>{formatAmount(h.amount, decimals)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function AuditTable({ events }: { events: AuditEvent[] }) {
  if (events.length === 0)
    return (
      <table className="data-table">
        <tbody>
          <tr><td className="empty-row" colSpan={3}>No events found</td></tr>
        </tbody>
      </table>
    );

  return (
    <table className="data-table">
      <thead>
        <tr><th>Signature</th><th>Time</th><th>Status</th></tr>
      </thead>
      <tbody>
        {events.map((e) => (
          <tr key={e.signature}>
            <td title={e.signature}>{shortKey(e.signature)}</td>
            <td>{e.blockTime ? new Date(e.blockTime).toLocaleTimeString() : "—"}</td>
            <td style={{ color: e.status === "success" ? "var(--green)" : "var(--red)" }}>
              {e.status}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function BlacklistTable({ entries }: { entries: BlacklistEntry[] }) {
  if (entries.length === 0)
    return (
      <table className="data-table">
        <tbody>
          <tr><td className="empty-row" colSpan={2}>No blacklisted addresses</td></tr>
        </tbody>
      </table>
    );

  return (
    <table className="data-table">
      <thead>
        <tr><th>Address</th><th>PDA</th></tr>
      </thead>
      <tbody>
        {entries.map((e) => (
          <tr key={e.address}>
            <td title={e.address}>{shortKey(e.address)}</td>
            <td title={e.pda} className="pda-cell">{shortKey(e.pda)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
