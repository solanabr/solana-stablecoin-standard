import React, { useState, useEffect } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import { useStablecoin } from '../contexts/StablecoinContext';
import { useToast } from '../contexts/ToastContext';
import { formatAmount, shortenAddress, explorerUrl } from '../lib/program';
import { fetchStablecoinSnapshot } from '../lib/sdkClient';
import Card from '../components/Card';
import Button from '../components/Button';
import Input from '../components/Input';
import Badge from '../components/Badge';
import Spinner from '../components/Spinner';
import { Users, Search, ExternalLink, RefreshCw, Download } from 'lucide-react';

const Holders: React.FC = () => {
  const { connection } = useConnection();
  const wallet = useWallet();
  const { currentMint, stablecoinInfo } = useStablecoin();
  const { addToast } = useToast();

  const [holders, setHolders] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
  const [search, setSearch] = useState('');

  const loadHolders = async (silent = false) => {
    if (!currentMint) return;
    if (silent && holders.length > 0) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    try {
      const mint = new PublicKey(currentMint);
      const { holders: holderData, mintInfo } = await fetchStablecoinSnapshot(connection, mint);
      setHolders(
        holderData.map((holder) => ({
          owner: holder.owner.toBase58(),
          address: holder.owner.toBase58(),
          uiBalance: formatAmount(holder.balance, mintInfo.decimals),
        }))
      );
      setLastUpdatedAt(Date.now());
    } catch (err: any) {
      addToast({ type: 'error', title: 'Failed to load holders', message: err.message });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadHolders();
  }, [currentMint]);

  const filtered = holders.filter((h: any) =>
    !search || h.owner.toLowerCase().includes(search.toLowerCase())
  );

  const totalBalance = holders.reduce((sum: number, h: any) => sum + parseFloat(h.uiBalance || '0'), 0);

  const handleExportCSV = () => {
    const csv = [
      'Owner,Balance,Token Account',
      ...holders.map((h: any) => `${h.owner},${h.uiBalance},${h.address}`),
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${stablecoinInfo?.symbol || 'holders'}-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    addToast({ type: 'info', title: 'CSV exported' });
  };

  if (!currentMint) {
    return (
      <div style={{ textAlign: 'center', padding: 80, color: 'var(--text-muted)' }}>
        Load a stablecoin from the Dashboard first.
      </div>
    );
  }

  return (
    <div className="fade-in">
      {/* Stats Row */}
      <div style={styles.statsRow}>
        <div style={styles.statItem}>
          <span style={styles.statValue}>{holders.length}</span>
          <span style={styles.statLabel}>Total Holders</span>
        </div>
        <div style={styles.statItem}>
          <span style={styles.statValue}>{totalBalance.toLocaleString('en-US', { maximumFractionDigits: 2 })}</span>
          <span style={styles.statLabel}>Total Balance</span>
        </div>
        <div style={styles.statItem}>
          <span style={styles.statValue}>
            {holders.length > 0
              ? (totalBalance / holders.length).toLocaleString('en-US', { maximumFractionDigits: 2 })
              : '0'}
          </span>
          <span style={styles.statLabel}>Average Balance</span>
        </div>
      </div>

      {/* Holders Table */}
      <Card
        title={`Holders (${filtered.length})`}
        icon={<Users size={16} color="var(--cyan)" />}
        accent="var(--cyan)"
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => loadHolders(true)}
              loading={refreshing}
              icon={<RefreshCw size={14} />}
            >
              Refresh
            </Button>
            <Button variant="secondary" size="sm" onClick={handleExportCSV} icon={<Download size={14} />}>
              Export CSV
            </Button>
            {lastUpdatedAt && (
              <span style={{ fontSize: 11, color: 'var(--text-muted)', alignSelf: 'center' }}>
                Updated {new Date(lastUpdatedAt).toLocaleTimeString()}
              </span>
            )}
          </div>
        }
        style={{ marginTop: 16 }}
      >
        <div style={{ marginBottom: 14 }}>
          <Input
            placeholder="Search by owner address..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {loading && holders.length === 0 ? (
          <Spinner label="Loading holders..." />
        ) : filtered.length === 0 ? (
          <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)' }}>
            No holders found.
          </div>
        ) : (
          <div>
            <div style={styles.tableHeader}>
              <span style={{ width: 50 }}>#</span>
              <span style={{ flex: 2 }}>Owner</span>
              <span style={{ flex: 1 }}>Token Account</span>
              <span style={{ width: 140, textAlign: 'right' }}>Balance</span>
              <span style={{ width: 80, textAlign: 'right' }}>Share</span>
              <span style={{ width: 50 }}></span>
            </div>
            {refreshing && (
              <div style={{ padding: '8px 0', fontSize: 12, color: 'var(--text-muted)' }}>
                Refreshing balances in background...
              </div>
            )}
            {filtered.map((h: any, i: number) => {
              const share = totalBalance > 0 ? (parseFloat(h.uiBalance || '0') / totalBalance) * 100 : 0;
              return (
                <div key={h.address} style={styles.tableRow}>
                  <span style={{ width: 50, fontSize: 12, color: 'var(--text-muted)' }}>{i + 1}</span>
                  <span style={{ flex: 2, fontFamily: 'monospace', fontSize: 13 }}>
                    {shortenAddress(h.owner, 8)}
                  </span>
                  <span style={{ flex: 1, fontFamily: 'monospace', fontSize: 12, color: 'var(--text-muted)' }}>
                    {shortenAddress(h.address, 6)}
                  </span>
                  <span style={{ width: 140, textAlign: 'right', fontWeight: 600, fontSize: 13 }}>
                    {parseFloat(h.uiBalance || '0').toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 })}
                  </span>
                  <span style={{ width: 80, textAlign: 'right' }}>
                    <Badge>{share.toFixed(1)}%</Badge>
                  </span>
                  <span style={{ width: 50, textAlign: 'right' }}>
                    <a
                      href={explorerUrl(h.owner, 'address')}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      <ExternalLink size={14} />
                    </a>
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  statsRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: 16,
  },
  statItem: {
    background: 'var(--bg-card)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    padding: '16px 20px',
    display: 'flex',
    flexDirection: 'column',
  },
  statValue: {
    fontSize: 22,
    fontWeight: 700,
    color: 'var(--text-primary)',
  },
  statLabel: {
    fontSize: 12,
    color: 'var(--text-muted)',
    marginTop: 2,
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
    alignItems: 'center',
  },
  tableRow: {
    display: 'flex',
    alignItems: 'center',
    padding: '10px 0',
    borderBottom: '1px solid rgba(42, 48, 80, 0.4)',
  },
};

export default Holders;
