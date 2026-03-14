import { useState, useEffect, useCallback } from "react";
import type { StablecoinStatus } from "@stbr/sss-token";
import { useSSSContext } from "../provider";

export interface UseStablecoinStatusOptions {
  /** Polling interval in milliseconds (default: 10000) */
  pollInterval?: number;
}

export interface UseStablecoinStatusResult {
  status: StablecoinStatus | null;
  loading: boolean;
  error: Error | null;
  refetch: () => void;
}

export function useStablecoinStatus(
  options: UseStablecoinStatusOptions = {},
): UseStablecoinStatusResult {
  const { pollInterval = 10000 } = options;
  const { stablecoin } = useSSSContext();

  const [status, setStatus] = useState<StablecoinStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [fetchCount, setFetchCount] = useState(0);

  const refetch = useCallback(() => {
    setFetchCount((c) => c + 1);
  }, []);

  useEffect(() => {
    if (!stablecoin) return;

    let cancelled = false;

    async function fetchStatus() {
      setLoading(true);
      setError(null);
      try {
        const result = await stablecoin!.refresh();
        if (!cancelled) {
          setStatus(result);
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

    fetchStatus();

    const intervalId = setInterval(fetchStatus, pollInterval);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [stablecoin, pollInterval, fetchCount]);

  return { status, loading, error, refetch };
}
