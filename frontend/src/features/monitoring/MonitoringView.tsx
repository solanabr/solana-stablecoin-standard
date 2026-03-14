import { Activity, Users } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { formatBigint, formatDate } from '../../lib/format';
import { useApp } from '../../state/AppContext';

export function MonitoringView() {
  const { holders, logs } = useApp();

  return (
    <div className="max-w-6xl space-y-8">
      <h2 className="text-3xl font-bold text-white">System Monitoring</h2>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <Card title="Top Token Holders" icon={<Users className="h-5 w-5 text-blue-400" />} className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-zinc-200">
              <thead className="border-b border-white/10 bg-white/[0.03] text-xs uppercase tracking-wider text-zinc-400">
                <tr>
                  <th className="px-5 py-4">Owner</th>
                  <th className="px-5 py-4">Token Account</th>
                  <th className="px-5 py-4 text-right">Balance</th>
                  <th className="px-5 py-4 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 bg-black/10">
                {holders.map((holder) => (
                  <tr key={holder.tokenAccount} className="hover:bg-white/[0.02]">
                    <td className="px-5 py-4 font-mono text-emerald-300">{holder.owner}</td>
                    <td className="px-5 py-4 font-mono text-zinc-400">{holder.tokenAccount}</td>
                    <td className="px-5 py-4 text-right font-mono">{formatBigint(holder.balance)}</td>
                    <td className="px-5 py-4 text-center">
                      <div className="flex justify-center gap-2">
                        {holder.isBlacklisted ? <Badge variant="error">Blacklisted</Badge> : null}
                        {holder.isFrozen ? <Badge variant="warning">Frozen</Badge> : null}
                        {!holder.isBlacklisted && !holder.isFrozen ? (
                          <Badge variant="success">OK</Badge>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title="Audit Trail" icon={<Activity className="h-5 w-5 text-emerald-400" />} className="max-h-[640px] overflow-y-auto custom-scrollbar">
          <div className="space-y-4 pr-2">
            {logs.length === 0 ? (
              <div className="rounded-xl border border-white/5 bg-black/20 py-12 text-center text-zinc-500">
                No recent transactions loaded.
              </div>
            ) : (
              logs.map((log) => (
                <div key={log.id} className="rounded-xl border border-white/5 bg-black/30 p-4">
                  <div className="mb-1 flex items-start justify-between gap-3">
                    <span className="font-bold text-zinc-100">{log.action}</span>
                    <span className="text-xs font-mono text-zinc-500">{formatDate(log.timestamp)}</span>
                  </div>
                  <div className="mb-2 text-sm text-zinc-400">{log.details}</div>
                  {log.signature ? (
                    <div className="truncate rounded-md border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 font-mono text-xs text-emerald-300">
                      {log.signature}
                    </div>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
