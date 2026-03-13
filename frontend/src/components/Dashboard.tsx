export default function Dashboard() {
  // Stub data - will be replaced with on-chain fetch
  const stablecoin = {
    name: "Regulated USD",
    symbol: "RUSD",
    supply: "1,250,000.00",
    totalMinted: "1,500,000.00",
    totalBurned: "250,000.00",
    paused: false,
    preset: "SSS-2",
    decimals: 6,
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-zinc-100">Dashboard</h1>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card
          title="Name"
          value={stablecoin.name}
          subtitle="Stablecoin"
        />
        <Card
          title="Symbol"
          value={stablecoin.symbol}
          subtitle="Ticker"
        />
        <Card
          title="Current Supply"
          value={stablecoin.supply}
          subtitle={`Total minted: ${stablecoin.totalMinted} • Burned: ${stablecoin.totalBurned}`}
        />
        <Card
          title="Preset"
          value={stablecoin.preset}
          subtitle="Token-2022"
        />
      </div>

      <div className="rounded-xl border border-zinc-700/50 bg-zinc-800/50 p-6">
        <h2 className="mb-4 text-lg font-medium text-zinc-100">Status</h2>
        <div className="flex flex-wrap gap-4">
          <StatusBadge
            label="Paused"
            value={stablecoin.paused ? "Yes" : "No"}
            active={!stablecoin.paused}
          />
          <StatusBadge
            label="Decimals"
            value={String(stablecoin.decimals)}
            active
          />
          <StatusBadge
            label="Compliance"
            value={stablecoin.preset === "SSS-2" ? "Enabled" : "N/A"}
            active={stablecoin.preset === "SSS-2"}
          />
        </div>
      </div>
    </div>
  );
}

function Card({
  title,
  value,
  subtitle,
}: {
  title: string;
  value: string;
  subtitle?: string;
}) {
  return (
    <div className="rounded-xl border border-zinc-700/50 bg-zinc-800/50 p-5 transition-colors hover:border-cyan-500/30">
      <p className="text-sm font-medium text-zinc-400">{title}</p>
      <p className="mt-1 text-xl font-semibold text-zinc-100">{value}</p>
      {subtitle && (
        <p className="mt-1 text-xs text-zinc-500">{subtitle}</p>
      )}
    </div>
  );
}

function StatusBadge({
  label,
  value,
  active,
}: {
  label: string;
  value: string;
  active: boolean;
}) {
  return (
    <div className="rounded-lg border border-zinc-700/50 bg-zinc-800/30 px-4 py-2">
      <span className="text-sm text-zinc-400">{label}: </span>
      <span
        className={
          active
            ? "font-medium text-emerald-400"
            : "font-medium text-amber-400"
        }
      >
        {value}
      </span>
    </div>
  );
}
