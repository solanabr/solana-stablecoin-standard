"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { BN, type Wallet as AnchorWallet } from "@coral-xyz/anchor";
import {
  SSSClient,
  type AllowlistEntry,
  type StablecoinConfig,
  type RoleRegistry,
  type MinterInfo,
} from "solana-stablecoin-standard";
import {
  buildRetryMessage,
  getNormalizedRpcError,
  isAccountNotFoundError,
  withRpcRetry,
} from "@/components/dashboard/rpcUtils";

let _defaultMint: PublicKey | null = null;
function getDefaultMint(): PublicKey {
  if (!_defaultMint) {
    const mintEnv = process.env.NEXT_PUBLIC_DEFAULT_MINT;
    if (!mintEnv || !mintEnv.trim()) {
      throw new Error(
        "NEXT_PUBLIC_DEFAULT_MINT environment variable is required"
      );
    }
    try {
      _defaultMint = new PublicKey(mintEnv.trim());
    } catch {
      throw new Error(
        `NEXT_PUBLIC_DEFAULT_MINT contains an invalid public key: "${mintEnv.trim()}"`
      );
    }
  }
  return _defaultMint;
}

type SupplyState = {
  totalMinted: BN;
  totalBurned: BN;
  currentSupply: BN;
  decimals: number;
};

type RetryState = {
  attempt: number;
  message: string;
};

export interface SSSState {
  client: SSSClient | null;
  config: StablecoinConfig | null;
  roles: RoleRegistry | null;
  supply: SupplyState | null;
  minters: { pubkey: PublicKey; account: MinterInfo }[];
  allowlistEntries: { pubkey: PublicKey; account: AllowlistEntry }[];
  loading: boolean;
  error: string | null;
  retrying: RetryState | null;
  lastUpdated: number | null;
  mint: PublicKey;
  setMint: (mint: PublicKey) => void;
  refresh: () => Promise<void>;
}

function deriveSupply(config: StablecoinConfig): SupplyState {
  return {
    totalMinted: config.totalMinted,
    totalBurned: config.totalBurned,
    currentSupply: config.totalMinted.sub(config.totalBurned),
    decimals: config.decimals,
  };
}

async function fetchAllAllowlistEntries(
  client: SSSClient,
  mint: PublicKey
): Promise<{ pubkey: PublicKey; account: AllowlistEntry }[]> {
  const [configPda] = client.getConfigPda(mint);
  const accounts = client.tokenProgram.account as unknown as {
    allowlistEntry: {
      all: (filters: { memcmp: { offset: number; bytes: string } }[]) => Promise<
        { publicKey: PublicKey; account: AllowlistEntry }[]
      >;
    };
  };
  const all = await accounts.allowlistEntry.all([
    { memcmp: { offset: 9, bytes: configPda.toBase58() } },
  ]);

  return all.map((account) => ({
    pubkey: account.publicKey,
    account: account.account,
  }));
}

