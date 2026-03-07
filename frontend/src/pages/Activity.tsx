import React, { useState, useEffect } from 'react';
import { useConnection } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import { useStablecoin } from '../contexts/StablecoinContext';
import { useToast } from '../contexts/ToastContext';
import { SSS_TOKEN_PROGRAM_ID, shortenAddress, explorerUrl } from '../lib/program';
import Card from '../components/Card';
import Badge from '../components/Badge';
import Button from '../components/Button';
import Spinner from '../components/Spinner';
import { Activity, RefreshCw, ExternalLink } from 'lucide-react';

interface TxInfo {
  signature: string;
  slot: number;
  blockTime: number | null;
  type: string;
}

const ActivityPage: React.FC = () => {
  const { connection } = useConnection();
  const { currentMint, stablecoinInfo } = useStablecoin();
  const { addToast } = useToast();

  const [transactions, setTransactions] = useState<TxInfo[]>([]);
  const [loading, setLoading] = useState(false);

  const loadActivity = async () => {
    if (!currentMint) return;
    setLoading(true);
    try {
      const mint = new PublicKey(currentMint);
      const sigs = await connection.getSignaturesForAddress(mint, { limit: 50 });

      const txs: TxInfo[] = sigs.map((sig) => ({
        signature: sig.signature,
        slot: sig.slot,
        blockTime: sig.blockTime ?? null,
        type: sig.memo || 'Transaction',
      }));

      setTransactions(txs);
    } catch (err: any) {
      addToast({ type: 'error', title: 'Failed to load activity', message: err.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadActivity();
  }, [currentMint]);

  if (!currentMint) {
    return (
      <div style={{ textAlign: 'center', padding: 80, color: 'var(--text-muted)' }}>
        Load a stablecoin from the Dashboard first.
      </div>
    );
  }

  const formatTime = (ts: number | null) => {
    if (!ts) return '—';
    return new Date(ts * 1000).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="fade-in">
      <Card
        title={`Recent Activity (${transactions.length})`}
        subtitle={`Transactions for ${stablecoinInfo?.symbol || 'token'}`}
        icon={<Activity size={16} color="var(--accent)" />}
        actions={
          <Button variant="ghost" size="sm" onClick={loadActivity} icon={<RefreshCw size={14} />}>
            Refresh
          </Button>
        }
      >
        {loading ? (
          <Spinner label="Loading transactions..." />
        ) : transactions.length === 0 ? (
          <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)' }}>
            No transactions found.
          </div>
        ) : (
          <div>
            <div style={styles.tableHeader}>
              <span style={{ flex: 2 }}>Signature</span>
              <span style={{ width: 100, textAlign: 'center' }}>Slot</span>
              <span style={{ width: 160, textAlign: 'right' }}>Time</span>
              <span style={{ width: 50 }}></span>
            </div>
            {transactions.map((tx) => (
              <div key={tx.signature} style={styles.tableRow}>
                <span style={{ flex: 2, fontFamily: 'monospace', fontSize: 13 }}>
                  {shortenAddress(tx.signature, 12)}
                </span>
                <span style={{ width: 100, textAlign: 'center', fontSize: 12, color: 'var(--text-muted)' }}>
                  {tx.slot.toLocaleString()}
                </span>
                <span style={{ width: 160, textAlign: 'right', fontSize: 12, color: 'var(--text-secondary)' }}>
                  {formatTime(tx.blockTime)}
                </span>
                <span style={{ width: 50, textAlign: 'right' }}>
                  <a
                    href={explorerUrl(tx.signature)}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    <ExternalLink size={14} />
                  </a>
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
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

export default ActivityPage;
