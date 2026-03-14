import React, { createContext, useContext, useEffect, useState } from "react";
import type { Program } from "@coral-xyz/anchor";
import type { PublicKey } from "@solana/web3.js";
import { SolanaStablecoin } from "@stbr/sss-token";

export interface SSSContextValue {
  program: Program;
  mint: PublicKey;
  stablecoin: SolanaStablecoin | null;
  loading: boolean;
  error: Error | null;
}

const SSSContext = createContext<SSSContextValue | null>(null);

export interface SSSProviderProps {
  program: Program;
  mint: PublicKey;
  children: React.ReactNode;
}

export function SSSProvider({ program, mint, children }: SSSProviderProps) {
  const [stablecoin, setStablecoin] = useState<SolanaStablecoin | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const instance = await SolanaStablecoin.load(program, mint);
        if (!cancelled) {
          setStablecoin(instance);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error(String(err)));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [program, mint]);

  const value: SSSContextValue = {
    program,
    mint,
    stablecoin,
    loading,
    error,
  };

  return <SSSContext.Provider value={value}>{children}</SSSContext.Provider>;
}

export function useSSSContext(): SSSContextValue {
  const ctx = useContext(SSSContext);
  if (!ctx) {
    throw new Error("useSSSContext must be used within a <SSSProvider>");
  }
  return ctx;
}
