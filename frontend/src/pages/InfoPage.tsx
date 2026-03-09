import React from "react";
import { useStablecoinContext } from "../contexts/StablecoinContext";
import { AddressDisplay } from "../components/shared/AddressDisplay";
import { LoadingSpinner } from "../components/shared/LoadingSpinner";
import {
  presetLabel,
  formatTokenAmount,
  formatTokenCompact,
  explorerAddressUrl,
} from "../utils/format";

const DECIMALS = 6;

// ── Info row ─────────────────────────────────────────────────────────────────

function InfoRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 border-b border-surface-border/50 last:border-b-0">
      <dt className="text-sm text-slate-500 flex-shrink-0 w-40">{label}</dt>
      <dd className="text-sm text-slate-200 text-right min-w-0">{children}</dd>
    </div>
  );
}

// ── Supply bar ────────────────────────────────────────────────────────────────

function SupplyBar({
  minted,
  burned,
  seized,
}: {
  minted: string;
  burned: string;
  seized: string;
}) {
  const m = Number(minted) || 0;
  const b = Number(burned) || 0;
  const s = Number(seized) || 0;
  const total = m || 1;
  const burnPct = Math.min((b / total) * 100, 100);
  const seizePct = Math.min((s / total) * 100, 100 - burnPct);
  const circulatingPct = Math.max(100 - burnPct - seizePct, 0);

  return (
    <div className="space-y-2">
      <div className="flex h-3 rounded-full overflow-hidden bg-surface">
        <div
          className="bg-indigo-500 transition-all duration-500"
          style={{ width: `${circulatingPct}%` }}
          title={`Circulating: ${circulatingPct.toFixed(1)}%`}
        />
        <div
          className="bg-red-500 transition-all duration-500"
          style={{ width: `${burnPct}%` }}
          title={`Burned: ${burnPct.toFixed(1)}%`}
        />
        <div
          className="bg-amber-500 transition-all duration-500"
          style={{ width: `${seizePct}%` }}
          title={`Seized: ${seizePct.toFixed(1)}%`}
        />
      </div>
      <div className="flex gap-4 text-xs text-slate-500">
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-indigo-500" />
          Circulating ({circulatingPct.toFixed(1)}%)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-red-500" />
          Burned ({burnPct.toFixed(1)}%)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-amber-500" />
          Seized ({seizePct.toFixed(1)}%)
        </span>
      </div>
    </div>
  );
}

// ── Preset description ────────────────────────────────────────────────────────

const PRESET_DESCRIPTIONS: Record<number, { features: string[]; color: string }> = {
  0: {
    color: "text-blue-400",
    features: [
      "On-chain metadata",
      "Role-based access (5 roles)",
      "Pause / unpause",
      "Minter allowance system",
    ],
  },
  1: {
    color: "text-purple-400",
    features: [
      "All SSS-1 features",
      "PermanentDelegate",
      "DefaultAccountState (frozen)",
      "TransferHook blacklist enforcement",
      "Asset seizure (atomic burn+mint)",
      "Freeze / thaw accounts",
    ],
  },
  2: {
    color: "text-pink-400",
    features: [
      "All SSS-2 features",
      "ConfidentialTransferMint extension (PoC)",
      "Encrypted transfer amounts",
      "Auditor ElGamal key support",
    ],
  },
};

// ── Page ──────────────────────────────────────────────────────────────────────