export function useSSS(): SSSState {
  const { connection } = useConnection();
  const wallet = useWallet();
  const { publicKey, signTransaction, signAllTransactions } = wallet;
  const [mint, setMint] = useState<PublicKey>(getDefaultMint);
  const [config, setConfig] = useState<StablecoinConfig | null>(null);
  const [roles, setRoles] = useState<RoleRegistry | null>(null);
  const [supply, setSupply] = useState<SSSState["supply"]>(null);
  const [minters, setMinters] = useState<SSSState["minters"]>([]);
  const [allowlistEntries, setAllowlistEntries] = useState<
    SSSState["allowlistEntries"]
  >([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState<RetryState | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const mountedRef = useRef(false);
  const debounceTimerRef = useRef<number | null>(null);
  const scheduledRefreshRef = useRef<{
    promise: Promise<void>;
    resolve: () => void;
    reject: (error?: unknown) => void;
  } | null>(null);
  const inFlightRef = useRef<Promise<void> | null>(null);
  const queuedRefreshRef = useRef(false);
  const requestGenRef = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);

  const client = useMemo(() => {
    if (!publicKey || !signTransaction || !signAllTransactions) return null;
    const anchorWallet = {
      publicKey,
      signTransaction,
      signAllTransactions,
    };
    return new SSSClient(connection, anchorWallet as unknown as AnchorWallet);
  }, [connection, publicKey, signAllTransactions, signTransaction]);

  const clearState = useCallback(() => {
    if (debounceTimerRef.current) {
      window.clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }

    if (scheduledRefreshRef.current) {
      scheduledRefreshRef.current.resolve();
      scheduledRefreshRef.current = null;
    }

    requestGenRef.current += 1;
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    inFlightRef.current = null;
    queuedRefreshRef.current = false;
    setConfig(null);
    setRoles(null);
    setSupply(null);
    setMinters([]);
    setAllowlistEntries([]);
    setLoading(false);
    setError(null);
    setRetrying(null);
    setLastUpdated(null);
  }, []);

  const loadState = useCallback(async () => {
    if (!client) {
      clearState();
      return;
    }

    // Cancel any previous in-flight request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;
    const gen = ++requestGenRef.current;

    const isStale = () =>
      !mountedRef.current || gen !== requestGenRef.current;

    setLoading(true);
    setError(null);
    setRetrying(null);

    try {
      const result = await withRpcRetry(
        async () => {
          controller.signal.throwIfAborted();

          const [configPda] = client.getConfigPda(mint);
          const configAccount = await client.fetchConfig(mint);

          controller.signal.throwIfAborted();

          const [minterList, allowlistList, roleRegistry] = await Promise.all([
            client.fetchAllMinters(mint).catch((fetchError) => {
              if (isAccountNotFoundError(fetchError)) {
                return [];
              }

              throw fetchError;
            }),
            fetchAllAllowlistEntries(client, mint).catch((fetchError) => {
              if (isAccountNotFoundError(fetchError)) {
                return [];
              }

              throw fetchError;
            }),
            client.fetchRoleRegistry(configPda).catch((fetchError) => {
              if (isAccountNotFoundError(fetchError)) {
                return null;
              }

              throw fetchError;
            }),
          ]);

          return {
            config: configAccount,
            supply: deriveSupply(configAccount),
            minters: minterList,
            allowlistEntries: allowlistList,
            roles: roleRegistry,
          };
        },
        {
          fallbackMessage: "Failed to load stablecoin data.",
          signal: controller.signal,
          onRetry: (retryError, delayMs, attempt) => {
            if (isStale()) return;
            const message = buildRetryMessage(retryError, delayMs);
            setRetrying({ attempt, message });
            setError(message);
          },
        }
      );

      if (isStale()) return;

      setConfig(result.config);
      setSupply(result.supply);
      setMinters(result.minters);
      setAllowlistEntries(result.allowlistEntries);
      setRoles(result.roles);
      setError(null);
      setRetrying(null);
      setLastUpdated(Date.now());
    } catch (loadError) {
      if (isStale()) return;

      const normalized = getNormalizedRpcError(
        loadError,
        "Failed to load stablecoin data."
      );

      if (normalized.kind === "not_found") {
        setConfig(null);
        setRoles(null);
        setSupply(null);
        setMinters([]);
        setAllowlistEntries([]);
        setLastUpdated(null);
      }

      setError(normalized.message);
      setRetrying(null);
    } finally {
      if (!isStale()) {
        setLoading(false);
      }
    }
  }, [clearState, client, mint]);

  const refresh = useCallback((): Promise<void> => {
    if (!client) {
      clearState();
      return Promise.resolve();
    }

    if (inFlightRef.current) {
      queuedRefreshRef.current = true;
      return inFlightRef.current.then(() => {
        if (!queuedRefreshRef.current) return;
        queuedRefreshRef.current = false;
        return refresh();
      });
    }

    if (!scheduledRefreshRef.current) {
      let resolvePromise!: () => void;
      let rejectPromise!: (error?: unknown) => void;
      const promise = new Promise<void>((resolve, reject) => {
        resolvePromise = resolve;
        rejectPromise = reject;
      });

      scheduledRefreshRef.current = {
        promise,
        resolve: resolvePromise,
        reject: rejectPromise,
      };
    }

    if (debounceTimerRef.current) {
      window.clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = window.setTimeout(() => {
      debounceTimerRef.current = null;
      const scheduled = scheduledRefreshRef.current;
      if (!scheduled) return;

      const request = loadState();
      inFlightRef.current = request;

      void request
        .then(() => {
          scheduled.resolve();
        })
        .catch((requestError) => {
          scheduled.reject(requestError);
        })
        .finally(() => {
          if (inFlightRef.current === request) {
            inFlightRef.current = null;
          }
          if (scheduledRefreshRef.current === scheduled) {
            scheduledRefreshRef.current = null;
          }
        });
    }, 250);

    return scheduledRefreshRef.current.promise;
  }, [clearState, client, loadState]);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      requestGenRef.current += 1;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      if (debounceTimerRef.current) {
        window.clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!client) {
      clearState();
      return;
    }

    void refresh();

    return () => {
      // Cancel in-flight requests when dependencies change
      requestGenRef.current += 1;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    };
  }, [client, clearState, mint, refresh]);

  return {
    client,
    config,
    roles,
    supply,
    minters,
    allowlistEntries,
    loading,
    error,
    retrying,
    lastUpdated,
    mint,
    setMint,
    refresh,
  };
}
