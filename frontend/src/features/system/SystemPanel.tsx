import { FileJson, KeyRound, RefreshCw, Upload } from 'lucide-react';
import { ChangeEvent, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { Badge } from '../../components/ui/Badge';
import { useApp } from '../../state/AppContext';
import { shortAddress } from '../../lib/format';

export function SystemPanel() {
  const {
    environment,
    rpcUrl,
    operatorSigner,
    walletAddress,
    importOperatorSigner,
    loadLockfile,
    refreshData,
    setRpcUrl,
  } = useApp();
  const [rawKeypair, setRawKeypair] = useState('');

  async function onLockfileUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    const text = await file.text();
    await loadLockfile(text);
    event.target.value = '';
  }

  async function onOperatorImport() {
    await importOperatorSigner(rawKeypair);
    setRawKeypair('');
  }

  return (
    <Card title="Session Control" icon={<KeyRound className="h-5 w-5" />}>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Badge variant="success">{environment}</Badge>
            <Badge variant="neutral">RPC {shortAddress(rpcUrl, 8)}</Badge>
          </div>
          <Input
            label="RPC URL"
            value={rpcUrl}
            onChange={(event) => setRpcUrl(event.target.value)}
          />
          <div className="flex gap-3">
            <label className="inline-flex cursor-pointer items-center">
              <input className="hidden" type="file" accept=".json,application/json" onChange={onLockfileUpload} />
              <span className="inline-flex items-center rounded-xl border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-medium text-zinc-100 hover:bg-white/10">
                <Upload className="mr-2 h-4 w-4" />
                Load Lockfile
              </span>
            </label>
            <Button variant="secondary" onClick={refreshData}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
          </div>
        </div>

        <div className="space-y-4">
          <Input
            label="Operator Keypair JSON"
            value={rawKeypair}
            onChange={(event) => setRawKeypair(event.target.value)}
            placeholder="[12,34,...]"
          />
          <div className="flex items-center gap-3">
            <Button variant="primary" onClick={onOperatorImport} disabled={!rawKeypair.trim()}>
              <FileJson className="mr-2 h-4 w-4" />
              Import Operator
            </Button>
            {walletAddress ? (
              <Badge variant="success">Wallet {shortAddress(walletAddress)}</Badge>
            ) : null}
            {operatorSigner ? (
              <Badge variant="warning">{operatorSigner.label}</Badge>
            ) : (
              <Badge variant={walletAddress ? 'neutral' : 'error'}>
                {walletAddress ? 'Operator optional' : 'No operator signer'}
              </Badge>
            )}
          </div>
          <p className="text-xs leading-relaxed text-zinc-500">
            Connected wallet execution is supported. Imported operator keys are optional and useful for scripted admin sessions or fallback signing.
          </p>
        </div>
      </div>
    </Card>
  );
}
