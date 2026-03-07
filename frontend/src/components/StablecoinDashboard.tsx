"use client";
import { useState, useEffect } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";

interface Props {
  mintAddress: string;
  onBack: () => void;
}

interface MintStats {
  supply: string;
  decimals: number;
  holders: number;
}

export function StablecoinDashboard({ mintAddress, onBack }: Props) {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const [stats, setStats] = useState<MintStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"overview" | "mint" | "compliance">("overview");

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const mint = new PublicKey(mintAddress);
        const supply = await connection.getTokenSupply(mint);
        setStats({
          supply: supply.value.uiAmountString ?? "0",
          decimals: supply.value.decimals,
          holders: 0,
        });
      } catch {
        setStats(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [mintAddress, connection]);

  const tabStyle = (active: boolean) => ({
    padding: "8px 18px", borderRadius: 6, cursor: "pointer",
    background: active ? "#9945ff" : "transparent",
    color: active ? "#fff" : "#94a3b8",
    border: "none", fontSize: 14, fontWeight: active ? 600 : 400,
  });

  return (
    <div style={{ maxWidth: 800, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 24 }}>
        <button onClick={onBack} style={{
          background: "none", border: "1px solid #2d3748", color: "#94a3b8",
          padding: "6px 14px", borderRadius: 6, cursor: "pointer",
        }}>← Back</button>
        <div>
          <div style={{ fontWeight: 700, fontSize: 18 }}>Stablecoin Dashboard</div>
          <div style={{ color: "#64748b", fontSize: 12, fontFamily: "monospace" }}>{mintAddress}</div>
        </div>
      </div>

      {/* Stat cards */}
      <div style={{ display: "flex", gap: 16, marginBottom: 24, flexWrap: "wrap" }}>
        <StatCard label="Total Supply" value={loading ? "…" : (stats?.supply ?? "N/A")} color="#4ade80" />
        <StatCard label="Decimals" value={loading ? "…" : String(stats?.decimals ?? "N/A")} color="#60a5fa" />
        <StatCard label="Network" value="Devnet" color="#f59e0b" />
        <StatCard label="Standard" value="SSS-2" color="#9945ff" />
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 20, background: "#161b22", borderRadius: 8, padding: 4, width: "fit-content" }}>
        <button style={tabStyle(tab === "overview")} onClick={() => setTab("overview")}>Overview</button>
        <button style={tabStyle(tab === "mint")} onClick={() => setTab("mint")}>Mint / Burn</button>
        <button style={tabStyle(tab === "compliance")} onClick={() => setTab("compliance")}>Compliance</button>
      </div>

      {tab === "overview" && (
        <div style={{ background: "#161b22", borderRadius: 12, padding: 24 }}>
          <h3 style={{ marginBottom: 16, color: "#e2e8f0" }}>Quick Actions</h3>
          <p style={{ color: "#64748b", fontSize: 14, lineHeight: 1.7 }}>
            Use the tabs above to mint tokens, burn supply, or manage the compliance blacklist.
            <br />
            For CLI operations: <code style={{ color: "#9945ff" }}>sss-token status --mint {mintAddress.slice(0, 12)}…</code>
          </p>
        </div>
      )}

      {tab === "mint" && (
        <MintBurnPanel mintAddress={mintAddress} />
      )}

      {tab === "compliance" && (
        <CompliancePanel mintAddress={mintAddress} />
      )}
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{
      background: "#161b22", border: "1px solid #1e2a3a", borderRadius: 10,
      padding: "16px 20px", minWidth: 140,
    }}>
      <div style={{ color: "#64748b", fontSize: 12, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color }}>{value}</div>
    </div>
  );
}

function MintBurnPanel({ mintAddress }: { mintAddress: string }) {
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState<"mint" | "burn">("mint");

  const inputStyle = {
    width: "100%", padding: "10px 14px", background: "#1a1f2e",
    border: "1px solid #2d3748", borderRadius: 8, color: "#e2e8f0",
    fontSize: 14, outline: "none", marginTop: 6,
  };

  return (
    <div style={{ background: "#161b22", borderRadius: 12, padding: 24 }}>
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        <button
          style={{ ...inputStyle, width: "auto", cursor: "pointer", background: mode === "mint" ? "#166534" : "#1a1f2e", border: mode === "mint" ? "1px solid #4ade80" : "1px solid #2d3748" }}
          onClick={() => setMode("mint")}
        >Mint</button>
        <button
          style={{ ...inputStyle, width: "auto", cursor: "pointer", background: mode === "burn" ? "#7f1d1d" : "#1a1f2e", border: mode === "burn" ? "1px solid #f87171" : "1px solid #2d3748" }}
          onClick={() => setMode("burn")}
        >Burn</button>
      </div>

      <label style={{ display: "block", marginBottom: 16 }}>
        <span style={{ fontSize: 13, color: "#94a3b8" }}>Recipient address</span>
        <input style={inputStyle} placeholder="Wallet address" value={recipient} onChange={(e) => setRecipient(e.target.value)} />
      </label>
      <label style={{ display: "block", marginBottom: 20 }}>
        <span style={{ fontSize: 13, color: "#94a3b8" }}>Amount</span>
        <input style={inputStyle} placeholder="0.00" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </label>

      <button
        style={{
          padding: "10px 24px", background: mode === "mint" ? "#16a34a" : "#dc2626",
          color: "#fff", border: "none", borderRadius: 8, cursor: "pointer",
          fontSize: 14, fontWeight: 600,
        }}
        onClick={() => alert(`Use CLI: sss-token ${mode} --recipient ${recipient} --amount ${amount} --mint ${mintAddress}`)}
      >
        Preview {mode === "mint" ? "Mint" : "Burn"}
      </button>
      <p style={{ color: "#64748b", fontSize: 12, marginTop: 12 }}>
        Tip: For production use, call from the CLI with your authority keypair.
      </p>
    </div>
  );
}

function CompliancePanel({ mintAddress }: { mintAddress: string }) {
  const [address, setAddress] = useState("");
  const [reason, setReason] = useState("");

  const inputStyle = {
    width: "100%", padding: "10px 14px", background: "#1a1f2e",
    border: "1px solid #2d3748", borderRadius: 8, color: "#e2e8f0",
    fontSize: 14, outline: "none", marginTop: 6,
  };

  return (
    <div style={{ background: "#161b22", borderRadius: 12, padding: 24 }}>
      <h3 style={{ marginBottom: 16, color: "#fbbf24" }}>⚠ SSS-2 Compliance</h3>

      <label style={{ display: "block", marginBottom: 16 }}>
        <span style={{ fontSize: 13, color: "#94a3b8" }}>Address to blacklist</span>
        <input style={inputStyle} placeholder="Wallet address" value={address} onChange={(e) => setAddress(e.target.value)} />
      </label>
      <label style={{ display: "block", marginBottom: 20 }}>
        <span style={{ fontSize: 13, color: "#94a3b8" }}>Reason</span>
        <input style={inputStyle} placeholder="e.g. OFAC match" value={reason} onChange={(e) => setReason(e.target.value)} />
      </label>

      <button
        style={{
          padding: "10px 24px", background: "#b45309", color: "#fff",
          border: "none", borderRadius: 8, cursor: "pointer", fontSize: 14, fontWeight: 600,
        }}
        onClick={() => alert(`CLI: sss-token blacklist add --address ${address} --reason "${reason}" --mint ${mintAddress}`)}
      >
        Preview Blacklist Add
      </button>
    </div>
  );
}
