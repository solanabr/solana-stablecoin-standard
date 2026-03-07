"use client";
import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { CreateStablecoin } from "@/components/CreateStablecoin";
import { StablecoinDashboard } from "@/components/StablecoinDashboard";

export default function Home() {
  const { connected } = useWallet();
  const [mintAddress, setMintAddress] = useState<string | null>(null);

  return (
    <main style={{ minHeight: "100vh", padding: "24px" }}>
      {/* Nav */}
      <nav style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        marginBottom: 32, paddingBottom: 16, borderBottom: "1px solid #1e2a3a"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 24, fontWeight: 700, color: "#9945ff" }}>◎ SSS</span>
          <span style={{ color: "#64748b", fontSize: 14 }}>Solana Stablecoin Standard</span>
        </div>
        <WalletMultiButton style={{ background: "#9945ff" }} />
      </nav>

      {!connected ? (
        <div style={{ textAlign: "center", marginTop: 80 }}>
          <h1 style={{ fontSize: 36, fontWeight: 700, marginBottom: 16 }}>
            Launch Your Stablecoin on Solana
          </h1>
          <p style={{ color: "#64748b", marginBottom: 32, fontSize: 16 }}>
            Deploy SSS-1 (minimal) or SSS-2 (compliant) stablecoins using Token-2022.<br />
            Connect your wallet to get started.
          </p>
          <div style={{ display: "flex", gap: 24, justifyContent: "center", flexWrap: "wrap" }}>
            <FeatureCard
              icon="⚡"
              title="SSS-1 Minimal"
              desc="Metadata + freeze authority. Simple, fast, no overhead."
            />
            <FeatureCard
              icon="🔒"
              title="SSS-2 Compliant"
              desc="Blacklist + seize + transfer hook. USDC/USDT class."
            />
            <FeatureCard
              icon="🔮"
              title="SSS-3 Private"
              desc="Confidential transfers + allowlists. Coming soon."
            />
          </div>
        </div>
      ) : mintAddress ? (
        <StablecoinDashboard
          mintAddress={mintAddress}
          onBack={() => setMintAddress(null)}
        />
      ) : (
        <CreateStablecoin onCreated={setMintAddress} />
      )}
    </main>
  );
}

function FeatureCard({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return (
    <div style={{
      background: "#161b22", border: "1px solid #1e2a3a", borderRadius: 12,
      padding: "24px 28px", maxWidth: 220, textAlign: "left"
    }}>
      <div style={{ fontSize: 28, marginBottom: 10 }}>{icon}</div>
      <div style={{ fontWeight: 600, marginBottom: 6 }}>{title}</div>
      <div style={{ color: "#64748b", fontSize: 14, lineHeight: 1.5 }}>{desc}</div>
    </div>
  );
}
