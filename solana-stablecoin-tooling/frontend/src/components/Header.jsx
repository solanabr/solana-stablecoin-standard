import React from 'react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { useWallet } from '@solana/wallet-adapter-react';

const TABS = [
  { id: 'create', label: 'Create', icon: '🚀' },
  { id: 'overview', label: 'Overview', icon: '◎' },
  { id: 'mint-burn', label: 'Mint / Burn', icon: '⚡' },
  { id: 'freeze', label: 'Freeze', icon: '❄' },
  { id: 'roles', label: 'Roles', icon: '🔑' },
  { id: 'compliance', label: 'Compliance', icon: '🛡' },
];

export default function Header({ activeTab, onTabChange, preset }) {
  const { connected } = useWallet();

  return (
    <header className="sticky top-0 z-50 backdrop-blur-xl bg-gray-950/80 border-b border-gray-800/40">
      <div className="max-w-7xl mx-auto px-6">
        {/* Top bar */}
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-sol-400 to-sol-600 flex items-center justify-center text-sm font-bold text-white shadow-lg shadow-sol-600/20">
              S
            </div>
            <div>
              <h1 className="text-lg font-semibold tracking-tight">
                Stablecoin Standard
              </h1>
              <p className="text-[10px] text-gray-500 uppercase tracking-widest -mt-0.5">
                {preset === 0 ? 'SSS-1 Minimal' : preset === 1 ? 'SSS-2 Compliant' : 'Custom Config'}
                {' · Devnet'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {connected && (
              <div className="hidden sm:flex items-center gap-1.5 text-xs text-emerald-400">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Connected
              </div>
            )}
            <WalletMultiButton />
          </div>
        </div>

        {/* Tab bar */}
        <nav className="flex gap-1 -mb-px overflow-x-auto scrollbar-none">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`
                flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium rounded-t-lg transition-all duration-200 whitespace-nowrap
                ${activeTab === tab.id
                  ? 'text-sol-400 bg-gray-900/60 border border-gray-800/60 border-b-transparent'
                  : 'text-gray-500 hover:text-gray-300 border border-transparent'
                }
              `}
            >
              <span className="text-base">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </nav>
      </div>
    </header>
  );
}
