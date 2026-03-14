import React, { useState, useEffect } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import { useStablecoin } from '../contexts/StablecoinContext';
import { useToast } from '../contexts/ToastContext';
import {
  formatAmount,
  shortenAddress,
  explorerUrl,
} from '../lib/program';
import {
  fetchStablecoinSnapshot,
  subscribeStablecoinEvents,
  ParsedEvent,
} from '../lib/sdkClient';
import StatCard from '../components/StatCard';
import Card from '../components/Card';
import Badge from '../components/Badge';
import Button from '../components/Button';
import Input from '../components/Input';
import Spinner from '../components/Spinner';
import {
  Coins,
  Users,
  Shield,
  TrendingUp,
  Pause,
  Play,
  Lock,
  Unlock,
  ExternalLink,
  Search,
  ArrowRight,
  Radio,
  RefreshCw,
} from 'lucide-react';

const Dashboard: React.FC = () => {
  const { connection } = useConnection();
  const wallet = useWallet();
  const { currentMint, setCurrentMint, stablecoinInfo, setStablecoinInfo, addRecentMint, recentMints } = useStablecoin();
  const { addToast } = useToast();

  const [mintInput, setMintInput] = useState(currentMint || '');
  const [loading, setLoading] = useState(false);
  const [state, setState] = useState<any>(null);
  const [holders, setHolders] = useState<any[]>([]);
  const [minters, setMinters] = useState<any[]>([]);
  const [events, setEvents] = useState<ParsedEvent[]>([]);
  const [realtime, setRealtime] = useState(true);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [backgroundRefreshing, setBackgroundRefreshing] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);

  const toBase58Safe = (value: unknown): string => {
    if (value && typeof value === 'object' && 'toBase58' in (value as Record<string, unknown>)) {
      try {
        return (value as { toBase58: () => string }).toBase58();
      } catch {
        return '';
      }
    }
    return '';
  };

  const toBigIntSafe = (value: unknown): bigint => {
    if (typeof value === 'bigint') return value;
    if (typeof value === 'number') return BigInt(Math.trunc(value));
    if (typeof value === 'string') {
      try {
        return BigInt(value);
      } catch {
        return 0n;
      }
    }
    if (value && typeof value === 'object' && 'toString' in (value as Record<string, unknown>)) {
      try {
        return BigInt((value as { toString: () => string }).toString());
      } catch {
        return 0n;
      }
    }
    return 0n;
  };

  const loadStablecoin = async (
    mintAddr: string,
    options?: { silent?: boolean; showErrors?: boolean }
  ) => {
    const silent = !!options?.silent;
    const showErrors = options?.showErrors ?? true;

    if (!wallet.publicKey) {
      if (showErrors) {
        addToast({ type: 'warning', title: 'Connect your wallet first' });
      }
      return;
    }

    if (silent) {
      if (hasLoadedOnce) {
        setBackgroundRefreshing(true);
      }
    } else {
      setLoading(true);
    }

    try {
      const mint = new PublicKey(mintAddr);
      const { state: stateData, mintInfo, minters: minterData, holders: holderData } = await fetchStablecoinSnapshot(connection, mint);
      setState(stateData);
      setHolders(
        (Array.isArray(holderData) ? holderData : [])
          .filter((holder) => holder?.owner)
          .map((holder) => ({
            owner: toBase58Safe(holder.owner),
            uiBalance: formatAmount(holder.balance, Number(mintInfo?.decimals ?? stateData?.decimals ?? 6)),
          }))
          .filter((holder) => holder.owner)
      );
      setMinters(
        (Array.isArray(minterData) ? minterData : [])
          .filter(Boolean)
          .map((minter) => {
            const address = toBase58Safe(minter?.address);
            return {
              publicKey: address,
              minter: address,
              quota: toBigIntSafe(minter?.quota).toString(),
              mintedTotal: toBigIntSafe(minter?.mintedTotal).toString(),
              active: !!minter?.active,
            };
          })
          .filter((minter) => minter.publicKey)
      );

      const preset = !!stateData?.permanentDelegateEnabled && !!stateData?.transferHookEnabled
        ? 'SSS_2'
        : 'SSS_1';

      const masterAuthority = toBase58Safe(stateData?.masterAuthority) || mint.toBase58();

      setStablecoinInfo({
        mint: mintAddr,
        name: stateData?.name ?? '',
        symbol: stateData?.symbol ?? '',
        decimals: Number(stateData?.decimals ?? 6),
        preset,
        paused: !!stateData?.paused,
        totalMinted: toBigIntSafe(stateData?.totalMinted).toString(),
        totalBurned: toBigIntSafe(stateData?.totalBurned).toString(),
        masterAuthority,
        enablePermanentDelegate: !!stateData?.permanentDelegateEnabled,
        enableTransferHook: !!stateData?.transferHookEnabled,
        defaultAccountFrozen: !!stateData?.defaultAccountFrozen,
      });

      setCurrentMint(mintAddr);
      addRecentMint(mintAddr);
      setHasLoadedOnce(true);
      setLastUpdatedAt(Date.now());

      if (!silent) {
        addToast({ type: 'success', title: `Loaded ${stateData?.symbol ?? 'stablecoin'}` });
      }
    } catch (err: any) {
      if (showErrors) {
        addToast({ type: 'error', title: 'Failed to load stablecoin', message: err.message });
      }
      setState(null);
    } finally {
      if (silent) {
        setBackgroundRefreshing(false);
      } else {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    if (currentMint && wallet.publicKey) {
      loadStablecoin(currentMint);
    }
  }, [wallet.publicKey]);

  useEffect(() => {
    if (!currentMint || !realtime) return;

    let subId: number | null = null;
    const mint = new PublicKey(currentMint);

    subId = subscribeStablecoinEvents(
      connection,
      mint,
      (event) => {
        setEvents((prev) => [event, ...prev].slice(0, 8));
        loadStablecoin(currentMint, { silent: true, showErrors: false });
      },
      (error) => {
        addToast({ type: 'error', title: 'Realtime stream error', message: error.message });
      }
    );

    return () => {
      if (subId !== null) {
        connection.removeOnLogsListener(subId).catch(() => {});
      }
    };
  }, [connection, currentMint, realtime]);

  useEffect(() => {
    if (!currentMint || !wallet.publicKey) return;
    const timer = setInterval(() => loadStablecoin(currentMint, { silent: true, showErrors: false }), 30_000);
    return () => clearInterval(timer);
  }, [currentMint, wallet.publicKey]);

  const totalSupply = state
    ? toBigIntSafe(state.totalMinted) - toBigIntSafe(state.totalBurned)
    : 0n;

  if (!wallet.connected) {
    return (
      <div style={styles.emptyState}>
        <div style={styles.emptyIcon}>
          <Coins size={48} color="var(--accent)" />
        </div>
        <h2 style={styles.emptyTitle}>Welcome to SSS Admin</h2>
        <p style={styles.emptyDesc}>
          Connect your wallet to manage Solana Stablecoin Standard tokens.
          <br />Supports SSS-1 (basic) and SSS-2 (compliance) standards.
        </p>
      </div>
    );
  }

  return (
    <div className="fade-in">
      {/* ─── Mint Search Bar ─────────────────────────────────────── */}
      <Card
        title="Load Stablecoin"
        subtitle="Enter a mint address to load an existing stablecoin"
        icon={<Search size={16} color="var(--accent)" />}
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {lastUpdatedAt && (
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                Updated {new Date(lastUpdatedAt).toLocaleTimeString()}
              </span>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => currentMint && loadStablecoin(currentMint, { silent: true, showErrors: true })}
              loading={backgroundRefreshing}
              disabled={!currentMint}
              icon={<RefreshCw size={14} />}
            >
              Refresh
            </Button>
          </div>
        }
      >
        <div style={{ display: 'flex', gap: 10 }}>
          <Input
            placeholder="Mint address (e.g. 7kbn...)"
            value={mintInput}
            onChange={(e) => setMintInput(e.target.value)}
            style={{ flex: 1 }}
          />
          <Button
            onClick={() => loadStablecoin(mintInput.trim())}
            loading={loading}
            disabled={!mintInput.trim()}
            icon={<ArrowRight size={16} />}
          >
            Load
          </Button>
        </div>

        {recentMints.length > 0 && (
          <div style={{ marginTop: 12, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', alignSelf: 'center' }}>Recent:</span>
            {recentMints.slice(0, 5).map((m) => (
              <button
                key={m}
                onClick={() => { setMintInput(m); loadStablecoin(m); }}
                style={styles.recentChip}
              >
                {shortenAddress(m, 6)}
              </button>
            ))}
          </div>
        )}
      </Card>

      {loading && !hasLoadedOnce && <Spinner label="Loading stablecoin data..." />}

      {/* ─── Stats Grid ──────────────────────────────────────────── */}
      {state && stablecoinInfo && !loading && (
        <>
          <div style={styles.statsGrid}>
            <StatCard
              label="Total Supply"
              value={formatAmount(totalSupply, stablecoinInfo.decimals)}
              icon={<Coins size={18} color="var(--accent)" />}
              color="var(--accent)"
              sub={`${stablecoinInfo.symbol} in circulation`}
            />
            <StatCard
              label="Total Minted"
              value={formatAmount(toBigIntSafe(state.totalMinted), stablecoinInfo.decimals)}
              icon={<TrendingUp size={18} color="var(--green)" />}
              color="var(--green)"
              sub="Lifetime minted"
            />
            <StatCard
              label="Total Burned"
              value={formatAmount(toBigIntSafe(state.totalBurned), stablecoinInfo.decimals)}
              icon={<TrendingUp size={18} color="var(--red)" />}
              color="var(--red)"
              sub="Lifetime burned"
            />
            <StatCard
              label="Holders"
              value={holders.length}
              icon={<Users size={18} color="var(--cyan)" />}
              color="var(--cyan)"
              sub="Unique token accounts"
            />
          </div>

          {/* ─── Info Cards Row ───────────────────────────────────── */}
          <div style={styles.row}>
            <Card
              title="Status"
              icon={state.paused ? <Pause size={16} color="var(--red)" /> : <Play size={16} color="var(--green)" />}
              style={{ flex: 1 }}
            >
              <div style={styles.infoGrid}>
                <InfoRow label="Status">
                  <Badge
                    color={state.paused ? 'var(--red)' : 'var(--green)'}
                    bg={state.paused ? 'var(--red-bg)' : 'var(--green-bg)'}
                  >
                    {state.paused ? 'Paused' : 'Active'}
                  </Badge>
                </InfoRow>
                <InfoRow label="Standard">
                  <Badge>{stablecoinInfo.preset.replace('_', '-')}</Badge>
                </InfoRow>
                <InfoRow label="Decimals">{stablecoinInfo.decimals}</InfoRow>
                <InfoRow label="Minters">{minters.filter((m: any) => m.active).length} active</InfoRow>
              </div>
            </Card>

            <Card
              title="Extensions"
              icon={<Shield size={16} color="var(--accent)" />}
              style={{ flex: 1 }}
            >
              <div style={styles.infoGrid}>
                <InfoRow label="Permanent Delegate">
                  <FeatureBadge enabled={stablecoinInfo.enablePermanentDelegate} />
                </InfoRow>
                <InfoRow label="Transfer Hook">
                  <FeatureBadge enabled={stablecoinInfo.enableTransferHook} />
                </InfoRow>
                <InfoRow label="Default Frozen">
                  <FeatureBadge enabled={stablecoinInfo.defaultAccountFrozen} />
                </InfoRow>
                <InfoRow label="Freeze Authority">
                  <FeatureBadge enabled={true} />
                </InfoRow>
              </div>
            </Card>
          </div>

          {/* ─── Authority Card ───────────────────────────────────── */}
          <Card
            title="Authority"
            icon={<Lock size={16} color="var(--yellow)" />}
            accent="var(--yellow)"
          >
            <div style={styles.infoGrid}>
              <InfoRow label="Master Authority">
                <a
                  href={explorerUrl(stablecoinInfo.masterAuthority, 'address')}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={styles.addressLink}
                >
                  {shortenAddress(stablecoinInfo.masterAuthority, 8)}
                  <ExternalLink size={11} />
                </a>
              </InfoRow>
              <InfoRow label="Mint Address">
                <a
                  href={explorerUrl(stablecoinInfo.mint, 'address')}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={styles.addressLink}
                >
                  {shortenAddress(stablecoinInfo.mint, 8)}
                  <ExternalLink size={11} />
                </a>
              </InfoRow>
            </div>
          </Card>

          {/* ─── Top Holders ──────────────────────────────────────── */}
          {holders.length > 0 && (
            <Card title="Top Holders" icon={<Users size={16} color="var(--cyan)" />} accent="var(--cyan)">
              <div style={styles.table}>
                <div style={styles.tableHeader}>
                  <span style={{ flex: 1 }}>Owner</span>
                  <span style={{ width: 120, textAlign: 'right' }}>Balance</span>
                </div>
                {holders.slice(0, 10).map((h: any, i: number) => (
                  <div key={i} style={styles.tableRow}>
                    <span style={{ flex: 1, fontFamily: 'monospace', fontSize: 13 }}>
                      <a
                        href={explorerUrl(h.owner, 'address')}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: 'var(--text-primary)', textDecoration: 'none' }}
                      >
                        {shortenAddress(h.owner, 8)}
                      </a>
                    </span>
                    <span style={{ width: 120, textAlign: 'right', fontWeight: 600 }}>
                      {h.uiBalance}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          <Card
            title="Live Program Events"
            subtitle="Decoded sss_token events for this mint"
            icon={<Radio size={16} color="var(--yellow)" />}
            accent="var(--yellow)"
            actions={
              <Button
                variant={realtime ? 'success' : 'secondary'}
                size="sm"
                onClick={() => setRealtime((v) => !v)}
              >
                {realtime ? 'Realtime ON' : 'Realtime OFF'}
              </Button>
            }
          >
            {events.length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--text-muted)', padding: '10px 0' }}>
                No events yet. Perform mint/burn/pause/compliance actions to populate this feed.
              </div>
            ) : (
              <div style={styles.eventList}>
                {events.map((event, index) => (
                  <div key={`${event.signature}-${index}`} style={styles.eventRow}>
                    <span style={styles.eventName}>{event.name}</span>
                    <span style={styles.eventSummary}>{event.summary}</span>
                    <a
                      href={explorerUrl(event.signature)}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={styles.eventLink}
                    >
                      {shortenAddress(event.signature, 8)}
                    </a>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
};

const InfoRow: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0' }}>
    <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{label}</span>
    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{children}</span>
  </div>
);

const FeatureBadge: React.FC<{ enabled: boolean }> = ({ enabled }) => (
  <Badge
    color={enabled ? 'var(--green)' : 'var(--text-muted)'}
    bg={enabled ? 'var(--green-bg)' : 'rgba(100, 116, 139, 0.1)'}
  >
    {enabled ? 'Enabled' : 'Disabled'}
  </Badge>
);

const styles: Record<string, React.CSSProperties> = {
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '60vh',
    textAlign: 'center',
  },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 20,
    background: 'var(--accent-bg)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: 700,
    color: 'var(--text-primary)',
    marginBottom: 8,
  },
  emptyDesc: {
    fontSize: 14,
    color: 'var(--text-secondary)',
    lineHeight: 1.6,
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: 16,
    marginTop: 20,
  },
  row: {
    display: 'flex',
    gap: 16,
    marginTop: 16,
  },
  infoGrid: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  addressLink: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    color: 'var(--accent)',
    fontSize: 13,
    fontFamily: 'monospace',
    textDecoration: 'none',
  },
  recentChip: {
    padding: '4px 10px',
    background: 'var(--bg-input)',
    border: '1px solid var(--border)',
    borderRadius: 6,
    color: 'var(--text-secondary)',
    fontSize: 11,
    fontFamily: 'monospace',
    cursor: 'pointer',
    transition: 'var(--transition)',
  },
  table: {
    display: 'flex',
    flexDirection: 'column',
  },
  tableHeader: {
    display: 'flex',
    padding: '8px 0',
    borderBottom: '1px solid var(--border)',
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  tableRow: {
    display: 'flex',
    padding: '10px 0',
    borderBottom: '1px solid rgba(42, 48, 80, 0.4)',
    alignItems: 'center',
  },
  eventList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  eventRow: {
    display: 'grid',
    gridTemplateColumns: '180px 1fr 170px',
    gap: 10,
    alignItems: 'center',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)',
    padding: '10px 12px',
    background: 'var(--bg-input)',
  },
  eventName: {
    fontSize: 12,
    color: 'var(--yellow)',
    fontWeight: 700,
  },
  eventSummary: {
    fontSize: 13,
    color: 'var(--text-primary)',
  },
  eventLink: {
    fontSize: 12,
    fontFamily: 'monospace',
    color: 'var(--text-muted)',
    textAlign: 'right',
    textDecoration: 'none',
  },
};

export default Dashboard;
