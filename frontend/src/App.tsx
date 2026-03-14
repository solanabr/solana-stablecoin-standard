import { useMemo, useState } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import {
  PhantomWalletAdapter,
  SolflareWalletAdapter,
} from "@solana/wallet-adapter-wallets";
import { clusterApiUrl } from "@solana/web3.js";
import { Toaster } from "react-hot-toast";
import { motion, AnimatePresence } from "framer-motion";

import ErrorBoundary from "./components/ErrorBoundary";
import Sidebar from "./components/Sidebar";
import Header from "./components/Header";
import MintAddressBar from "./components/MintAddressBar";
import Dashboard from "./pages/Dashboard";
import Initialize from "./pages/Initialize";
import MintBurn from "./pages/MintBurn";
import Transfer from "./pages/Transfer";
import Blacklist from "./pages/Blacklist";
import Allowlist from "./pages/Allowlist";
import Roles from "./pages/Roles";
import FreezeThaw from "./pages/FreezeThaw";
import PauseUnpause from "./pages/PauseUnpause";
import Seize from "./pages/Seize";
import Authority from "./pages/Authority";
import Metadata from "./pages/Metadata";
import MinterQuotas from "./pages/MinterQuotas";
import Holders from "./pages/Holders";
import AuditLog from "./pages/AuditLog";

const pageVariants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -4 },
};

function AnimatedPage({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={{ duration: 0.25, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}

export default function App() {
  const endpoint = useMemo(() => clusterApiUrl("devnet"), []);
  const wallets = useMemo(
    () => [new PhantomWalletAdapter(), new SolflareWalletAdapter()],
    []
  );
  const [mintAddress, setMintAddress] = useState("");
  const location = useLocation();

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <Toaster
            position="bottom-right"
            toastOptions={{
              duration: 4000,
              style: {
                background: "#161825",
                color: "#e8e8ed",
                border: "1px solid #2A2D42",
                borderRadius: "12px",
                fontSize: "13px",
                fontFamily: "Inter, system-ui, sans-serif",
                boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
              },
              success: {
                iconTheme: { primary: "#00FFA3", secondary: "#0A0B14" },
              },
              error: {
                iconTheme: { primary: "#EF4444", secondary: "#0A0B14" },
              },
            }}
          />
          <div className="flex h-screen overflow-hidden bg-surface-0">
            <Sidebar />
            <div className="flex flex-col flex-1 overflow-hidden">
              <Header />
              <MintAddressBar
                mintAddress={mintAddress}
                onMintAddressChange={setMintAddress}
              />
              <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
                <ErrorBoundary>
                <AnimatePresence mode="wait">
                  <Routes location={location} key={location.pathname}>
                    <Route path="/" element={<AnimatedPage><Dashboard mintAddress={mintAddress} /></AnimatedPage>} />
                    <Route path="/initialize" element={<AnimatedPage><Initialize /></AnimatedPage>} />
                    <Route path="/mint-burn" element={<AnimatedPage><MintBurn mintAddress={mintAddress} /></AnimatedPage>} />
                    <Route path="/transfer" element={<AnimatedPage><Transfer mintAddress={mintAddress} /></AnimatedPage>} />
                    <Route path="/blacklist" element={<AnimatedPage><Blacklist mintAddress={mintAddress} /></AnimatedPage>} />
                    <Route path="/allowlist" element={<AnimatedPage><Allowlist mintAddress={mintAddress} /></AnimatedPage>} />
                    <Route path="/roles" element={<AnimatedPage><Roles mintAddress={mintAddress} /></AnimatedPage>} />
                    <Route path="/freeze-thaw" element={<AnimatedPage><FreezeThaw mintAddress={mintAddress} /></AnimatedPage>} />
                    <Route path="/pause-unpause" element={<AnimatedPage><PauseUnpause mintAddress={mintAddress} /></AnimatedPage>} />
                    <Route path="/seize" element={<AnimatedPage><Seize mintAddress={mintAddress} /></AnimatedPage>} />
                    <Route path="/authority" element={<AnimatedPage><Authority mintAddress={mintAddress} /></AnimatedPage>} />
                    <Route path="/metadata" element={<AnimatedPage><Metadata mintAddress={mintAddress} /></AnimatedPage>} />
                    <Route path="/minter-quotas" element={<AnimatedPage><MinterQuotas mintAddress={mintAddress} /></AnimatedPage>} />
                    <Route path="/holders" element={<AnimatedPage><Holders mintAddress={mintAddress} /></AnimatedPage>} />
                    <Route path="/audit-log" element={<AnimatedPage><AuditLog mintAddress={mintAddress} /></AnimatedPage>} />
                    <Route path="*" element={<Navigate to="/" replace />} />
                  </Routes>
                </AnimatePresence>
                </ErrorBoundary>
              </main>
            </div>
          </div>
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
