import React, { useState } from 'react';
import { PublicKey } from '@solana/web3.js';
import { useConnection } from '@solana/wallet-adapter-react';
import { useTxSender, TxStatus } from '../hooks/useTxSender';
import { buildGrantRoleTx, buildRevokeRoleTx } from '../hooks/txBuilder';
import { ROLES } from '../config';

export default function RolesPanel({ config, userRole, onRefresh }) {
  const { connection } = useConnection();
  const { status, send, reset, publicKey } = useTxSender();
  const [target, setTarget] = useState('');
  const [selectedRoles, setSelectedRoles] = useState([]);
  const [quota, setQuota] = useState('1000000');
  const [mode, setMode] = useState('grant');

  if (!config) {
    return (
      <div className="text-center py-20 text-gray-500">
        <p className="text-4xl mb-3">🔑</p>
        <p>Load a stablecoin first</p>
      </div>
    );
  }

  const toggleRole = (roleName) => {
    setSelectedRoles((prev) =>
      prev.includes(roleName) ? prev.filter((r) => r !== roleName) : [...prev, roleName]
    );
  };

  const roleMask = selectedRoles.reduce((acc, name) => acc | ROLES[name], 0);

  const handleSubmit = () => {
    if (!target || !roleMask) return;
    const user = new PublicKey(target);

    if (mode === 'grant') {
      const q = parseInt(quota) * Math.pow(10, config.decimals);
      send(
        () => buildGrantRoleTx(connection, publicKey, config.mint, user, roleMask, q),
        onRefresh
      );
    } else {
      send(
        () => buildRevokeRoleTx(connection, publicKey, config.mint, user, roleMask),
        onRefresh
      );
    }
  };

  return (
    <div className="max-w-lg mx-auto space-y-6 animate-fade-in">
      {/* Your roles */}
      <div className="card p-6">
        <h3 className="text-sm font-semibold text-white mb-3">Your Roles</h3>
        {userRole ? (
          <div className="flex flex-wrap gap-2">
            {userRole.roles.map((r) => (
              <span key={r} className="badge-green">{r}</span>
            ))}
            {userRole.roles.includes('Minter') && (
              <span className="text-xs text-gray-500 ml-2">
                Quota: {(userRole.mintedAmount / Math.pow(10, config.decimals)).toLocaleString()} / {(userRole.mintQuota / Math.pow(10, config.decimals)).toLocaleString()}
              </span>
            )}
          </div>
        ) : (
          <p className="text-sm text-gray-500">No roles assigned</p>
        )}
      </div>

      {/* Manage roles */}
      <div className="card p-6">
        <h3 className="text-sm font-semibold text-white mb-1">Manage Roles</h3>
        <p className="text-xs text-gray-500 mb-4">Authority only. Grant or revoke roles for any user.</p>

        {/* Mode toggle */}
        <div className="flex bg-gray-800/50 rounded-lg p-1 mb-4">
          {['grant', 'revoke'].map((m) => (
            <button
              key={m}
              onClick={() => { setMode(m); reset(); }}
              className={`flex-1 py-2 rounded-md text-sm font-medium transition-all ${
                mode === m
                  ? 'bg-gray-700 text-white shadow-sm'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              {m === 'grant' ? '✅ Grant' : '🚫 Revoke'}
            </button>
          ))}
        </div>

        {/* Target address */}
        <div className="mb-4">
          <label className="label">User Address</label>
          <input
            type="text"
            className="input-field"
            placeholder="Wallet address..."
            value={target}
            onChange={(e) => setTarget(e.target.value)}
          />
        </div>

        {/* Role checkboxes */}
        <div className="mb-4">
          <label className="label">Roles</label>
          <div className="grid grid-cols-2 gap-2 mt-1">
            {Object.keys(ROLES).map((name) => (
              <button
                key={name}
                onClick={() => toggleRole(name)}
                className={`px-3 py-2 rounded-lg text-sm font-medium border transition-all ${
                  selectedRoles.includes(name)
                    ? 'bg-sol-900/40 border-sol-700/50 text-sol-300'
                    : 'bg-gray-800/40 border-gray-700/40 text-gray-500 hover:text-gray-300'
                }`}
              >
                {selectedRoles.includes(name) ? '✓ ' : ''}{name}
              </button>
            ))}
          </div>
        </div>

        {/* Quota (grant only, minter) */}
        {mode === 'grant' && selectedRoles.includes('Minter') && (
          <div className="mb-4">
            <label className="label">Mint Quota</label>
            <input
              type="number"
              className="input-field"
              placeholder="1000000"
              value={quota}
              onChange={(e) => setQuota(e.target.value)}
            />
          </div>
        )}

        <button
          onClick={handleSubmit}
          disabled={!target || !roleMask || status.state === 'sending'}
          className={mode === 'grant' ? 'btn-primary w-full' : 'btn-danger w-full'}
        >
          {mode === 'grant' ? 'Grant Roles' : 'Revoke Roles'}
        </button>

        <TxStatus status={status} onReset={reset} />
      </div>
    </div>
  );
}
