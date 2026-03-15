import React, { useState } from 'react';
import { PublicKey } from '@solana/web3.js';
import { useConnection } from '@solana/wallet-adapter-react';
import { useTxSender, TxStatus } from '../hooks/useTxSender';
import { buildBlacklistAddTx, buildBlacklistRemoveTx } from '../hooks/txBuilder';
import { findBlacklistPDA } from '../config';

function BlacklistChecker({ config }) {
  const { connection } = useConnection();
  const [checkAddr, setCheckAddr] = useState('');
  const [result, setResult] = useState(null);

  const handleCheck = async () => {
    if (!checkAddr || !config) return;
    try {
      const user = new PublicKey(checkAddr);
      const [blacklistPDA] = findBlacklistPDA(config.mint, user);
      const info = await connection.getAccountInfo(blacklistPDA);
      setResult(info ? 'blacklisted' : 'clear');
    } catch {
      setResult('error');
    }
  };

  return (
    <div className="card p-6">
      <h3 className="text-sm font-semibold text-white mb-1">Check Blacklist Status</h3>
      <p className="text-xs text-gray-500 mb-4">Verify if an address is on the blacklist.</p>

      <div className="flex gap-2">
        <input
          type="text"
          className="input-field flex-1"
          placeholder="Wallet address..."
          value={checkAddr}
          onChange={(e) => { setCheckAddr(e.target.value); setResult(null); }}
        />
        <button onClick={handleCheck} className="btn-secondary whitespace-nowrap">
          Check
        </button>
      </div>

      {result && (
        <div className={`mt-3 p-2.5 rounded-lg text-sm ${
          result === 'blacklisted'
            ? 'bg-red-950/30 text-red-400 border border-red-800/30'
            : result === 'clear'
            ? 'bg-emerald-950/30 text-emerald-400 border border-emerald-800/30'
            : 'bg-gray-800/50 text-gray-400'
        }`}>
          {result === 'blacklisted' && '🚫 Address is BLACKLISTED'}
          {result === 'clear' && '✅ Address is NOT blacklisted'}
          {result === 'error' && '⚠ Invalid address'}
        </div>
      )}
    </div>
  );
}

export default function CompliancePanel({ config, onRefresh }) {
  const { connection } = useConnection();
  const { status, send, reset, publicKey } = useTxSender();
  const [target, setTarget] = useState('');
  const [action, setAction] = useState('add');

  if (!config) {
    return (
      <div className="text-center py-20 text-gray-500">
        <p className="text-4xl mb-3">🛡</p>
        <p>Load a stablecoin first</p>
      </div>
    );
  }

  if (!config.features.hasBlacklist) {
    return (
      <div className="text-center py-20 text-gray-500">
        <p className="text-4xl mb-3">🛡</p>
        <p>Compliance features are not enabled on this stablecoin (SSS-1).</p>
        <p className="text-xs mt-2">Deploy with SSS-2 preset to enable blacklist and seize.</p>
      </div>
    );
  }

  const handleSubmit = () => {
    if (!target) return;
    const user = new PublicKey(target);

    if (action === 'add') {
      send(() => buildBlacklistAddTx(connection, publicKey, config.mint, user), onRefresh);
    } else {
      send(() => buildBlacklistRemoveTx(connection, publicKey, config.mint, user), onRefresh);
    }
  };

  return (
    <div className="max-w-lg mx-auto space-y-6 animate-fade-in">
      {/* SSS-2 badge */}
      <div className="card p-4 flex items-center gap-3">
        <span className="badge-green">SSS-2</span>
        <span className="text-sm text-gray-400">
          Compliance features enabled — blacklist, seize, transfer hook enforcement
        </span>
      </div>

      <BlacklistChecker config={config} />

      {/* Blacklist management */}
      <div className="card p-6">
        <h3 className="text-sm font-semibold text-white mb-1">Blacklist Management</h3>
        <p className="text-xs text-gray-500 mb-4">
          Add or remove addresses from the compliance blacklist. Requires Blacklister role.
        </p>

        {/* Action toggle */}
        <div className="flex bg-gray-800/50 rounded-lg p-1 mb-4">
          {[
            { id: 'add', label: '🚫 Add to Blacklist' },
            { id: 'remove', label: '✅ Remove' },
          ].map((a) => (
            <button
              key={a.id}
              onClick={() => { setAction(a.id); reset(); }}
              className={`flex-1 py-2 rounded-md text-sm font-medium transition-all ${
                action === a.id
                  ? 'bg-gray-700 text-white shadow-sm'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              {a.label}
            </button>
          ))}
        </div>

        <div className="mb-4">
          <label className="label">Target Address</label>
          <input
            type="text"
            className="input-field"
            placeholder="Wallet address..."
            value={target}
            onChange={(e) => setTarget(e.target.value)}
          />
        </div>

        <button
          onClick={handleSubmit}
          disabled={!target || status.state === 'sending'}
          className={action === 'add' ? 'btn-danger w-full' : 'btn-primary w-full'}
        >
          {action === 'add' ? 'Add to Blacklist' : 'Remove from Blacklist'}
        </button>

        <TxStatus status={status} onReset={reset} />
      </div>

      {/* Seize info */}
      {config.features.hasSeize && (
        <div className="card p-6">
          <h3 className="text-sm font-semibold text-white mb-1">Asset Seizure</h3>
          <p className="text-xs text-gray-500 mb-3">
            Seize tokens from blacklisted addresses using burn+mint enforcement.
            Requires Seizer role. Use the CLI for seizure operations:
          </p>
          <div className="bg-gray-800/50 rounded-lg p-3 font-mono text-xs text-gray-400">
            sss-token blacklist seize --mint {'<MINT>'} --target {'<ADDRESS>'}
          </div>
        </div>
      )}
    </div>
  );
}
