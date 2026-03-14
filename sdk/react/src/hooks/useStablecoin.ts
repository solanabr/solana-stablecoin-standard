import { useSSSContext } from "../provider";
import type { SolanaStablecoin } from "@stbr/sss-token";

/**
 * Returns the loaded SolanaStablecoin instance from context.
 * Throws if used outside of SSSProvider or if the instance has not loaded yet.
 */
export function useStablecoin(): SolanaStablecoin {
  const { stablecoin, loading, error } = useSSSContext();

  if (error) {
    throw error;
  }

  if (loading || !stablecoin) {
    throw new Error(
      "Stablecoin instance is not yet loaded. " +
        "Ensure useStablecoin is used within a <SSSProvider> and loading is complete.",
    );
  }

  return stablecoin;
}
