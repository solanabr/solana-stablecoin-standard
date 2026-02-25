"use client";

import { useState, useCallback } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { Transaction } from "@solana/web3.js";

export interface TxResult {
  signature: string | null;
  error: string | null;
  loading: boolean;
}

export function useTransaction() {
  const { connection } = useConnection();
  const { sendTransaction } = useWallet();
  const [result, setResult] = useState<TxResult>({
    signature: null,
    error: null,
    loading: false,
  });

  const execute = useCallback(
    async (tx: Transaction) => {
      setResult({ signature: null, error: null, loading: true });
      try {
        const signature = await sendTransaction(tx, connection);
        await connection.confirmTransaction(signature, "confirmed");
        setResult({ signature, error: null, loading: false });
        return signature;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setResult({ signature: null, error: message, loading: false });
        return null;
      }
    },
    [sendTransaction, connection],
  );

  const reset = useCallback(() => {
    setResult({ signature: null, error: null, loading: false });
  }, []);

  return { ...result, execute, reset };
}
