"use client";

import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { Shield, Coins, Lock } from "lucide-react";

export function ConnectScreen() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6">
      <div className="max-w-md w-full text-center">
        {/* Logo / Brand */}
        <div className="mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[var(--accent-muted)] mb-6">
            <Coins className="w-8 h-8 text-[var(--accent)]" />
          </div>
          <h1 className="text-3xl font-semibold text-[var(--text-primary)] tracking-tight mb-2">
            Stablecoin Standard
          </h1>
          <p className="text-[var(--text-secondary)] text-base leading-relaxed">
            Management dashboard for SSS-1 and SSS-2 stablecoins on Solana
          </p>
        </div>

        {/* Connect button */}
        <div className="mb-10">
          <WalletMultiButton
            style={{
              width: "100%",
              justifyContent: "center",
              height: "48px",
              borderRadius: "12px",
              backgroundColor: "var(--accent)",
              fontSize: "15px",
              fontWeight: 500,
            }}
          />
        </div>

        {/* Feature highlights */}
        <div className="grid grid-cols-1 gap-3">
          <FeatureRow
            icon={<Shield className="w-4 h-4" />}
            text="Role-based access control with multi-tier authority"
          />
          <FeatureRow
            icon={<Coins className="w-4 h-4" />}
            text="Quota-managed minting and on-chain audit trails"
          />
          <FeatureRow
            icon={<Lock className="w-4 h-4" />}
            text="SSS-2 compliance with transfer hooks and blacklists"
          />
        </div>

        {/* Footer */}
        <div className="mt-12 pt-6 border-t border-[var(--border)]">
          <p className="text-xs text-[var(--text-muted)]">
            Built on Solana &middot; Token-2022 &middot; Devnet
          </p>
        </div>
      </div>
    </div>
  );
}

function FeatureRow({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)] text-left">
      <span className="text-[var(--text-muted)] shrink-0">{icon}</span>
      <span className="text-sm text-[var(--text-secondary)]">{text}</span>
    </div>
  );
}
