"use client";

import { useState, useEffect, useCallback } from "react";

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

export default function Dashboard() {
  const [apiUrl, setApiUrl] = useState("http://localhost:3000");
  const [status, setStatus] = useState<StatusData | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"minters" | "holders" | "audit">("minters");
  const [minters, setMinters] = useState<Minter[]>([]);
  const [holders, setHolders] = useState<Holder[]>([]);
  const [auditLog, setAuditLog] = useState<AuditEvent[]>([]);
  const [tabLoading, setTabLoading] = useState(false);

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
    } catch (err) {
      setError(`Cannot connect to ${apiUrl}: ${(err as Error).message}`);
      setConnected(false);
    }
  }, [apiUrl]);

  const loadTab = useCallback(
    async (t: "minters" | "holders" | "audit") => {
      setTabLoading(true);
      try {
        const endpoints = {
          minters: "/api/v1/minters",
          holders: "/api/v1/holders",
          audit: "/api/v1/audit-log?limit=20",
        };
        const res = await fetch(`${apiUrl}${endpoints[t]}`, {
          signal: AbortSignal.timeout(8000),
        });
        const data = await res.json();
        if (t === "minters") setMinters(data.minters || []);
        if (t === "holders") setHolders(data.holders || []);
        if (t === "audit") setAuditLog(data.events || []);
      } catch {
        /* silently fail on tab load */
      }
      setTabLoading(false);
    },
    [apiUrl]
  );

  const connect = async () => {
    await fetchStatus();
    await loadTab(tab);
  };

  // Auto-refresh
  useEffect(() => {
    if (!connected) return;
    const interval = setInterval(fetchStatus, 10000);
    return () => clearInterval(interval);
  }, [connected, fetchStatus]);

  // Load tab data when tab changes
  useEffect(() => {
    if (connected) loadTab(tab);
  }, [tab, connected, loadTab]);

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
              {(["minters", "holders", "audit"] as const).map((t) => (
                <button
                  key={t}
                  className={`tab-btn ${tab === t ? "active" : ""}`}
                  onClick={() => setTab(t)}
                >
                  {t === "audit" ? "Audit Log" : t.charAt(0).toUpperCase() + t.slice(1)}
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
              ) : (
                <AuditTable events={auditLog} />
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
