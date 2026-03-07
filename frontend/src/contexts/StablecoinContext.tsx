import React, { createContext, useContext, useState, ReactNode } from 'react';
import { PublicKey } from '@solana/web3.js';

export type PresetType = 'SSS_1' | 'SSS_2' | 'CUSTOM';

export interface StablecoinInfo {
  mint: string;
  name: string;
  symbol: string;
  decimals: number;
  preset: PresetType;
  paused: boolean;
  totalMinted: string;
  totalBurned: string;
  masterAuthority: string;
  enablePermanentDelegate: boolean;
  enableTransferHook: boolean;
  defaultAccountFrozen: boolean;
}

interface StablecoinContextType {
  currentMint: string | null;
  setCurrentMint: (mint: string | null) => void;
  stablecoinInfo: StablecoinInfo | null;
  setStablecoinInfo: (info: StablecoinInfo | null) => void;
  recentMints: string[];
  addRecentMint: (mint: string) => void;
}

const StablecoinContext = createContext<StablecoinContextType>({
  currentMint: null,
  setCurrentMint: () => {},
  stablecoinInfo: null,
  setStablecoinInfo: () => {},
  recentMints: [],
  addRecentMint: () => {},
});

export const useStablecoin = () => useContext(StablecoinContext);

export const StablecoinProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [currentMint, setCurrentMint] = useState<string | null>(
    localStorage.getItem('sss-current-mint')
  );
  const [stablecoinInfo, setStablecoinInfo] = useState<StablecoinInfo | null>(null);
  const [recentMints, setRecentMints] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('sss-recent-mints') || '[]');
    } catch {
      return [];
    }
  });

  const handleSetCurrentMint = (mint: string | null) => {
    setCurrentMint(mint);
    if (mint) localStorage.setItem('sss-current-mint', mint);
    else localStorage.removeItem('sss-current-mint');
  };

  const addRecentMint = (mint: string) => {
    setRecentMints((prev) => {
      const next = [mint, ...prev.filter((m) => m !== mint)].slice(0, 10);
      localStorage.setItem('sss-recent-mints', JSON.stringify(next));
      return next;
    });
  };

  return (
    <StablecoinContext.Provider
      value={{
        currentMint,
        setCurrentMint: handleSetCurrentMint,
        stablecoinInfo,
        setStablecoinInfo,
        recentMints,
        addRecentMint,
      }}
    >
      {children}
    </StablecoinContext.Provider>
  );
};
