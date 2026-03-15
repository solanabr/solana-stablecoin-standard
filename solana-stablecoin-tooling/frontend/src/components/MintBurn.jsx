import React, { useState } from 'react';
import { PublicKey } from '@solana/web3.js';
import { useConnection } from '@solana/wallet-adapter-react';
import { useTxSender, TxStatus } from '../hooks/useTxSender';
import { buildMintTx, buildBurnTx } from '../hooks/txBuilder';

export default function MintBurn({ config, mintInfo, onRefresh }) {
  const { connection } = useConnection();
  const { status, send, reset, publicKey } = useTxSender();
  const [mode, setMode] = useState('mint');
  const [amount, setAmount] = useState('');
  const [destination, setDestination] = useState('');

  if (!config) return <NeedConfig />;

  const decimals = config.decimals;

  const handleSubmit = () => {
    if (!amount || parseFloat(amount) <= 0) return;

    if (mode === 'mint') {
      const dest = destination ? new PublicKey(destination) : publicKey;
      send(
        () => buildMintTx(connection, publicKey, config.mint, dest, parseFloat(amount), decimals),
        onRefresh
      );
    } else {
      send(
        () => buildBurnTx(connection, publicKey, config.mint, parseFloat(amount), decimals),
        onRefresh
      );
    }
  };

  const supply = mintInfo ? (mintInfo.supply / Math.pow(10, decimals)).toLocaleString() : '—';

  return (
    <div className="max-w-lg mx-auto animate-fade-in">
      <div className="card p-6">
        {/* Mode toggle */}
        <div className="flex bg-gray-800/50 rounded-lg p-1 mb-6">
          {['mint', 'burn'].map((m) => (
            <button
              key={m}
              onClick={() => { setMode(m); reset(); }}
              className={`flex-1 py-2 rounded-md text-sm font-medium transition-all ${
                mode === m
                  ? 'bg-gray-700 text-white shadow-sm'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              {m === 'mint' ? '⚡ Mint' : '🔥 Burn'}
            </button>
          ))}
        </div>

        {/* Current supply */}
        <div className="mb-6 p-3 bg-gray-800/30 rounded-lg">
          <span className="text-xs text-gray-500">Current Supply</span>
          <p className="text-lg font-mono font-semibold text-sol-400">{supply}</p>
        </div>

        {/* Amount input */}
        <div className="mb-4">
          <label className="label">Amount</label>
          <input
            type="number"
            className="input-field text-lg"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            min="0"
            step="any"
          />
        </div>

        {/* Destination (mint only) */}
        {mode === 'mint' && (
          <div className="mb-4">
            <label className="label">Destination (leave empty for self)</label>
            <input
              type="text"
              className="input-field"
              placeholder={publicKey?.toBase58() || 'Wallet address...'}
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
            />
          </div>
        )}

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={!amount || parseFloat(amount) <= 0 || status.state === 'sending' || status.state === 'confirming'}
          className={mode === 'mint' ? 'btn-primary w-full' : 'btn-danger w-full'}
        >
          {status.state === 'sending' || status.state === 'confirming'
            ? 'Processing...'
            : mode === 'mint'
            ? `Mint ${amount || '0'} tokens`
            : `Burn ${amount || '0'} tokens`}
        </button>

        <TxStatus status={status} onReset={reset} />
      </div>
    </div>
  );
}

function NeedConfig() {
  return (
    <div className="text-center py-20 text-gray-500">
      <p className="text-4xl mb-3">⚡</p>
      <p>Load a stablecoin first to mint or burn tokens</p>
    </div>
  );
}
