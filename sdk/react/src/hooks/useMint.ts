import { useState, useCallback } from "react";
import type { PublicKey } from "@solana/web3.js";
import type { BN } from "@coral-xyz/anchor";
import { useSSSContext } from "../provider";

export interface UseMintResult {
  mint: (amount: BN, recipient: PublicKey) => Promise<string>;
  loading: boolean;
  error: Error | null;
}

export function useMint(): UseMintResult {
  const { stablecoin } = useSSSContext();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const mint = useCallback(
    async (amount: BN, recipient: PublicKey): Promise<string> => {
      if (!stablecoin) {
        throw new Error("Stablecoin instance not loaded");
      }

      setLoading(true);
      setError(null);
      try {
        const txSignature = await stablecoin.mint({ amount, recipient });
        return txSignature;
      } catch (err) {
        const wrapped = err instanceof Error ? err : new Error(String(err));
        setError(wrapped);
        throw wrapped;
      } finally {
        setLoading(false);
      }
    },
    [stablecoin],
  );

  return { mint, loading, error };
}
