import React, { useState } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { Keypair, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';
import { Program, AnchorProvider, BN } from '@coral-xyz/anchor';
import {
  TOKEN_2022_PROGRAM_ID,
  getMintLen,
  ExtensionType,
  createInitializeMintInstruction,
  createInitializeMetadataPointerInstruction,
  createInitializePermanentDelegateInstruction,
  createInitializeTransferHookInstruction,
  createInitializeMintCloseAuthorityInstruction,
} from '@solana/spl-token';
import { useStablecoin } from '../contexts/StablecoinContext';
import { useToast } from '../contexts/ToastContext';
import {
  getIDL,
  SSS_TOKEN_PROGRAM_ID,
  TRANSFER_HOOK_PROGRAM_ID,
  findStatePDA,
  findMintAuthorityPDA,
  findFreezeAuthorityPDA,
  findPermanentDelegatePDA,
} from '../lib/program';
import Card from '../components/Card';
import Button from '../components/Button';
import Input from '../components/Input';
import Badge from '../components/Badge';
import { PlusCircle, Zap, Shield, Info, CheckCircle, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

type PresetChoice = 'SSS_1' | 'SSS_2' | 'CUSTOM';

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
  const [permDelegate, setPermDelegate] = useState(false);
  const [transferHook, setTransferHook] = useState(false);
  const [loading, setLoading] = useState(false);
  const [created, setCreated] = useState<{ mint: string; txSig: string } | null>(null);

  const handlePresetChange = (p: PresetChoice) => {
    setPreset(p);
    if (p === 'SSS_1') {
      setPermDelegate(false);
      setTransferHook(false);
    } else if (p === 'SSS_2') {
      setPermDelegate(true);
      setTransferHook(true);
    }
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
      const mintKeypair = Keypair.generate();
      const dec = parseInt(decimals) || 6;
      const [statePDA] = findStatePDA(mintKeypair.publicKey);
      const [mintAuthority] = findMintAuthorityPDA(statePDA);
      const [freezeAuthority] = findFreezeAuthorityPDA(statePDA);
      const [permanentDelegate] = findPermanentDelegatePDA(statePDA);

      const enablePD = preset === 'SSS_2' ? true : preset === 'CUSTOM' ? permDelegate : false;
      const enableTH = preset === 'SSS_2' ? true : preset === 'CUSTOM' ? transferHook : false;

      // Build extensions list
      const extensions: ExtensionType[] = [ExtensionType.MetadataPointer, ExtensionType.MintCloseAuthority];
      if (enablePD) extensions.push(ExtensionType.PermanentDelegate);
      if (enableTH) extensions.push(ExtensionType.TransferHook);

      const mintLen = getMintLen(extensions);
      const lamports = await connection.getMinimumBalanceForRentExemption(mintLen);

      // Build transaction: create account + init extensions + init mint
      const tx = new Transaction();

      tx.add(
        SystemProgram.createAccount({
          fromPubkey: wallet.publicKey,
          newAccountPubkey: mintKeypair.publicKey,
          space: mintLen,
          lamports,
          programId: TOKEN_2022_PROGRAM_ID,
        })
      );

      tx.add(
        createInitializeMetadataPointerInstruction(
          mintKeypair.publicKey,
          wallet.publicKey,
          mintKeypair.publicKey,
          TOKEN_2022_PROGRAM_ID
        )
      );

      tx.add(
        createInitializeMintCloseAuthorityInstruction(
          mintKeypair.publicKey,
          wallet.publicKey,
          TOKEN_2022_PROGRAM_ID
        )
      );

      if (enablePD) {
        tx.add(
          createInitializePermanentDelegateInstruction(
            mintKeypair.publicKey,
            permanentDelegate,
            TOKEN_2022_PROGRAM_ID
          )
        );
      }

      if (enableTH) {
        tx.add(
          createInitializeTransferHookInstruction(
            mintKeypair.publicKey,
            wallet.publicKey,
            TRANSFER_HOOK_PROGRAM_ID,
            TOKEN_2022_PROGRAM_ID
          )
        );
      }

      tx.add(
        createInitializeMintInstruction(
          mintKeypair.publicKey,
          dec,
          mintAuthority,
          freezeAuthority,
          TOKEN_2022_PROGRAM_ID
        )
      );

      tx.feePayer = wallet.publicKey;
      tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
      tx.partialSign(mintKeypair);

      const signedTx = await wallet.signTransaction(tx);
      const mintTxSig = await connection.sendRawTransaction(signedTx.serialize());
      await connection.confirmTransaction(mintTxSig, 'confirmed');

      // Initialize the on-chain state
      const provider = new AnchorProvider(connection, wallet as any, { commitment: 'confirmed' });
      const program = new Program(getIDL(), provider);

      const initTxSig = await program.methods
        .initialize({
          name: name.trim(),
          symbol: symbol.trim(),
          uri: uri.trim(),
          decimals: dec,
          enablePermanentDelegate: enablePD,
          enableTransferHook: enableTH,
          defaultAccountFrozen: false,
          transferHookProgramId: enableTH ? TRANSFER_HOOK_PROGRAM_ID : null,
        })
        .accounts({
          masterAuthority: wallet.publicKey,
          state: statePDA,
          mint: mintKeypair.publicKey,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          rent: new PublicKey('SysvarRent111111111111111111111111111111111'),
        })
        .rpc();

      const mintAddr = mintKeypair.publicKey.toBase58();
      setCreated({ mint: mintAddr, txSig: initTxSig });

      setStablecoinInfo({
        mint: mintAddr,
        name: name.trim(),
        symbol: symbol.trim(),
        decimals: dec,
        preset: preset === 'SSS_1' ? 'SSS_1' : preset === 'SSS_2' ? 'SSS_2' : 'CUSTOM',
        paused: false,
        totalMinted: '0',
        totalBurned: '0',
        masterAuthority: wallet.publicKey.toBase58(),
        enablePermanentDelegate: enablePD,
        enableTransferHook: enableTH,
        defaultAccountFrozen: false,
      });
      setCurrentMint(mintAddr);
      addRecentMint(mintAddr);

      addToast({ type: 'success', title: `${symbol.trim()} created!`, txSig: initTxSig });
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
          {
            id: 'CUSTOM' as PresetChoice,
            label: 'Custom',
            desc: 'Choose individual extensions manually',
            icon: <Info size={20} color="var(--yellow)" />,
            color: 'var(--yellow)',
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

      {/* Custom Extensions */}
      {preset === 'CUSTOM' && (
        <Card title="Extensions" icon={<Shield size={16} color="var(--yellow)" />} accent="var(--yellow)" style={{ marginTop: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <ToggleRow
              label="Permanent Delegate"
              desc="Allows seize/clawback and compliance operations"
              checked={permDelegate}
              onChange={setPermDelegate}
            />
            <ToggleRow
              label="Transfer Hook"
              desc="Enables blacklist enforcement on every transfer"
              checked={transferHook}
              onChange={setTransferHook}
            />
          </div>
        </Card>
      )}

      {/* Summary */}
      <Card title="Summary" style={{ marginTop: 16 }}>
        <div style={styles.summaryGrid}>
          <SummaryRow label="Standard" value={preset.replace('_', '-')} />
          <SummaryRow label="Name" value={name || '—'} />
          <SummaryRow label="Symbol" value={symbol || '—'} />
          <SummaryRow label="Decimals" value={decimals || '6'} />
          <SummaryRow
            label="Permanent Delegate"
            value={preset === 'SSS_2' || (preset === 'CUSTOM' && permDelegate) ? 'Yes' : 'No'}
          />
          <SummaryRow
            label="Transfer Hook"
            value={preset === 'SSS_2' || (preset === 'CUSTOM' && transferHook) ? 'Yes' : 'No'}
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

const ToggleRow: React.FC<{
  label: string;
  desc: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}> = ({ label, desc, checked, onChange }) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '10px 14px',
      background: checked ? 'var(--accent-bg)' : 'var(--bg-input)',
      borderRadius: 'var(--radius-sm)',
      border: `1px solid ${checked ? 'var(--accent)' : 'var(--border)'}`,
      cursor: 'pointer',
    }}
    onClick={() => onChange(!checked)}
  >
    <div>
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{label}</div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{desc}</div>
    </div>
    <div
      style={{
        width: 40,
        height: 22,
        borderRadius: 11,
        background: checked ? 'var(--accent)' : 'var(--border)',
        position: 'relative',
        transition: 'var(--transition)',
        flexShrink: 0,
      }}
    >
      <div
        style={{
          width: 16,
          height: 16,
          borderRadius: 8,
          background: '#fff',
          position: 'absolute',
          top: 3,
          left: checked ? 21 : 3,
          transition: 'var(--transition)',
        }}
      />
    </div>
  </div>
);

const SummaryRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
    <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{label}</span>
    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{value}</span>
  </div>
);

const styles: Record<string, React.CSSProperties> = {
  presetsRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
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
