import React, { FC, ReactNode, useMemo } from 'react';
import {
  ConnectionProvider,
  WalletProvider,
} from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { PhantomWalletAdapter, SolflareWalletAdapter } from '@solana/wallet-adapter-wallets';
import { clusterApiUrl } from '@solana/web3.js';
import '@solana/wallet-adapter-react-ui/styles.css';

const NETWORKS = {
  devnet: clusterApiUrl('devnet'),
  mainnet: clusterApiUrl('mainnet-beta'),
  localnet: 'http://localhost:8899',
} as const;

export type NetworkName = keyof typeof NETWORKS;

export const WalletContextProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const network = (localStorage.getItem('sss-network') || 'devnet') as NetworkName;
  const customRpc = localStorage.getItem('sss-rpc-url')?.trim();
  const endpoint = customRpc || NETWORKS[network] || NETWORKS.devnet;
  const wallets = useMemo(() => [new PhantomWalletAdapter(), new SolflareWalletAdapter()], []);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
};
