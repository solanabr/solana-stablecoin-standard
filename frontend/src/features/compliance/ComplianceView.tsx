import { AlertTriangle, ShieldAlert } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { useApp } from '../../state/AppContext';

export function ComplianceView() {
  const { summary, performOperation } = useApp();
  const [wallet, setWallet] = useState('');
  const [reason, setReason] = useState('Sanctions match');
  const [sourceTokenAccount, setSourceTokenAccount] = useState('');
  const [sourceOwner, setSourceOwner] = useState('');
  const [destinationTokenAccount, setDestinationTokenAccount] = useState('');
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState<string | null>(null);

  if (!summary?.complianceEnabled) {
    return (
      <Card className="py-20 text-center">
        <div className="mb-6 inline-flex h-24 w-24 items-center justify-center rounded-full border border-white/5 bg-zinc-800/50">
          <ShieldAlert className="h-12 w-12 text-zinc-500" />
        </div>
        <h2 className="mb-2 text-2xl font-bold text-zinc-200">Compliance Disabled</h2>
        <p className="mx-auto max-w-md text-sm leading-relaxed text-zinc-500">
          This stablecoin was not initialized with SSS-2 compliance controls.
        </p>
      </Card>
    );
  }

  async function run(key: string, action: () => Promise<string>) {
    setLoading(key);
    try {
      await action();
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="max-w-5xl space-y-6">
      <h2 className="mb-8 text-3xl font-bold text-white">Compliance Operations</h2>
      <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
        <Card title="Blacklist Directory" icon={<ShieldAlert className="h-6 w-6 text-amber-400" />}>
          <div className="space-y-5">
            <Input label="Wallet Address" value={wallet} onChange={(event) => setWallet(event.target.value)} />
            <Input label="Reason" value={reason} onChange={(event) => setReason(event.target.value)} />
            <div className="flex gap-4">
              <Button
                variant="outline"
                className="flex-1 border-amber-500/40 text-amber-300"
                disabled={!wallet}
                isLoading={loading === 'blacklist-add'}
                onClick={() =>
                  run('blacklist-add', () =>
                    performOperation('blacklist-add', { wallet, reason }),
                  )
                }
              >
                Add
              </Button>
              <Button
                variant="secondary"
                className="flex-1"
                disabled={!wallet}
                isLoading={loading === 'blacklist-remove'}
                onClick={() =>
                  run('blacklist-remove', () =>
                    performOperation('blacklist-remove', { wallet }),
                  )
                }
              >
                Remove
              </Button>
            </div>
          </div>
        </Card>

        <Card title="Asset Seizure" icon={<AlertTriangle className="h-6 w-6 text-red-400" />}>
          <div className="space-y-5">
            <Input
              label="Source Token Account"
              value={sourceTokenAccount}
              onChange={(event) => setSourceTokenAccount(event.target.value)}
            />
            <Input
              label="Source Owner"
              value={sourceOwner}
              onChange={(event) => setSourceOwner(event.target.value)}
            />
            <Input
              label="Destination Token Account"
              value={destinationTokenAccount}
              onChange={(event) => setDestinationTokenAccount(event.target.value)}
            />
            <Input label="Amount" value={amount} onChange={(event) => setAmount(event.target.value)} />
            <Button
              variant="danger"
              className="w-full"
              disabled={!sourceTokenAccount || !sourceOwner || !destinationTokenAccount || !amount}
              isLoading={loading === 'seize'}
              onClick={() =>
                run('seize', () =>
                  performOperation('seize', {
                    sourceTokenAccount,
                    sourceOwner,
                    destinationTokenAccount,
                    amount,
                  }),
                )
              }
            >
              Execute Seizure
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
