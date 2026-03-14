import React from 'react';
import ReactDOM from 'react-dom/client';
import {
  ConnectionProvider,
  WalletProvider,
} from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { PhantomWalletAdapter } from '@solana/wallet-adapter-phantom';
import '@solana/wallet-adapter-react-ui/styles.css';
import { AppProvider } from './state/AppContext';
import { App } from './app/App';
import { DEFAULT_RPC_URL } from './app/constants';
import './styles/index.css';

const wallets = [new PhantomWalletAdapter()];
const endpoint = DEFAULT_RPC_URL;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <AppProvider>
            <App />
          </AppProvider>
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  </React.StrictMode>,
);
