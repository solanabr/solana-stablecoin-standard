import React, { useState, useEffect } from 'react';
import { useConnection } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import { useStablecoin } from '../contexts/StablecoinContext';
import { useToast } from '../contexts/ToastContext';
import { shortenAddress, explorerUrl } from '../lib/program';
import {
  fetchRecentStablecoinEvents,
  ParsedEvent,
  subscribeStablecoinEvents,
} from '../lib/sdkClient';
import Card from '../components/Card';
import Badge from '../components/Badge';
import Button from '../components/Button';
import Spinner from '../components/Spinner';
import { Activity, RefreshCw, ExternalLink, Radio } from 'lucide-react';

const ActivityPage: React.FC = () => {
  const { connection } = useConnection();
  const { currentMint, stablecoinInfo } = useStablecoin();
  const { addToast } = useToast();

  const [events, setEvents] = useState<ParsedEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [realtime, setRealtime] = useState(true);
  const [eventFilter, setEventFilter] = useState<string>('ALL');

  const loadActivity = async () => {
    if (!currentMint) return;
    setLoading(true);
    try {
      const mint = new PublicKey(currentMint);
      const recent = await fetchRecentStablecoinEvents(connection, mint, 40);
      setEvents(recent);
    } catch (err: any) {
      addToast({ type: 'error', title: 'Failed to load activity', message: err.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadActivity();
  }, [currentMint]);

  useEffect(() => {
    if (!currentMint || !realtime) return;
    const mint = new PublicKey(currentMint);

    const subId = subscribeStablecoinEvents(
      connection,
      mint,
      (event) => {
        setEvents((prev) => [event, ...prev].slice(0, 80));
      },
      (error) => addToast({ type: 'error', title: 'Realtime stream error', message: error.message })
    );

    return () => {
      connection.removeOnLogsListener(subId).catch(() => {});
    };
  }, [connection, currentMint, realtime]);

  if (!currentMint) {
    return (
      <div style={{ textAlign: 'center', padding: 80, color: 'var(--text-muted)' }}>
        Load a stablecoin from the Dashboard first.
      </div>
    );
  }

  const formatTime = (ts: number | undefined) => {
    if (!ts) return '—';
    const ms = ts < 10_000_000_000 ? ts * 1000 : ts;
    return new Date(ms).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const uniqueTypes = Array.from(new Set(events.map((event) => event.name)));
  const filteredEvents = eventFilter === 'ALL'
    ? events
    : events.filter((event) => event.name === eventFilter);

  return (
    <div className="fade-in">
      <Card
        title={`Recent Activity (${filteredEvents.length})`}
        subtitle={`Decoded on-chain events for ${stablecoinInfo?.symbol || 'token'}`}
        icon={<Activity size={16} color="var(--accent)" />}
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <Button
              variant={realtime ? 'success' : 'secondary'}
              size="sm"
              onClick={() => setRealtime((v) => !v)}
              icon={<Radio size={14} />}
            >
              {realtime ? 'Realtime' : 'Paused'}
            </Button>
            <Button variant="ghost" size="sm" onClick={loadActivity} icon={<RefreshCw size={14} />}>
              Refresh
            </Button>
          </div>
        }
      >
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          <button
            onClick={() => setEventFilter('ALL')}
            style={{ ...styles.filterChip, ...(eventFilter === 'ALL' ? styles.filterChipActive : {}) }}
          >
            All
          </button>
          {uniqueTypes.map((eventType) => (
            <button
              key={eventType}
              onClick={() => setEventFilter(eventType)}
              style={{ ...styles.filterChip, ...(eventFilter === eventType ? styles.filterChipActive : {}) }}
            >
              {eventType}
            </button>
          ))}
        </div>

        {loading ? (
          <Spinner label="Loading decoded events..." />
        ) : filteredEvents.length === 0 ? (
          <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)' }}>
            No events found for this filter.
          </div>
        ) : (
          <div>
            <div style={styles.tableHeader}>
              <span style={{ width: 190 }}>Event</span>
              <span style={{ flex: 1 }}>Summary</span>
              <span style={{ width: 160, textAlign: 'right' }}>Time</span>
              <span style={{ width: 50 }}></span>
            </div>
            {filteredEvents.map((event, idx) => (
              <div key={`${event.signature}-${idx}`} style={styles.tableRow}>
                <span style={{ width: 190, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Badge>{event.name}</Badge>
                </span>
                <span style={{ flex: 1, fontSize: 13, color: 'var(--text-secondary)' }}>
                  {event.summary}
                </span>
                <span style={{ width: 160, textAlign: 'right', fontSize: 12, color: 'var(--text-secondary)' }}>
                  {formatTime(event.timestamp)}
                </span>
                <span style={{ width: 50, textAlign: 'right' }}>
                  <a
                    href={explorerUrl(event.signature)}
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
  filterChip: {
    border: '1px solid var(--border)',
    background: 'var(--bg-input)',
    color: 'var(--text-secondary)',
    padding: '5px 10px',
    borderRadius: 999,
    fontSize: 12,
    cursor: 'pointer',
  },
  filterChipActive: {
    borderColor: 'var(--accent)',
    color: 'var(--accent)',
    background: 'var(--accent-bg)',
  },
};

export default ActivityPage;
