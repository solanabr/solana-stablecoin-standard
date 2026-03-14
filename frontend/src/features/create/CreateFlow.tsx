import { CheckCircle2, ChevronRight, CircleHelp, FileJson, ShieldCheck } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useApp } from '../../state/AppContext';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import type { CreateStablecoinFormValues, Preset } from '../../app/types';

const defaults: CreateStablecoinFormValues = {
  preset: 'SSS-1',
  name: 'Demo USD',
  symbol: 'dUSD',
  uri: 'https://example.org/token.json',
  decimals: 6,
  treasury: '',
  initialMinterQuota: '1000000000',
  initialMinterWindowSeconds: '86400',
  enableCompliance: false,
  enablePermanentDelegate: false,
  enableTransferHook: false,
  defaultAccountFrozen: false,
  seizeRequiresBlacklist: true,
};

export function CreateFlow() {
  const { deployStablecoin, loadLockfile, operatorSigner, walletAddress } = useApp();
  const [values, setValues] = useState<CreateStablecoinFormValues>(defaults);
  const [isDeploying, setIsDeploying] = useState(false);

  const effectiveFlags = useMemo(() => {
    if (values.preset === 'SSS-1') {
      return {
        compliance: false,
        hook: false,
      };
    }
    if (values.preset === 'SSS-2') {
      return {
        compliance: true,
        hook: true,
      };
    }
    return {
      compliance: values.enableCompliance,
      hook: values.enableTransferHook,
    };
  }, [values]);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsDeploying(true);
    try {
      await deployStablecoin(values);
    } finally {
      setIsDeploying(false);
    }
  }

  function update<K extends keyof CreateStablecoinFormValues>(
    key: K,
    value: CreateStablecoinFormValues[K],
  ) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function selectPreset(preset: Preset) {
    setValues((current) => {
      if (preset === 'SSS-1') {
        return {
          ...current,
          preset,
          enableCompliance: false,
          enablePermanentDelegate: false,
          enableTransferHook: false,
          defaultAccountFrozen: false,
          seizeRequiresBlacklist: true,
        };
      }

      if (preset === 'SSS-2') {
        return {
          ...current,
          preset,
          enableCompliance: true,
          enablePermanentDelegate: true,
          enableTransferHook: true,
          defaultAccountFrozen: false,
          seizeRequiresBlacklist: true,
        };
      }

      return { ...current, preset };
    });
  }

  return (
    <div className="mx-auto max-w-5xl animate-in fade-in zoom-in-95 duration-500">
      <div className="relative mb-12 text-center">
        <div className="absolute left-1/2 top-1/2 -z-10 h-32 w-32 -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-500/30 blur-[80px]" />
        <h1 className="mb-4 text-4xl font-extrabold tracking-tight text-white">
          Deploy Stablecoin Standard
        </h1>
        <p className="text-lg text-zinc-400">
          Initialize a Token-2022 stablecoin using SSS-1, SSS-2, or a custom profile.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card title="Protocol Configuration">
            <form className="space-y-8" onSubmit={onSubmit}>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                {(['SSS-1', 'SSS-2', 'Custom'] as Preset[]).map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => selectPreset(preset)}
                    className={`rounded-2xl border p-5 text-left transition-all ${
                      values.preset === preset
                        ? 'border-emerald-400 bg-emerald-500/10 shadow-glow'
                        : 'border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.08]'
                    }`}
                  >
                    <div className="mb-1.5 text-lg font-bold text-zinc-100">{preset}</div>
                    <div className="text-xs leading-relaxed text-zinc-400">
                      {preset === 'SSS-1'
                        ? 'Minimal issuer-grade stablecoin.'
                        : preset === 'SSS-2'
                          ? 'Blacklist, seize, and hook-based compliance.'
                          : 'Manually configure the extensions.'}
                    </div>
                  </button>
                ))}
              </div>

              {!operatorSigner && !walletAddress ? (
                <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4 text-sm text-amber-200">
                  Connect a wallet or import an operator keypair before deploying.
                </div>
              ) : null}

              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <Input
                  label="Token Name"
                  info="Human-readable name stored on-chain in the SSS config PDA."
                  value={values.name}
                  onChange={(event) => update('name', event.target.value)}
                  required
                />
                <Input
                  label="Symbol"
                  info="Ticker-like symbol for the stablecoin mint."
                  value={values.symbol}
                  onChange={(event) => update('symbol', event.target.value)}
                  required
                />
              </div>

              <Input
                label="Metadata URI"
                info="Metadata reference string written into the on-chain config and exposed through the mint metadata pointer."
                value={values.uri}
                onChange={(event) => update('uri', event.target.value)}
                helper="Stored on-chain in the SSS config PDA and referenced by the mint metadata pointer."
              />

              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <Input
                  label="Decimals"
                  info="Token precision. With 6 decimals, 1_000_000 base units equals 1 token."
                  type="number"
                  min={0}
                  max={9}
                  value={String(values.decimals)}
                  onChange={(event) => update('decimals', Number(event.target.value))}
                  required
                />
                <Input
                  label="Treasury Wallet or Token Account"
                  info="You can paste a treasury wallet or a Token-2022 token account. If left empty, the app derives the treasury ATA from the connected authority wallet."
                  value={values.treasury}
                  onChange={(event) => update('treasury', event.target.value)}
                  helper="For new deployments, leaving this blank uses the connected wallet as treasury owner and derives its associated token account automatically."
                />
              </div>

              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <Input
                  label="Initial Minter Quota"
                  info="Maximum amount the initial minter can issue during one quota window, measured in base units."
                  value={values.initialMinterQuota}
                  onChange={(event) => update('initialMinterQuota', event.target.value)}
                  helper="With 6 decimals, 1,000,000,000 base units equals 1,000 tokens."
                />
                <Input
                  label="Minter Window (Seconds)"
                  info="Length of the quota window before the initial minter allowance resets."
                  value={values.initialMinterWindowSeconds}
                  onChange={(event) => update('initialMinterWindowSeconds', event.target.value)}
                  helper="86400 seconds = 24 hours."
                />
              </div>

              {(values.preset === 'SSS-2' || values.preset === 'Custom') && (
                <div className="rounded-2xl border border-amber-500/20 bg-gradient-to-br from-amber-500/10 to-transparent p-5">
                  <h4 className="mb-4 flex items-center gap-2 text-sm font-bold text-amber-400">
                    <ShieldCheck className="h-5 w-5" />
                    Compliance Settings
                  </h4>
                  <div className="mb-4 rounded-xl border border-white/5 bg-black/20 p-4 text-xs leading-relaxed text-zinc-400">
                    Hover the help icon beside each field label to see what it controls. For a standard SSS-2 deployment, keep compliance, permanent delegate, and transfer hook enabled.
                  </div>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  {[
                    [
                      'Enable Compliance',
                      'enableCompliance',
                      'Turns on blacklist records and the compliance-specific instruction set.',
                    ],
                    [
                      'Permanent Delegate',
                      'enablePermanentDelegate',
                      'Allows the protocol-controlled delegate path used by SSS-2 seizure flows.',
                    ],
                    [
                      'Transfer Hook',
                      'enableTransferHook',
                      'Checks transfers in real time and blocks blacklisted or paused flows.',
                    ],
                    [
                      'Default Frozen Accounts',
                      'defaultAccountFrozen',
                      'New token accounts start frozen until explicitly thawed. Usually leave this off for demos.',
                    ],
                    [
                      'Seize Requires Blacklist',
                      'seizeRequiresBlacklist',
                      'Requires a wallet to be blacklisted before seizure is allowed.',
                    ],
                    ].map(([label, field, info]) => (
                      <label
                        key={field}
                        className="flex items-center gap-3 rounded-xl border border-white/5 bg-black/20 px-4 py-3 text-sm text-zinc-200"
                      >
                        <input
                          type="checkbox"
                          checked={Boolean(values[field as keyof CreateStablecoinFormValues])}
                          onChange={(event) =>
                            update(
                              field as
                                | 'enableCompliance'
                                | 'enablePermanentDelegate'
                                | 'enableTransferHook'
                                | 'defaultAccountFrozen'
                                | 'seizeRequiresBlacklist',
                              event.target.checked,
                            )
                          }
                        />
                        <span className="flex items-center gap-2">
                          <span>{label}</span>
                          <span
                            className="inline-flex text-zinc-500 transition-colors hover:text-amber-300"
                            title={info}
                            aria-label={info}
                          >
                            <CircleHelp className="h-3.5 w-3.5" />
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex flex-col items-start justify-between gap-4 border-t border-white/10 pt-6 sm:flex-row sm:items-center">
                <Button type="button" variant="secondary" onClick={() => void loadLockfile()}>
                  <FileJson className="mr-2 h-4 w-4" />
                  Load sss.lock.json
                </Button>
                <Button type="submit" isLoading={isDeploying} disabled={!operatorSigner && !walletAddress}>
                  Deploy Stablecoin
                  <ChevronRight className="ml-2 h-5 w-5" />
                </Button>
              </div>
            </form>
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Deployment Summary" className="sticky top-24">
            <div className="space-y-5 text-sm">
              <Row label="Program Base" value="Token-2022" accent />
              <Row label="Preset" value={values.preset} />
              <Row label="Compliance" value={effectiveFlags.compliance ? 'Enabled' : 'Disabled'} />
              <Row label="Transfer Hook" value={effectiveFlags.hook ? 'Enabled' : 'Disabled'} />
              <div className="rounded-xl border border-white/5 bg-black/20 p-4">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  Included Extensions
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className="rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-zinc-200">
                    Metadata Pointer
                  </span>
                  {effectiveFlags.hook ? (
                    <span className="rounded-md border border-amber-500/20 bg-amber-500/10 px-2.5 py-1 text-xs text-amber-300">
                      Transfer Hook
                    </span>
                  ) : null}
                  {effectiveFlags.compliance ? (
                    <span className="rounded-md border border-amber-500/20 bg-amber-500/10 px-2.5 py-1 text-xs text-amber-300">
                      Permanent Delegate
                    </span>
                  ) : null}
                  <span className="rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-zinc-200">
                    Freeze Authority
                  </span>
                </div>
              </div>
              <div className="rounded-xl border border-white/5 bg-black/20 p-4 text-xs leading-relaxed text-zinc-400">
                Create and admin actions can use the connected wallet. Imported operator keys remain available as a fallback.
              </div>
              <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-xs leading-relaxed text-red-200">
                The SDK create flow stores metadata on-chain in the SSS config PDA and keeps the mint pointed at that config.
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between border-b border-white/5 pb-3">
      <span className="text-zinc-400">{label}</span>
      <span
        className={`rounded-md px-2.5 py-1 font-mono text-xs ${accent ? 'border border-emerald-500/20 bg-emerald-500/10 text-emerald-300' : 'border border-white/10 bg-white/5 text-zinc-200'}`}
      >
        {value}
      </span>
    </div>
  );
}
