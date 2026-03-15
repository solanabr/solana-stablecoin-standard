import React, { useState } from 'react';
import {
  Keypair,
  PublicKey,
  SystemProgram,
  TransactionMessage,
  VersionedTransaction,
  SYSVAR_RENT_PUBKEY,
} from '@solana/web3.js';
import { TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { useTxSender, TxStatus } from '../hooks/useTxSender';
import { sha256 } from '@noble/hashes/sha256';
import {
  STABLECOIN_PROGRAM_ID,
  TRANSFER_HOOK_PROGRAM_ID,
  findConfigPDA,
  findRolePDA,
  findExtraMetasPDA,
} from '../config';

// Anchor discriminator: sha256("global:<name>")[0..8]
function disc(name) {
  const hash = sha256(new TextEncoder().encode(`global:${name}`));
  return Buffer.from(hash.slice(0, 8));
}

const PRESET_OPTIONS = [
  {
    id: 0, name: 'SSS-1', label: 'Minimal Stablecoin', color: 'blue',
    desc: 'Mint, burn, freeze, pause, roles. No compliance features.',
    features: { Mint: true, Burn: true, Freeze: true, Pause: true, Roles: true, Blacklist: false, Seize: false, Hook: false },
  },
  {
    id: 1, name: 'SSS-2', label: 'Compliant Stablecoin', color: 'green',
    desc: 'All SSS-1 features + blacklist, seize, transfer hook enforcement.',
    features: { Mint: true, Burn: true, Freeze: true, Pause: true, Roles: true, Blacklist: true, Seize: true, Hook: true },
  },
];

export default function CreateWizard({ onCreated }) {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const { status, send, reset } = useTxSender();

  const [step, setStep] = useState(1);
  const [preset, setPreset] = useState(null);
  const [tokenName, setTokenName] = useState('');
  const [tokenSymbol, setTokenSymbol] = useState('');
  const [decimals, setDecimals] = useState('6');
  const [mintKeypair, setMintKeypair] = useState(() => Keypair.generate());
  const [createdMint, setCreatedMint] = useState(null);

  const handleCreate = async () => {
    if (!publicKey || !mintKeypair || preset === null) return;

    send(async () => {
      const mint = mintKeypair.publicKey;
      const [configPDA] = findConfigPDA(mint);
      const [authorityRolePDA] = findRolePDA(configPDA, publicKey);
      const dec = parseInt(decimals) || 6;
      const isSSS2 = preset === 1;

      // ── Serialize InitializeParams (8 fields, Borsh) ──
      const nameBytes = Buffer.from(tokenName || 'Stablecoin');
      const symbolBytes = Buffer.from(tokenSymbol || 'STABLE');
      const uriBytes = Buffer.from('');

      const nameLenBuf = Buffer.alloc(4); nameLenBuf.writeUInt32LE(nameBytes.length);
      const symbolLenBuf = Buffer.alloc(4); symbolLenBuf.writeUInt32LE(symbolBytes.length);
      const uriLenBuf = Buffer.alloc(4); uriLenBuf.writeUInt32LE(uriBytes.length);

      const parts = [
        disc('initialize'),                        // 8-byte discriminator
        Buffer.from([preset]),                      // 1: preset (enum u8)
        Buffer.from([0]),                           // 2: customFeatures = None
        nameLenBuf, nameBytes,                      // 3: name (String)
        symbolLenBuf, symbolBytes,                  // 4: symbol (String)
        uriLenBuf, uriBytes,                        // 5: uri (String, empty)
        Buffer.from([dec]),                          // 6: decimals (u8)
      ];

      // 7: transferHookProgram (Option<Pubkey>)
      if (isSSS2) {
        parts.push(Buffer.from([1]));               // Some
        parts.push(TRANSFER_HOOK_PROGRAM_ID.toBuffer());
      } else {
        parts.push(Buffer.from([0]));               // None
      }

      // 8: defaultAccountFrozen (bool)
      parts.push(Buffer.from([0]));                 // false

      const initData = Buffer.concat(parts);

      // ── Accounts: match IDL Initialize context exactly ──
      // The on-chain program creates the mint via CPI — no frontend pre-creation needed
      const instructions = [];
      instructions.push({
        programId: STABLECOIN_PROGRAM_ID,
        keys: [
          { pubkey: publicKey, isSigner: true, isWritable: true },               // authority
          { pubkey: configPDA, isSigner: false, isWritable: true },              // config
          { pubkey: mint, isSigner: true, isWritable: true },                    // mint
          { pubkey: authorityRolePDA, isSigner: false, isWritable: true },       // authorityRole
          { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false }, // tokenProgram
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // systemProgram
          { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },    // rent
        ],
        data: initData,
      });

      // SSS-2: initialize extra account metas for transfer hook
      if (isSSS2) {
        const [extraMetasPDA] = findExtraMetasPDA(mint);
        instructions.push({
          programId: TRANSFER_HOOK_PROGRAM_ID,
          keys: [
            { pubkey: publicKey, isSigner: true, isWritable: true },                // payer
            { pubkey: extraMetasPDA, isSigner: false, isWritable: true },            // extra_account_metas
            { pubkey: mint, isSigner: false, isWritable: false },                    // mint
            { pubkey: STABLECOIN_PROGRAM_ID, isSigner: false, isWritable: false },   // stablecoin_program
            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // system_program
          ],
          data: disc('initialize_extra_account_metas'),
        });
      }

      const blockhash = await connection.getLatestBlockhash();
      const msg = new TransactionMessage({
        payerKey: publicKey, recentBlockhash: blockhash.blockhash, instructions,
      }).compileToV0Message();

      const tx = new VersionedTransaction(msg);
      tx.sign([mintKeypair]);
      return { tx, blockhash };
    }, () => {
      setCreatedMint(mintKeypair.publicKey.toBase58());
      setStep(3);
    });
  };

  // ── Step 3: Success ──
  if (step === 3 && createdMint) {
    return (
      <div className="max-w-lg mx-auto animate-fade-in">
        <div className="card p-8 text-center">
          <div className="text-5xl mb-4">🎉</div>
          <h2 className="text-xl font-semibold mb-2">Stablecoin Created!</h2>
          <p className="text-sm text-gray-400 mb-6">
            Your {PRESET_OPTIONS[preset]?.name} stablecoin is live on devnet.
          </p>
          <div className="bg-gray-800/50 rounded-lg p-4 mb-6 text-left">
            <label className="label">Mint Address</label>
            <p className="font-mono text-sm text-sol-400 break-all">{createdMint}</p>
          </div>
          <div className="flex gap-3">
            <a href={`https://explorer.solana.com/address/${createdMint}?cluster=devnet`}
              target="_blank" rel="noopener noreferrer" className="btn-secondary flex-1">
              View on Explorer ↗
            </a>
            <button onClick={() => onCreated(createdMint)} className="btn-primary flex-1">
              Manage Stablecoin →
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Step 1: Select Preset ──
  if (step === 1) {
    return (
      <div className="max-w-lg mx-auto animate-fade-in">
        <div className="card p-6">
          <h2 className="text-lg font-semibold mb-1">Create New Stablecoin</h2>
          <p className="text-sm text-gray-500 mb-6">Select a preset and configure your token.</p>
          <div className="space-y-3 mb-6">
            {PRESET_OPTIONS.map((p) => (
              <button key={p.id} onClick={() => setPreset(p.id)}
                className={`w-full text-left p-4 rounded-lg border transition-all ${
                  preset === p.id ? 'border-sol-600/60 bg-sol-900/20' : 'border-gray-800/60 bg-gray-800/20 hover:border-gray-700/60'
                }`}>
                <div className="flex items-center gap-3 mb-1">
                  <span className={`badge-${p.color}`}>{p.name}</span>
                  <span className="text-sm font-medium">{p.label}</span>
                </div>
                <p className="text-xs text-gray-500 mb-2">{p.desc}</p>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(p.features).map(([k, v]) => (
                    <span key={k} className={`text-[10px] px-1.5 py-0.5 rounded ${
                      v ? 'bg-emerald-900/30 text-emerald-500' : 'bg-gray-800/50 text-gray-600'
                    }`}>
                      {v ? '✓' : '✗'} {k}
                    </span>
                  ))}
                </div>
              </button>
            ))}
          </div>
          <button onClick={() => setStep(2)} disabled={preset === null} className="btn-primary w-full">
            Continue →
          </button>
        </div>
      </div>
    );
  }

  // ── Step 2: Token Details ──
  return (
    <div className="max-w-lg mx-auto animate-fade-in">
      <div className="card p-6">
        <div className="flex items-center gap-2 mb-6">
          <button onClick={() => setStep(1)} className="text-gray-500 hover:text-white text-sm">← Back</button>
          <span className={`badge-${PRESET_OPTIONS[preset]?.color}`}>{PRESET_OPTIONS[preset]?.name}</span>
        </div>
        <h2 className="text-lg font-semibold mb-4">Token Details</h2>
        <div className="space-y-4 mb-6">
          <div>
            <label className="label">Token Name</label>
            <input type="text" className="input-field" placeholder="e.g. USD Stablecoin"
              value={tokenName} onChange={(e) => setTokenName(e.target.value)} />
          </div>
          <div>
            <label className="label">Symbol</label>
            <input type="text" className="input-field" placeholder="e.g. USDS" maxLength={10}
              value={tokenSymbol} onChange={(e) => setTokenSymbol(e.target.value)} />
          </div>
          <div>
            <label className="label">Decimals</label>
            <input type="number" className="input-field" min="0" max="18"
              value={decimals} onChange={(e) => setDecimals(e.target.value)} />
          </div>
          <div className="bg-gray-800/30 rounded-lg p-3">
            <label className="label">Mint Address (auto-generated)</label>
            <p className="font-mono text-xs text-gray-400 break-all mt-1">{mintKeypair?.publicKey.toBase58()}</p>
            <button onClick={() => setMintKeypair(Keypair.generate())}
              className="text-xs text-sol-500 hover:text-sol-400 mt-1">Regenerate ↻</button>
          </div>
        </div>
        <button onClick={handleCreate}
          disabled={status.state === 'sending' || status.state === 'confirming'}
          className="btn-primary w-full">
          {status.state === 'sending' || status.state === 'confirming'
            ? 'Creating...' : `Create ${PRESET_OPTIONS[preset]?.name} Stablecoin`}
        </button>
        <TxStatus status={status} onReset={reset} />
      </div>
    </div>
  );
}
