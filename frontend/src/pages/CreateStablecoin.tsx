import React, { useState } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { useStablecoin } from '../contexts/StablecoinContext';
import { useToast } from '../contexts/ToastContext';
import { createStablecoinWithSdkClient } from '../lib/sdkClient';
import Card from '../components/Card';
import Button from '../components/Button';
import Input from '../components/Input';
import { PlusCircle, Zap, Shield, CheckCircle, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

type PresetChoice = 'SSS_1' | 'SSS_2';

const CreateStablecoin: React.FC = () => {
  const { connection } = useConnection();
  const wallet = useWallet();
  const { setCurrentMint, setStablecoinInfo, addRecentMint } = useStablecoin();
  const { addToast } = useToast();
  const navigate = useNavigate();

  const [preset, setPreset] = useState<PresetChoice>('SSS_1');
  const [name, setName] = useState('');
  const [symbol, setSymbol] = useState('');
  const [uri, setUri] = useState('');
  const [decimals, setDecimals] = useState('6');
  const [loading, setLoading] = useState(false);
  const [created, setCreated] = useState<{ mint: string; txSig: string } | null>(null);

  const handlePresetChange = (p: PresetChoice) => {
    setPreset(p);
  };

  const handleCreate = async () => {
    if (!wallet.publicKey || !wallet.signTransaction) {
      addToast({ type: 'warning', title: 'Connect your wallet first' });
      return;
    }
    if (!name.trim() || !symbol.trim()) {
      addToast({ type: 'error', title: 'Name and symbol are required' });
      return;
    }

    setLoading(true);
    try {
      const dec = parseInt(decimals) || 6;
      const createdState = await createStablecoinWithSdkClient({
        connection,
        wallet: wallet as any,
        preset,
        name,
        symbol,
        uri,
        decimals: dec,
      });

      const mintAddr = createdState.mint;
      setCreated({ mint: mintAddr, txSig: createdState.txSig });

      setStablecoinInfo({
        mint: mintAddr,
        name: name.trim(),
        symbol: symbol.trim(),
        decimals: dec,
        preset,
        paused: false,
        totalMinted: '0',
        totalBurned: '0',
        masterAuthority: wallet.publicKey.toBase58(),
        enablePermanentDelegate: createdState.enablePD,
        enableTransferHook: createdState.enableTH,
        defaultAccountFrozen: false,
      });
      setCurrentMint(mintAddr);
      addRecentMint(mintAddr);

      addToast({ type: 'success', title: `${symbol.trim()} created!`, txSig: createdState.txSig || undefined });
    } catch (err: any) {
      addToast({ type: 'error', title: 'Failed to create stablecoin', message: err.message });
    } finally {
      setLoading(false);
    }
  };

  if (created) {
    return (
      <div className="fade-in" style={styles.successWrap}>
        <div style={styles.successIcon}>
          <CheckCircle size={48} color="var(--green)" />
        </div>
        <h2 style={styles.successTitle}>Stablecoin Created!</h2>
        <p style={styles.successDesc}>
          Your {symbol} stablecoin has been deployed successfully.
        </p>
        <div style={styles.successMint}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Mint Address</span>
          <code style={styles.successCode}>{created.mint}</code>
        </div>
        <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
          <Button onClick={() => navigate('/')} icon={<ArrowRight size={16} />}>
            Go to Dashboard
          </Button>
          <Button
            variant="secondary"
            onClick={() => window.open(`https://explorer.solana.com/address/${created.mint}?cluster=devnet`, '_blank')}
          >
            View on Explorer
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="fade-in" style={{ maxWidth: 700 }}>
      {/* Preset Selection */}
      <div style={styles.presetsRow}>
        {([
          {
            id: 'SSS_1' as PresetChoice,
            label: 'SSS-1 Basic',
            desc: 'Mint, burn, freeze, pause — no compliance extensions',
            icon: <Zap size={20} color="var(--green)" />,
            color: 'var(--green)',
          },
          {
            id: 'SSS_2' as PresetChoice,
            label: 'SSS-2 Compliance',
            desc: 'Full compliance: blacklist, seize, transfer hook',
            icon: <Shield size={20} color="var(--accent)" />,
            color: 'var(--accent)',
          },
        ]).map((p) => (
          <button
            key={p.id}
            onClick={() => handlePresetChange(p.id)}
            style={{
              ...styles.presetCard,
              borderColor: preset === p.id ? p.color : 'var(--border)',
              background: preset === p.id ? `${p.color}08` : 'var(--bg-card)',
            }}
          >
            <div style={{ ...styles.presetIcon, background: `${p.color}18` }}>{p.icon}</div>
            <div style={styles.presetLabel}>{p.label}</div>
            <div style={styles.presetDesc}>{p.desc}</div>
            {preset === p.id && (
              <div style={{ ...styles.presetCheck, borderColor: p.color }}>
                <CheckCircle size={14} color={p.color} />
              </div>
            )}
          </button>
        ))}
      </div>

      {/* Token Details */}
      <Card title="Token Details" icon={<PlusCircle size={16} color="var(--accent)" />} style={{ marginTop: 16 }}>
        <div style={styles.formGrid}>
          <Input label="Name" placeholder="e.g. USD Stablecoin" value={name} onChange={(e) => setName(e.target.value)} />
          <Input label="Symbol" placeholder="e.g. USDS" value={symbol} onChange={(e) => setSymbol(e.target.value)} />
          <Input label="Decimals" type="number" placeholder="6" value={decimals} onChange={(e) => setDecimals(e.target.value)} hint="Standard is 6 for stablecoins" />
          <Input label="Metadata URI" placeholder="https://..." value={uri} onChange={(e) => setUri(e.target.value)} hint="Optional — link to off-chain metadata JSON" />
        </div>
      </Card>

      {/* Summary */}
      <Card title="Summary" style={{ marginTop: 16 }}>
        <div style={styles.summaryGrid}>
          <SummaryRow label="Standard" value={preset.replace('_', '-')} />
          <SummaryRow label="Name" value={name || '—'} />
          <SummaryRow label="Symbol" value={symbol || '—'} />
          <SummaryRow label="Decimals" value={decimals || '6'} />
          <SummaryRow
            label="Permanent Delegate"
            value={preset === 'SSS_2' ? 'Yes' : 'No'}
          />
          <SummaryRow
            label="Transfer Hook"
            value={preset === 'SSS_2' ? 'Yes' : 'No'}
          />
        </div>
        <div style={{ marginTop: 16 }}>
          <Button
            size="lg"
            onClick={handleCreate}
            loading={loading}
            disabled={!name.trim() || !symbol.trim() || !wallet.connected}
            icon={<PlusCircle size={18} />}
            style={{ width: '100%' }}
          >
            Create Stablecoin
          </Button>
        </div>
      </Card>
    </div>
  );
};

const SummaryRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
    <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{label}</span>
    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{value}</span>
  </div>
);

const styles: Record<string, React.CSSProperties> = {
  presetsRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: 12,
  },
  presetCard: {
    position: 'relative',
    padding: '18px 16px',
    background: 'var(--bg-card)',
    border: '2px solid var(--border)',
    borderRadius: 'var(--radius)',
    cursor: 'pointer',
    transition: 'var(--transition)',
    textAlign: 'left',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  presetIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  presetLabel: {
    fontSize: 14,
    fontWeight: 700,
    color: 'var(--text-primary)',
  },
  presetDesc: {
    fontSize: 12,
    color: 'var(--text-muted)',
    lineHeight: 1.4,
  },
  presetCheck: {
    position: 'absolute',
    top: 10,
    right: 10,
  },
  formGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 14,
  },
  summaryGrid: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  successWrap: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
    padding: '60px 0',
  },
  successIcon: {
    width: 80,
    height: 80,
    borderRadius: 20,
    background: 'var(--green-bg)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  successTitle: {
    fontSize: 22,
    fontWeight: 700,
    color: 'var(--text-primary)',
    marginBottom: 8,
  },
  successDesc: {
    fontSize: 14,
    color: 'var(--text-secondary)',
  },
  successMint: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    marginTop: 16,
    padding: '12px 20px',
    background: 'var(--bg-card)',
    borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--border)',
  },
  successCode: {
    fontSize: 13,
    fontFamily: 'monospace',
    color: 'var(--accent)',
    wordBreak: 'break-all',
  },
};

export default CreateStablecoin;
