import React, { useState } from 'react';
import { PublicKey } from '@solana/web3.js';
import { useConnection } from '@solana/wallet-adapter-react';
import { useTxSender, TxStatus } from '../hooks/useTxSender';
import { buildFreezeTx, buildThawTx, buildPauseTx, buildUnpauseTx } from '../hooks/txBuilder';

export default function FreezePanel({ config, onRefresh }) {
  const { connection } = useConnection();
  const { status, send, reset, publicKey } = useTxSender();
  const [target, setTarget] = useState('');
  const pauseStatus = useTxSender();

  if (!config) {
    return (
      <div className="text-center py-20 text-gray-500">
        <p className="text-4xl mb-3">❄</p>
        <p>Load a stablecoin first</p>
      </div>
    );
  }

  const handleFreeze = () => {
    if (!target) return;
    send(
      () => buildFreezeTx(connection, publicKey, config.mint, new PublicKey(target)),
      onRefresh
    );
  };

  const handleThaw = () => {
    if (!target) return;
    send(
      () => buildThawTx(connection, publicKey, config.mint, new PublicKey(target)),
      onRefresh
    );
  };

  const handlePause = () => {
    pauseStatus.send(
      () => buildPauseTx(connection, pauseStatus.publicKey, config.mint),
      onRefresh
    );
  };

  const handleUnpause = () => {
    pauseStatus.send(
      () => buildUnpauseTx(connection, pauseStatus.publicKey, config.mint),
      onRefresh
    );
  };

  return (
    <div className="max-w-lg mx-auto space-y-6 animate-fade-in">
      {/* Pause / Unpause */}
      {config.features.canPause && (
        <div className="card p-6">
          <h3 className="text-sm font-semibold text-white mb-1">Global Pause</h3>
          <p className="text-xs text-gray-500 mb-4">
            {config.paused
              ? 'Token is currently PAUSED. All operations are blocked.'
              : 'Token is active. Pausing will block all operations.'}
          </p>

          <div className="flex items-center gap-3">
            <div className={`flex-1 text-center py-2 rounded-lg text-sm font-medium ${
              config.paused
                ? 'bg-red-900/30 text-red-400 border border-red-800/30'
                : 'bg-emerald-900/30 text-emerald-400 border border-emerald-800/30'
            }`}>
              {config.paused ? '⏸ Paused' : '● Active'}
            </div>

            {config.paused ? (
              <button onClick={handleUnpause} className="btn-primary" disabled={pauseStatus.status.state === 'sending'}>
                Unpause
              </button>
            ) : (
              <button onClick={handlePause} className="btn-danger" disabled={pauseStatus.status.state === 'sending'}>
                Pause
              </button>
            )}
          </div>

          <TxStatus status={pauseStatus.status} onReset={pauseStatus.reset} />
        </div>
      )}

      {/* Freeze / Thaw */}
      {config.features.canFreeze && (
        <div className="card p-6">
          <h3 className="text-sm font-semibold text-white mb-1">Freeze / Thaw Account</h3>
          <p className="text-xs text-gray-500 mb-4">
            Freeze a specific token account to prevent transfers, or thaw to restore access.
          </p>

          <div className="mb-4">
            <label className="label">Account Owner</label>
            <input
              type="text"
              className="input-field"
              placeholder="Wallet address to freeze/thaw..."
              value={target}
              onChange={(e) => setTarget(e.target.value)}
            />
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleFreeze}
              disabled={!target || status.state === 'sending'}
              className="btn-danger flex-1"
            >
              ❄ Freeze
            </button>
            <button
              onClick={handleThaw}
              disabled={!target || status.state === 'sending'}
              className="btn-primary flex-1"
            >
              ☀ Thaw
            </button>
          </div>

          <TxStatus status={status} onReset={reset} />
        </div>
      )}
    </div>
  );
}