export default function InfoPage() {
  const { info, infoLoading, infoError, mintAddress } = useStablecoinContext();

  if (!mintAddress) {
    return (
      <div className="card p-8 text-center text-slate-500 text-sm">
        Select a mint address in the header to view token info.
      </div>
    );
  }

  if (infoLoading) return <LoadingSpinner centered />;

  if (infoError) {
    return <div className="card p-6 text-red-400 text-sm">{infoError}</div>;
  }

  if (!info) return null;

  const presetInfo = PRESET_DESCRIPTIONS[info.preset];

  const totalMintedRaw  = info.totalMinted.toString();
  const totalBurnedRaw  = info.totalBurned.toString();
  const totalSeizedRaw  = info.totalSeized.toString();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white">Token Info</h1>
        <p className="text-sm text-slate-500 mt-1">
          On-chain configuration and supply statistics for this stablecoin.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* On-chain config */}
        <div className="card p-5">
          <h2 className="section-title mb-4">On-Chain Configuration</h2>
          <dl>
            <InfoRow label="Mint">
              <AddressDisplay address={info.mint.toBase58()} showExplorer />
            </InfoRow>
            <InfoRow label="Admin">
              <AddressDisplay address={info.admin.toBase58()} showExplorer />
            </InfoRow>
            {info.pendingAdmin.toBase58() !== "11111111111111111111111111111111" && (
              <InfoRow label="Pending Admin">
                <AddressDisplay address={info.pendingAdmin.toBase58()} showExplorer />
              </InfoRow>
            )}
            <InfoRow label="Preset">
              <span className={`font-medium ${presetInfo?.color ?? "text-slate-300"}`}>
                {presetLabel(info.preset)}
              </span>
            </InfoRow>
            <InfoRow label="Status">
              <span className={`badge ${info.paused ? "badge-yellow" : "badge-green"}`}>
                {info.paused ? "Paused" : "Active"}
              </span>
            </InfoRow>
            {info.treasury && (
              <InfoRow label="Treasury">
                <AddressDisplay address={info.treasury.toBase58()} showExplorer />
              </InfoRow>
            )}
            {info.transferHookProgram && (
              <InfoRow label="Transfer Hook">
                <AddressDisplay address={info.transferHookProgram.toBase58()} showExplorer />
              </InfoRow>
            )}
          </dl>
        </div>

        {/* Preset features */}
        <div className="card p-5">
          <h2 className="section-title mb-1">{presetLabel(info.preset)}</h2>
          <p className="text-xs text-slate-500 mb-4">Enabled features for this preset</p>
          <ul className="space-y-2">
            {presetInfo?.features.map((f) => (
              <li key={f} className="flex items-center gap-2 text-sm text-slate-300">
                <svg
                  className="w-4 h-4 text-emerald-400 flex-shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2.5}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                {f}
              </li>
            ))}
          </ul>

          <div className="mt-5 pt-4 border-t border-surface-border">
            <p className="text-xs text-slate-500 mb-2">Explorer links</p>
            <div className="flex flex-wrap gap-2">
              <a
                href={explorerAddressUrl(info.mint.toBase58())}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-indigo-400 hover:text-indigo-300 underline"
              >
                Mint account →
              </a>
              <a
                href={explorerAddressUrl(info.admin.toBase58())}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-indigo-400 hover:text-indigo-300 underline"
              >
                Admin wallet →
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Supply stats */}
      <div className="card p-5 space-y-4">
        <h2 className="section-title">Supply Statistics</h2>
        <SupplyBar
          minted={totalMintedRaw}
          burned={totalBurnedRaw}
          seized={totalSeizedRaw}
        />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
          <div className="space-y-1">
            <p className="stat-label">Total Minted</p>
            <p className="stat-value text-indigo-400">
              {formatTokenCompact(info.totalMinted, DECIMALS)}
            </p>
            <p className="text-xs text-slate-600 font-mono">
              {formatTokenAmount(info.totalMinted, DECIMALS)}
            </p>
          </div>
          <div className="space-y-1">
            <p className="stat-label">Total Burned</p>
            <p className="stat-value text-red-400">
              {formatTokenCompact(info.totalBurned, DECIMALS)}
            </p>
            <p className="text-xs text-slate-600 font-mono">
              {formatTokenAmount(info.totalBurned, DECIMALS)}
            </p>
          </div>
          <div className="space-y-1">
            <p className="stat-label">Total Seized</p>
            <p className="stat-value text-amber-400">
              {formatTokenCompact(info.totalSeized, DECIMALS)}
            </p>
            <p className="text-xs text-slate-600 font-mono">
              {formatTokenAmount(info.totalSeized, DECIMALS)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
