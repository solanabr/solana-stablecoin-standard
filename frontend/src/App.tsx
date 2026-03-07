import { FC, useMemo, useState } from 'react';
import { ConnectionProvider, WalletProvider, useWallet } from '@solana/wallet-adapter-react';
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base';
import { PhantomWalletAdapter, SolflareWalletAdapter } from '@solana/wallet-adapter-wallets';
import { WalletModalProvider, WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { clusterApiUrl } from '@solana/web3.js';
import { Toaster, toast } from 'react-hot-toast';
import '@solana/wallet-adapter-react-ui/styles.css';
import './App.css';

const App: FC = () => {
  return (
    <Context>
      <Content />
      <Toaster position="bottom-right" />
    </Context>
  );
};

const Context: FC<{ children: React.ReactNode }> = ({ children }) => {
  const network = WalletAdapterNetwork.Devnet;
  const endpoint = useMemo(() => clusterApiUrl(network), [network]);
  const wallets = useMemo(
    () => [
      new PhantomWalletAdapter(),
      new SolflareWalletAdapter({ network }),
    ],
    [network]
  );

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
};

const Content: FC = () => {
  const { publicKey } = useWallet();
  const [preset, setPreset] = useState<string>('sss-1');
  const [name, setName] = useState('My Stablecoin');
  const [symbol, setSymbol] = useState('MYUSD');
  const [decimals, setDecimals] = useState(6);

  const createStablecoin = () => {
    if (!publicKey) {
      toast.error('Please connect your wallet');
      return;
    }
    toast.success(`Creating ${symbol} stablecoin...`);
  };

  return (
    <div className="app">
      <header className="header">
        <div className="container">
          <div className="header-content">
            <div className="logo">
              <span className="logo-icon">◎</span>
              <h1>Solana Stablecoin Standard</h1>
            </div>
            <WalletMultiButton />
          </div>
        </div>
      </header>

      <main className="main">
        <div className="container">
          <section className="hero">
            <h2>Create Your Stablecoin</h2>
            <p>Production-ready stablecoin SDK for Solana</p>
          </section>

          <section className="card">
            <h3>1. Initialize Stablecoin</h3>
            <div className="form-group">
              <label>Preset</label>
              <select value={preset} onChange={(e) => setPreset(e.target.value)}>
                <option value="sss-1">SSS-1: Minimal (Basic features)</option>
                <option value="sss-2">SSS-2: Compliant (With blacklist)</option>
                <option value="sss-3">SSS-3: Private (Confidential transfers)</option>
              </select>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Token Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="My Stablecoin"
                />
              </div>
              <div className="form-group">
                <label>Symbol</label>
                <input
                  type="text"
                  value={symbol}
                  onChange={(e) => setSymbol(e.target.value)}
                  placeholder="MYUSD"
                />
              </div>
              <div className="form-group">
                <label>Decimals</label>
                <input
                  type="number"
                  value={decimals}
                  onChange={(e) => setDecimals(parseInt(e.target.value))}
                  min="0"
                  max="9"
                />
              </div>
            </div>
            <button className="btn btn-primary" onClick={createStablecoin} disabled={!publicKey}>
              Create Stablecoin
            </button>
          </section>

          <section className="features">
            <h3>Features</h3>
            <div className="feature-grid">
              <div className="feature">
                <div className="feature-icon">🚀</div>
                <h4>SSS-1: Minimal</h4>
                <p>Basic mint, burn, and freeze capabilities</p>
              </div>
              <div className="feature">
                <div className="feature-icon">🔒</div>
                <h4>SSS-2: Compliant</h4>
                <p>Blacklist and compliance features</p>
              </div>
              <div className="feature">
                <div className="feature-icon">🔐</div>
                <h4>SSS-3: Private</h4>
                <p>Confidential transfers (experimental)</p>
              </div>
            </div>
          </section>
        </div>
      </main>

      <footer className="footer">
        <div className="container">
          <p>Built with ❤️ by Superteam Brazil</p>
          <div className="footer-links">
            <a href="https://github.com/solanabr/solana-stablecoin-standard" target="_blank" rel="noopener noreferrer">
              GitHub
            </a>
            <a href="https://docs.superteam.fun" target="_blank" rel="noopener noreferrer">
              Documentation
            </a>
            <a href="https://twitter.com/SuperteamBR" target="_blank" rel="noopener noreferrer">
              Twitter
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default App;
