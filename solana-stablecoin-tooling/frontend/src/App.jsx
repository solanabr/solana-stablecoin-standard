import React, { useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import Header from './components/Header';
import Overview from './components/Overview';
import MintBurn from './components/MintBurn';
import FreezePanel from './components/FreezePanel';
import RolesPanel from './components/RolesPanel';
import CompliancePanel from './components/CompliancePanel';
import CreateWizard from './components/CreateWizard';
import { useStablecoin } from './hooks/useStablecoin';

export default function App() {
  const { connected } = useWallet();
  const [activeTab, setActiveTab] = useState('overview');
  const [mintInput, setMintInput] = useState('');
  const [mintAddress, setMintAddress] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  const { config, mintInfo, userRole, loading, error, refresh } = useStablecoin(mintAddress);

  const handleLoadMint = (e) => {
    e.preventDefault();
    if (mintInput.trim()) {
      setMintAddress(mintInput.trim());
      setShowCreate(false);
    }
  };

  const handleCreated = (newMint) => {
    setMintInput(newMint);
    setMintAddress(newMint);
    setShowCreate(false);
    setActiveTab('overview');
  };

  const preset = config?.preset ?? -1;

  return (
    <div className="min-h-screen">
      <Header activeTab={activeTab} onTabChange={(t) => { setActiveTab(t); setShowCreate(false); }} preset={preset} />

      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Mint address input + Create button */}
        <form onSubmit={handleLoadMint} className="mb-8">
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <label className="label">Mint Address</label>
              <input
                type="text"
                className="input-field"
                placeholder="Enter your stablecoin mint address..."
                value={mintInput}
                onChange={(e) => setMintInput(e.target.value)}
              />
            </div>
            <button type="submit" className="btn-primary h-[42px]" disabled={loading}>
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Loading
                </span>
              ) : (
                'Load'
              )}
            </button>
            {mintAddress && (
              <button type="button" onClick={refresh} className="btn-secondary h-[42px]" title="Refresh">↻</button>
            )}
            <button
              type="button"
              onClick={() => setShowCreate(!showCreate)}
              className={`h-[42px] whitespace-nowrap ${showCreate ? 'btn-secondary' : 'btn-primary'}`}
            >
              {showCreate ? '✕ Cancel' : '+ Create New'}
            </button>
          </div>
          {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
        </form>

        {/* Not connected banner */}
        {!connected && (
          <div className="card p-6 mb-6 text-center border-amber-800/30 bg-amber-950/10">
            <p className="text-amber-400 text-sm">
              Connect your wallet to perform operations. You can still view stablecoin details.
            </p>
          </div>
        )}

        {/* Create wizard or tab content */}
        <div className="min-h-[400px]">
          {showCreate ? (
            <CreateWizard onCreated={handleCreated} />
          ) : (
            <>
              {activeTab === 'overview' && <Overview config={config} mintInfo={mintInfo} />}
              {activeTab === 'mint-burn' && <MintBurn config={config} mintInfo={mintInfo} onRefresh={refresh} />}
              {activeTab === 'freeze' && <FreezePanel config={config} onRefresh={refresh} />}
              {activeTab === 'roles' && <RolesPanel config={config} userRole={userRole} onRefresh={refresh} />}
              {activeTab === 'compliance' && <CompliancePanel config={config} onRefresh={refresh} />}
            </>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="max-w-7xl mx-auto px-6 py-8 border-t border-gray-800/40">
        <div className="flex items-center justify-between text-xs text-gray-600">
          <span>Solana Stablecoin Standard · Devnet</span>
          <span>Built with SSS SDK + Token-2022</span>
        </div>
      </footer>
    </div>
  );
}
