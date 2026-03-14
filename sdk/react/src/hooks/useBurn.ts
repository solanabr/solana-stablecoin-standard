import { useState, useCallback } from "react";
import type { BN } from "@coral-xyz/anchor";
import { useSSSContext } from "../provider";

export interface UseBurnResult {
  burn: (amount: BN) => Promise<string>;
  loading: boolean;
  error: Error | null;
}

export function useBurn(): UseBurnResult {
  const { stablecoin } = useSSSContext();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const burn = useCallback(
    async (amount: BN): Promise<string> => {
      if (!stablecoin) {
        throw new Error("Stablecoin instance not loaded");
      }

      setLoading(true);
      setError(null);
      try {
        const txSignature = await stablecoin.burn({ amount });
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

  return { burn, loading, error };
}
