"use client";

export default function TUIPreview() {
  const cyan = "#67e8f9";
  const yellow = "#fbbf24";
  const green = "#4ade80";
  const red = "#f87171";
  const dim = "#64748b";
  const white = "#e2e8f0";
  const bg = "#0c0c0c";
  const border = "#334155";

  const boxStyle = (color: string) => ({
    border: `1px solid ${color}`,
    borderRadius: 2,
    padding: "8px 12px",
    marginBottom: 4,
  });

  const row = (label: string, value: string) => (
    <div key={label} style={{ display: "flex", borderBottom: `1px solid ${border}`, padding: "3px 0" }}>
      <span style={{ color: dim, width: 180, flexShrink: 0 }}>{label}</span>
      <span style={{ color: white, wordBreak: "break-all" }}>{value}</span>
    </div>
  );

  return (
    <div style={{
      background: bg,
      color: white,
      fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', monospace",
      fontSize: 13,
      lineHeight: 1.5,
      padding: 16,
      minHeight: "100vh",
      maxWidth: 900,
      margin: "0 auto",
    }}>
      {/* Title */}
      <div style={{ ...boxStyle(dim), textAlign: "center" }}>
        <span style={{ color: cyan, fontWeight: "bold", fontSize: 15 }}>
          S³ Terminal Dashboard
        </span>
      </div>

      {/* Tabs */}
      <div style={{ ...boxStyle(dim), display: "flex", gap: 16 }}>
        <span style={{ color: dim }}> Navigation </span>
        <span style={{ color: yellow, fontWeight: "bold" }}> Overview </span>
        <span style={{ color: dim }}>|</span>
        <span style={{ color: dim }}> Minters </span>
        <span style={{ color: dim }}>|</span>
        <span style={{ color: dim }}> Blacklist </span>
        <span style={{ color: dim }}>|</span>
        <span style={{ color: dim }}> Events </span>
      </div>

      {/* Content - Overview */}
      <div style={{ ...boxStyle(cyan) }}>
        <div style={{ color: cyan, marginBottom: 8 }}> Overview </div>

        {/* Stats row */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 12 }}>
          {[
            { label: "Supply", value: "1000000", color: cyan },
            { label: "Minted", value: "1000000", color: green },
            { label: "Burned", value: "0", color: red },
            { label: "Status", value: "ACTIVE", color: green },
          ].map((s) => (
            <div key={s.label} style={{
              border: `1px solid ${dim}`,
              padding: "6px 8px",
              textAlign: "center",
              borderRadius: 2,
            }}>
              <div style={{ color: dim, fontSize: 11 }}>{s.label}</div>
              <div style={{ color: s.color, fontWeight: "bold", fontSize: 15 }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Details */}
        <div style={{ border: `1px solid ${dim}`, padding: "8px 12px", borderRadius: 2 }}>
          <div style={{ color: dim, marginBottom: 6 }}> Details </div>
          {row("Name", "S³ Dollar")}
          {row("Symbol", "S3D")}
          {row("Decimals", "6")}
          {row("Preset", "SSS-1")}
          {row("Mint", "FYmzy2qEp2FcnhnoY99P3btFAB9rCvD1rZSFy4tfDbxt")}
          {row("Owner", "DcmdMWPPwNtofEMRVWrtZAswyBgpauKiDc4b4sHtJt7h")}
          {row("Master Minter", "DcmdMWPPwNtofEMRVWrtZAswyBgpauKiDc4b4sHtJt7h")}
          {row("Pauser", "DcmdMWPPwNtofEMRVWrtZAswyBgpauKiDc4b4sHtJt7h")}
          {row("Blacklister", "DcmdMWPPwNtofEMRVWrtZAswyBgpauKiDc4b4sHtJt7h")}
          {row("Transfer Hook", "Disabled")}
          {row("Permanent Delegate", "Disabled")}
          {row("Confidential Transfers", "Disabled")}
        </div>
      </div>

      {/* Status bar */}
      <div style={{
        ...boxStyle(dim),
        background: "#1e293b",
        color: white,
        fontSize: 12,
      }}>
        Loaded config for FYmzy2qE | q: quit | Tab: switch | e: enter mint | r: refresh
      </div>
    </div>
  );
}
