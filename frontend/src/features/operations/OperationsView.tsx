import { Lock, Pause, Play, Plus, Trash2, Unlock } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { useApp } from '../../state/AppContext';

export function OperationsView() {
  const { summary, performOperation } = useApp();
  const [mintRecipient, setMintRecipient] = useState('');
  const [mintAmount, setMintAmount] = useState('');
  const [burnAccount, setBurnAccount] = useState('');
  const [burnAmount, setBurnAmount] = useState('');
  const [controlAccount, setControlAccount] = useState('');
  const [loadingAction, setLoadingAction] = useState<string | null>(null);

  if (!summary) {
    return null;
  }

  async function run(
    key: string,
    action: () => Promise<string>,
  ) {
    setLoadingAction(key);
    try {
      await action();
    } catch (error) {
      console.error(error);
    } finally {
      setLoadingAction(null);
    }
  }

  return (
    <div className="max-w-5xl space-y-6">
      <div className="mb-8 flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
        <h2 className="text-3xl font-bold text-white">Operations</h2>
        <Button
          variant={summary.paused ? 'primary' : 'danger'}
          onClick={() =>
            run('pause-toggle', () =>
              performOperation(summary.paused ? 'unpause' : 'pause'),
            )
          }
          isLoading={loadingAction === 'pause-toggle'}
        >
          {summary.paused ? (
            <>
              <Play className="mr-2 h-4 w-4" /> Unpause Protocol
            </>
          ) : (
            <>
              <Pause className="mr-2 h-4 w-4" /> Pause Protocol
            </>
          )}
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
        <Card title="Mint Tokens" icon={<Plus className="h-6 w-6 text-emerald-400" />}>
          <div className="space-y-5">
            <Input
              label="Recipient Wallet Or Token Account"
              value={mintRecipient}
              onChange={(event) => setMintRecipient(event.target.value)}
              helper="If you paste a wallet address instead of a token account, Phantom may ask twice: once to create the ATA, once to mint."
            />
            <Input
              label="Mint Amount"
              value={mintAmount}
              onChange={(event) => setMintAmount(event.target.value)}
              helper="Amount is in base units. With 6 decimals, 1,000,000 = 1 token."
            />
            <Button
              className="w-full"
              isLoading={loadingAction === 'mint'}
              disabled={!mintRecipient || !mintAmount}
              onClick={() =>
                run('mint', () =>
                  performOperation('mint', {
                    recipient: mintRecipient,
                    amount: mintAmount,
                  }),
                )
              }
            >
              Mint {summary.symbol}
            </Button>
          </div>
        </Card>

        <Card title="Burn Tokens" icon={<Trash2 className="h-6 w-6 text-red-400" />}>
          <div className="space-y-5">
            <Input
              label="Source Token Account"
              value={burnAccount}
              onChange={(event) => setBurnAccount(event.target.value)}
            />
            <Input
              label="Burn Amount"
              value={burnAmount}
              onChange={(event) => setBurnAmount(event.target.value)}
            />
            <Button
              variant="danger"
              className="w-full"
              isLoading={loadingAction === 'burn'}
              disabled={!burnAccount || !burnAmount}
              onClick={() =>
                run('burn', () =>
                  performOperation('burn', {
                    sourceTokenAccount: burnAccount,
                    amount: burnAmount,
                  }),
                )
              }
            >
              Burn {summary.symbol}
            </Button>
          </div>
        </Card>

        <Card title="Freeze / Thaw" icon={<Lock className="h-6 w-6 text-blue-400" />} className="md:col-span-2">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-end">
            <Input
              className="flex-1"
              label="Token Account"
              value={controlAccount}
              onChange={(event) => setControlAccount(event.target.value)}
            />
            <div className="flex gap-4">
              <Button
                variant="secondary"
                isLoading={loadingAction === 'freeze'}
                disabled={!controlAccount}
                onClick={() =>
                  run('freeze', () =>
                    performOperation('freeze', {
                      tokenAccount: controlAccount,
                    }),
                  )
                }
              >
                <Lock className="mr-2 h-4 w-4" /> Freeze
              </Button>
              <Button
                variant="secondary"
                isLoading={loadingAction === 'thaw'}
                disabled={!controlAccount}
                onClick={() =>
                  run('thaw', () =>
                    performOperation('thaw', {
                      tokenAccount: controlAccount,
                    }),
                  )
                }
              >
                <Unlock className="mr-2 h-4 w-4" /> Thaw
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
