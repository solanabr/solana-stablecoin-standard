"use client";

import { useCallback, useRef, useState } from "react";
import { useConnection } from "@solana/wallet-adapter-react";

export type TxStatus = "idle" | "sending" | "confirming" | "confirmed" | "error";

export interface TxState {
  status: TxStatus;
  signature: string | null;
  explorerUrl: string | null;
  label: string | null;
  error: string | null;
}

const INITIAL: TxState = {
  status: "idle",
  signature: null,
  explorerUrl: null,
  label: null,
  error: null,
};

export function useTransactionStatus() {
  const { connection } = useConnection();
  const [txState, setTxState] = useState<TxState>(INITIAL);
  const abortRef = useRef(false);

  const reset = useCallback(() => {
    abortRef.current = true;
    setTxState(INITIAL);
  }, []);

  /**
   * Wraps an async SDK operation that returns an OperationResult.
   * Manages status transitions: idle → sending → confirming → confirmed | error
   */
  const run = useCallback(
    async (
      operation: () => Promise<{ signature: string; explorerUrl: string; label: string }>,
      label: string
    ): Promise<{ signature: string; explorerUrl: string; label: string } | null> => {
      abortRef.current = false;
      setTxState({ status: "sending", signature: null, explorerUrl: null, label, error: null });

      try {
        const result = await operation();
        if (abortRef.current) return null;

        setTxState({
          status: "confirmed",
          signature: result.signature,
          explorerUrl: result.explorerUrl,
          label: result.label,
          error: null,
        });

        return result;
      } catch (err: unknown) {
        if (abortRef.current) return null;
        const message =
          err instanceof Error
            ? err.message
            : typeof err === "string"
            ? err
            : "Unknown error";

        setTxState({ status: "error", signature: null, explorerUrl: null, label, error: message });
        return null;
      }
    },
    []
  );

  return { txState, run, reset };
}
