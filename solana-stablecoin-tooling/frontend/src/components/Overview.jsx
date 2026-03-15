import React from 'react';
import { explorerUrl, PRESETS } from '../config';

function StatCard({ label, value, sub, accent }) {
  return (
    <div className="card p-5 animate-slide-up">
      <p className="label">{label}</p>
      <p className={`text-2xl font-semibold font-mono tracking-tight mt-1 ${accent || 'text-white'}`}>
        {value}
      </p>
      {sub && <p className="text-xs text-gray-500 mt-1 font-mono truncate">{sub}</p>}
    </div>
  );
}

function FeaturePill({ name, enabled }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${
      enabled
        ? 'bg-emerald-900/30 text-emerald-400 border border-emerald-800/30'
        : 'bg-gray-800/50 text-gray-600 border border-gray-800/30'
    }`}>
      <span className={`w-1.5 h-1.5 rounded-full ${enabled ? 'bg-emerald-400' : 'bg-gray-700'}`} />
      {name}
    </span>
  );
}

export default function Overview({ config, mintInfo }) {
  if (!config) {
    return (
      <div className="text-center py-20 text-gray-500">
        <p className="text-4xl mb-3">◎</p>
        <p>Enter a mint address above to view stablecoin details</p>
      </div>
    );
  }

  const presetInfo = PRESETS[config.preset] || PRESETS[2];
  const supply = mintInfo ? (mintInfo.supply / Math.pow(10, config.decimals)).toLocaleString() : '—';
  const minted = (config.totalMinted / Math.pow(10, config.decimals)).toLocaleString();
  const burned = (config.totalBurned / Math.pow(10, config.decimals)).toLocaleString();

  const features = [
    { name: 'Mint', enabled: config.features.canMint },
    { name: 'Burn', enabled: config.features.canBurn },
    { name: 'Freeze', enabled: config.features.canFreeze },
    { name: 'Pause', enabled: config.features.canPause },
    { name: 'Roles', enabled: config.features.hasRoles },
    { name: 'Blacklist', enabled: config.features.hasBlacklist },
    { name: 'Seize', enabled: config.features.hasSeize },
    { name: 'Transfer Hook', enabled: config.features.hasTransferHook },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Status banner */}
      <div className={`card p-4 flex items-center justify-between ${
        config.paused ? 'border-red-800/40 bg-red-950/20' : ''
      }`}>
        <div className="flex items-center gap-3">
          <span className={`badge-${presetInfo.color}`}>{presetInfo.name}</span>
          <span className="text-sm text-gray-400">{presetInfo.label}</span>
        </div>
        <div className="flex items-center gap-2">
          {config.paused ? (
            <span className="badge-red">⏸ PAUSED</span>
          ) : (
            <span className="badge-green">● Active</span>
          )}
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Circulating Supply"
          value={supply}
          accent="text-sol-400"
        />
        <StatCard
          label="Total Minted"
          value={minted}
        />
        <StatCard
          label="Total Burned"
          value={burned}
        />
        <StatCard
          label="Decimals"
          value={config.decimals}
        />
      </div>

      {/* Authority & Mint info */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card p-5">
          <p className="label mb-3">Authority</p>
          <a
            href={explorerUrl(config.authority.toBase58())}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-sm text-sol-400 hover:text-sol-300 break-all transition-colors"
          >
            {config.authority.toBase58()}
          </a>
        </div>
        <div className="card p-5">
          <p className="label mb-3">Mint Address</p>
          <a
            href={explorerUrl(config.mint.toBase58())}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-sm text-sol-400 hover:text-sol-300 break-all transition-colors"
          >
            {config.mint.toBase58()}
          </a>
        </div>
      </div>

      {/* Features */}
      <div className="card p-5">
        <p className="label mb-3">Features</p>
        <div className="flex flex-wrap gap-2">
          {features.map((f) => (
            <FeaturePill key={f.name} name={f.name} enabled={f.enabled} />
          ))}
        </div>
      </div>
    </div>
  );
}
