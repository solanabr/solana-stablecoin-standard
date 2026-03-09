import { useCallback, useEffect, useState } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";

export interface WalletConnectionState {
  /** Whether a wallet is connected */
  connected: boolean;
  /** Base58 public key string, or null */
  publicKey: string | null;
  /** SOL balance in whole SOL (not lamports), or null if unavailable */
  solBalance: number | null;
  /** Whether the balance is being fetched */
  balanceLoading: boolean;
  /** Disconnect the currently connected wallet */
  disconnect: () => Promise<void>;
  /** Refresh the SOL balance manually */
  refreshBalance: () => Promise<void>;
  /** Truncated address for display, e.g. "GmG4...Zi4" */
  displayAddress: string | null;
}

/**
 * Convenience hook that bundles wallet connection state and the current SOL
 * balance into a single object. Components that only need a subset can
 * destructure what they need.
 */
export function useWalletConnection(): WalletConnectionState {
  const { connected, publicKey, disconnect: adapterDisconnect } = useWallet();
  const { connection } = useConnection();

  const [solBalance, setSolBalance] = useState<number | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);

  const fetchBalance = useCallback(async () => {
    if (!publicKey) {
      setSolBalance(null);
      return;
    }
    setBalanceLoading(true);
    try {
      const lamports = await connection.getBalance(publicKey);
      setSolBalance(lamports / LAMPORTS_PER_SOL);
    } catch {
      setSolBalance(null);
    } finally {
      setBalanceLoading(false);
    }
  }, [publicKey, connection]);

  // Fetch balance when wallet connects or network changes
  useEffect(() => {
    fetchBalance();
  }, [fetchBalance]);

  // Poll balance every 30 s while wallet is connected
  useEffect(() => {
    if (!connected) return;
    const id = setInterval(() => fetchBalance(), 30_000);
    return () => clearInterval(id);
  }, [connected, fetchBalance]);

  const disconnect = useCallback(async () => {
    await adapterDisconnect();
    setSolBalance(null);
  }, [adapterDisconnect]);

  const displayAddress = publicKey
    ? `${publicKey.toBase58().slice(0, 4)}...${publicKey.toBase58().slice(-4)}`
    : null;

  return {
    connected,
    publicKey: publicKey?.toBase58() ?? null,
    solBalance,
    balanceLoading,
    disconnect,
    refreshBalance: fetchBalance,
    displayAddress,
  };
}
