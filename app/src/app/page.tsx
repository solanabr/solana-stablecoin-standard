"use client";

import { useState, useEffect } from "react";

interface StablecoinInfo {
  mint: string;
  name: string;
  symbol: string;
  decimals: number;
  preset: string;
  owner: string;
  masterMinter: string;
  pauser: string;
  blacklister: string;
  isPaused: boolean;
  totalMinted: string;
  totalBurned: string;
  enableTransferHook: boolean;
  enablePermanentDelegate: boolean;
  enableConfidentialTransfers: boolean;
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: "#1e293b",
      borderRadius: 12,
      padding: 24,
      border: "1px solid #334155",
    }}>
      <h2 style={{ margin: "0 0 16px 0", fontSize: 18, color: "#94a3b8" }}>{title}</h2>
      {children}
    </div>
  );
}

function StatCard({ label, value, color = "#e2e8f0" }: { label: string; value: string; color?: string }) {
  return (
    <div style={{
      background: "#0f172a",
      borderRadius: 8,
      padding: 16,
      textAlign: "center",
    }}>
      <div style={{ fontSize: 12, color: "#64748b", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: "bold", color }}>{value}</div>
    </div>
  );
}

function Badge({ text, active }: { text: string; active: boolean }) {
  return (
    <span style={{
      display: "inline-block",
      padding: "4px 12px",
      borderRadius: 9999,
      fontSize: 12,
      fontWeight: 600,
      background: active ? "#065f4620" : "#7f1d1d20",
      color: active ? "#4ade80" : "#f87171",
      border: `1px solid ${active ? "#4ade8040" : "#f8717140"}`,
      marginRight: 8,
    }}>
      {text}
    </span>
  );
}

export default function Dashboard() {
  const [mintAddress, setMintAddress] = useState("");
  const [rpcUrl, setRpcUrl] = useState("https://api.devnet.solana.com");
  const [config, setConfig] = useState<StablecoinInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const fetchConfig = async () => {
    if (!mintAddress) return;
    setLoading(true);
    setError("");

    try {
      const response = await fetch(`/api/config?mint=${mintAddress}&rpc=${encodeURIComponent(rpcUrl)}`);
      if (!response.ok) throw new Error(await response.text());
      const data = await response.json();
      setConfig(data);
    } catch (err: any) {
      setError(err.message || "Failed to fetch config");
      setConfig(null);
    } finally {
      setLoading(false);
    }
  };

  const totalSupply = config
    ? (BigInt(config.totalMinted) - BigInt(config.totalBurned)).toString()
    : "0";

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: 32 }}>
      <header style={{ textAlign: "center", marginBottom: 48 }}>
        <h1 style={{ fontSize: 32, margin: 0 }}>S&sup3; Dashboard</h1>
        <p style={{ color: "#64748b", margin: "8px 0 0" }}>Solana Stablecoin Standard</p>
      </header>

      <div style={{ display: "flex", gap: 12, marginBottom: 32 }}>
        <select
          value={rpcUrl}
          onChange={(e) => setRpcUrl(e.target.value)}
          style={{
            background: "#1e293b",
            color: "#e2e8f0",
            border: "1px solid #334155",
            borderRadius: 8,
            padding: "10px 12px",
            fontSize: 14,
          }}
        >
          <option value="https://api.devnet.solana.com">Devnet</option>
          <option value="https://api.mainnet-beta.solana.com">Mainnet</option>
          <option value="http://127.0.0.1:8899">Localnet</option>
        </select>
        <input
          type="text"
          placeholder="Enter mint address..."
          value={mintAddress}
          onChange={(e) => setMintAddress(e.target.value)}
          style={{
            flex: 1,
            background: "#1e293b",
            color: "#e2e8f0",
            border: "1px solid #334155",
            borderRadius: 8,
            padding: "10px 16px",
            fontSize: 14,
          }}
        />
        <button
          onClick={fetchConfig}
          disabled={loading || !mintAddress}
          style={{
            background: "#6366f1",
            color: "white",
            border: "none",
            borderRadius: 8,
            padding: "10px 24px",
            fontSize: 14,
            fontWeight: 600,
            cursor: loading ? "wait" : "pointer",
            opacity: loading || !mintAddress ? 0.5 : 1,
          }}
        >
          {loading ? "Loading..." : "Load"}
        </button>
      </div>

      {error && (
        <div style={{
          background: "#7f1d1d20",
          border: "1px solid #f8717140",
          borderRadius: 8,
          padding: 16,
          marginBottom: 24,
          color: "#f87171",
        }}>
          {error}
        </div>
      )}

      {config && (
        <>
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 16,
            marginBottom: 24,
          }}>
            <StatCard label="Total Supply" value={totalSupply} color="#6366f1" />
            <StatCard label="Total Minted" value={config.totalMinted} />
            <StatCard label="Total Burned" value={config.totalBurned} />
            <StatCard
              label="Status"
              value={config.isPaused ? "PAUSED" : "ACTIVE"}
              color={config.isPaused ? "#f87171" : "#4ade80"}
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
            <Card title="Token Info">
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <tbody>
                  {[
                    ["Name", config.name],
                    ["Symbol", config.symbol],
                    ["Decimals", config.decimals.toString()],
                    ["Preset", config.preset.toUpperCase()],
                    ["Mint", config.mint],
                  ].map(([label, value]) => (
                    <tr key={label} style={{ borderBottom: "1px solid #334155" }}>
                      <td style={{ padding: "8px 0", color: "#64748b", width: "30%" }}>{label}</td>
                      <td style={{ padding: "8px 0", fontFamily: "monospace", fontSize: 13, wordBreak: "break-all" }}>{value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>

            <Card title="Authorities">
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <tbody>
                  {[
                    ["Owner", config.owner],
                    ["Master Minter", config.masterMinter],
                    ["Pauser", config.pauser],
                    ["Blacklister", config.blacklister],
                  ].map(([label, value]) => (
                    <tr key={label} style={{ borderBottom: "1px solid #334155" }}>
                      <td style={{ padding: "8px 0", color: "#64748b", width: "30%" }}>{label}</td>
                      <td style={{ padding: "8px 0", fontFamily: "monospace", fontSize: 13, wordBreak: "break-all" }}>{value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </div>

          <Card title="Features">
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Badge text="Transfer Hook" active={config.enableTransferHook} />
              <Badge text="Permanent Delegate" active={config.enablePermanentDelegate} />
              <Badge text="Confidential Transfers" active={config.enableConfidentialTransfers} />
              <Badge text={config.isPaused ? "Paused" : "Active"} active={!config.isPaused} />
            </div>
          </Card>
        </>
      )}

      {!config && !error && (
        <div style={{ textAlign: "center", color: "#64748b", padding: 64 }}>
          Enter a mint address to view stablecoin details
        </div>
      )}
    </div>
  );
}
