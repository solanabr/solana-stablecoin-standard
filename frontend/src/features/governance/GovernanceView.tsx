import { Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { Badge } from '../../components/ui/Badge';
import { formatBigint } from '../../lib/format';
import { useApp } from '../../state/AppContext';

export function GovernanceView() {
  const { minters, refreshMinters, performOperation } = useApp();
  const [address, setAddress] = useState('');
  const [quota, setQuota] = useState('1000000');
  const [windowSeconds, setWindowSeconds] = useState('86400');
  const [loading, setLoading] = useState<string | null>(null);

  const activeMinters = useMemo(() => minters.filter((item) => item.active), [minters]);

  async function run(key: string, action: () => Promise<string>) {
    setLoading(key);
    try {
      await action();
      await refreshMinters();
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="max-w-5xl space-y-6">
      <div className="mb-8 flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
        <h2 className="text-3xl font-bold text-white">Minters & Roles</h2>
        <Button variant="secondary" onClick={refreshMinters}>
          Refresh
        </Button>
      </div>

      <Card title="Add Or Update Minter" icon={<Plus className="h-5 w-5" />}>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-4">
          <Input label="Authority" value={address} onChange={(event) => setAddress(event.target.value)} />
          <Input label="Quota" value={quota} onChange={(event) => setQuota(event.target.value)} />
          <Input
            label="Window Seconds"
            value={windowSeconds}
            onChange={(event) => setWindowSeconds(event.target.value)}
          />
          <div className="flex items-end">
            <Button
              className="w-full"
              isLoading={loading === 'add-minter'}
              disabled={!address}
              onClick={() =>
                run('add-minter', () =>
                  performOperation('add-minter', {
                    minter: address,
                    quotaAmount: quota,
                    windowSeconds,
                  }),
                )
              }
            >
              Save Minter
            </Button>
          </div>
        </div>
      </Card>

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-zinc-200">
            <thead className="border-b border-white/10 bg-white/[0.03] text-xs uppercase tracking-wider text-zinc-400">
              <tr>
                <th className="px-6 py-5">Authority</th>
                <th className="px-6 py-5">Quota</th>
                <th className="px-6 py-5">Minted</th>
                <th className="px-6 py-5">Window</th>
                <th className="px-6 py-5">Status</th>
                <th className="px-6 py-5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 bg-black/10">
              {activeMinters.map((minter) => (
                <tr key={minter.address} className="hover:bg-white/[0.02]">
                  <td className="px-6 py-5 font-mono text-emerald-300">{minter.address}</td>
                  <td className="px-6 py-5 font-mono">{formatBigint(minter.quota)}</td>
                  <td className="px-6 py-5 font-mono">{formatBigint(minter.minted)}</td>
                  <td className="px-6 py-5 font-mono">{minter.windowSeconds}s</td>
                  <td className="px-6 py-5">
                    <Badge variant={minter.active ? 'success' : 'neutral'}>
                      {minter.active ? 'Active' : 'Disabled'}
                    </Badge>
                  </td>
                  <td className="px-6 py-5 text-right">
                    <Button
                      variant="outline"
                      className="text-xs"
                      isLoading={loading === `remove-${minter.address}`}
                      onClick={() =>
                        run(`remove-${minter.address}`, () =>
                          performOperation('remove-minter', {
                            minter: minter.address,
                          }),
                        )
                      }
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Remove
                    </Button>
                  </td>
                </tr>
              ))}
              {activeMinters.length === 0 ? (
                <tr>
                  <td className="px-6 py-8 text-zinc-500" colSpan={6}>
                    No minters discovered for the current config.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
