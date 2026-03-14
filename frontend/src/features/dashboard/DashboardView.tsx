import { Activity, CheckCircle2, ExternalLink, Server } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { DEVNET_PROGRAM_IDS } from '../../app/constants';
import { explorerUrl, formatBigint } from '../../lib/format';
import { useApp } from '../../state/AppContext';
import { CreateFlow } from '../create/CreateFlow';

export function DashboardView() {
  const { summary, setActiveTab, environment, rpcUrl, clearSession } = useApp();

  if (!summary) {
    return <CreateFlow />;
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h1 className="flex items-center gap-3 text-3xl font-bold text-white">
            {summary.name}
            <span className="font-mono text-xl font-medium text-zinc-400">({summary.symbol})</span>
            {summary.paused ? <Badge variant="warning">Paused</Badge> : null}
          </h1>
          <div className="mt-2 flex items-center gap-2 rounded-lg border border-white/5 bg-white/5 px-3 py-1.5 font-mono text-sm text-zinc-400">
            <span className="truncate">Mint: {summary.address}</span>
            <a
              href={explorerUrl(summary.address, 'address', environment, rpcUrl)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-emerald-400 hover:text-emerald-300"
            >
              <span>View on Explorer</span>
              <ExternalLink className="h-4 w-4" />
            </a>
          </div>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" onClick={clearSession}>
            New Deployment
          </Button>
          <Button variant="secondary" onClick={() => setActiveTab('operations')}>
            Open Operations
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Total Supply" value={formatBigint(summary.supply)} accent="emerald" />
        <MetricCard label="Standard" value={summary.preset} accent="blue" />
        <MetricCard
          label="Compliance"
          value={summary.complianceEnabled ? 'Enabled' : 'Disabled'}
          accent={summary.complianceEnabled ? 'amber' : 'neutral'}
        />
        <MetricCard
          label="Transfer Hook"
          value={summary.transferHookEnabled ? 'Active' : 'Inactive'}
          accent={summary.transferHookEnabled ? 'indigo' : 'neutral'}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card title="Devnet Proof & Program Surface" icon={<Server className="h-5 w-5" />} className="lg:col-span-2">
          <div className="space-y-4 font-mono text-sm">
            <ProgramPanel label="SSS Core Program" value={DEVNET_PROGRAM_IDS.stablecoin} environment={environment} rpcUrl={rpcUrl} />
            <ProgramPanel label="Transfer Hook Program" value={DEVNET_PROGRAM_IDS.transferHook} environment={environment} rpcUrl={rpcUrl} />
            <ProgramPanel label="Stablecoin Config" value={summary.configAddress} environment={environment} rpcUrl={rpcUrl} />
            <ProgramPanel label="Treasury" value={summary.treasury} environment={environment} rpcUrl={rpcUrl} />
          </div>
        </Card>
        <Card title="Quick Actions" icon={<Activity className="h-5 w-5" />}>
          <div className="space-y-3">
            <Button variant="outline" className="w-full justify-between" onClick={() => setActiveTab('operations')}>
              Mint / Burn
            </Button>
            <Button variant="outline" className="w-full justify-between" onClick={() => setActiveTab('governance')}>
              Minters / Roles
            </Button>
            {summary.complianceEnabled ? (
              <Button variant="outline" className="w-full justify-between border-amber-500/30 text-amber-300" onClick={() => setActiveTab('compliance')}>
                Compliance
              </Button>
            ) : null}
            <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-200">
              Metadata is stored on-chain in the SSS config PDA and referenced by the mint's metadata pointer.
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: 'emerald' | 'blue' | 'amber' | 'indigo' | 'neutral';
}) {
  const accents = {
    emerald: 'border-t-emerald-400/50',
    blue: 'border-t-blue-400/50',
    amber: 'border-t-amber-400/50',
    indigo: 'border-t-indigo-400/50',
    neutral: 'border-t-white/10',
  };
  return (
    <Card className={`border-t ${accents[accent]} hover:-translate-y-1 transition-transform duration-300`}>
      <div className="mb-1 text-sm text-zinc-400">{label}</div>
      <div className="text-3xl font-bold text-white">{value}</div>
      <div className="mt-2 flex items-center gap-1.5 text-xs text-zinc-400">
        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
        Live config snapshot
      </div>
    </Card>
  );
}

function ProgramPanel({
  label,
  value,
  environment,
  rpcUrl,
}: {
  label: string;
  value: string;
  environment: 'mainnet-beta' | 'devnet' | 'localnet';
  rpcUrl: string;
}) {
  return (
    <div className="rounded-xl border border-white/5 bg-black/30 p-4">
      <div className="mb-1.5 flex items-center justify-between gap-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">
        <span>{label}</span>
        <a
          href={explorerUrl(value, 'address', environment, rpcUrl)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-emerald-400 hover:text-emerald-300"
        >
          Explorer
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>
      <div className="break-all text-emerald-300">{value}</div>
    </div>
  );
}
