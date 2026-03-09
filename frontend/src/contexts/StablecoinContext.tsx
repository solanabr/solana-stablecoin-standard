import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { AnchorProvider } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { SolanaStablecoin, StablecoinInfo } from "@sss/sdk";

// The IDL is loaded lazily so the bundle stays small. Consumers that actually
// need to send transactions will call `ensureSdk()` which triggers the import.
// For read-only display pages the SDK is also used (getStablecoinInfo).
// We keep a dynamic import to avoid bundling the full IDL at startup.

interface StablecoinContextValue {
  /** The mint address the user is currently inspecting */
  mintAddress: string;
  setMintAddress: (addr: string) => void;

  /** Parsed stablecoin info fetched from chain */
  info: StablecoinInfo | null;
  infoLoading: boolean;
  infoError: string | null;

  /** Trigger a manual refresh of stablecoin info */
  refreshInfo: () => Promise<void>;

  /** Get a ready-to-use SDK instance (throws if wallet not connected) */
  getSdk: () => Promise<SolanaStablecoin>;

  /** Whether the currently connected wallet is the admin of the loaded mint */
  isAdmin: boolean;
}

const StablecoinContext = createContext<StablecoinContextValue | null>(null);

export function useStablecoinContext(): StablecoinContextValue {
  const ctx = useContext(StablecoinContext);
  if (!ctx) {
    throw new Error("useStablecoinContext must be used within StablecoinProvider");
  }
  return ctx;
}

// ── IDL cache ──────────────────────────────────────────────────────────────
let cachedIdl: object | null = null;

async function loadIdl(): Promise<object> {
  if (cachedIdl) return cachedIdl;
  // The IDL lives next to the SDK dist; we import it dynamically.
  // Adjust the path if the IDL location differs.
  try {
    const mod = await import("../idl/sss_core.json");
    cachedIdl = mod.default ?? mod;
    return cachedIdl!;
  } catch {
    throw new Error(
      "Failed to load program IDL. Ensure frontend/src/idl/sss_core.json exists."
    );
  }
}

// ── Provider ───────────────────────────────────────────────────────────────

interface StablecoinProviderProps {
  children: React.ReactNode;
}

export function StablecoinProvider({ children }: StablecoinProviderProps) {
  const { connection } = useConnection();
  const wallet = useWallet();

  const [mintAddress, setMintAddress] = useState<string>(() => {
    return localStorage.getItem("sss_mint_address") ?? "";
  });
  const [info, setInfo] = useState<StablecoinInfo | null>(null);
  const [infoLoading, setInfoLoading] = useState(false);
  const [infoError, setInfoError] = useState<string | null>(null);

  // Persist mint address in localStorage across page reloads
  useEffect(() => {
    if (mintAddress) {
      localStorage.setItem("sss_mint_address", mintAddress);
    }
  }, [mintAddress]);

  // Build a read-only provider backed by a dummy wallet when no wallet is
  // connected — sufficient for fetchAccount calls (getStablecoinInfo).
  const buildReadOnlyProvider = useCallback((): AnchorProvider => {
    const dummyWallet = {
      publicKey: PublicKey.default,
      signTransaction: async (tx: unknown) => tx as never,
      signAllTransactions: async (txs: unknown[]) => txs as never,
    };
    return new AnchorProvider(connection, dummyWallet as never, {
      commitment: "confirmed",
    });
  }, [connection]);

  const buildProvider = useCallback((): AnchorProvider => {
    if (!wallet.publicKey || !wallet.signTransaction) {
      throw new Error("Wallet not connected");
    }
    return new AnchorProvider(
      connection,
      wallet as never,
      { commitment: "confirmed", preflightCommitment: "confirmed" }
    );
  }, [connection, wallet]);

  // ── Fetch stablecoin info ────────────────────────────────────────────────

  const fetchInfo = useCallback(async (): Promise<void> => {
    if (!mintAddress) {
      setInfo(null);
      setInfoError(null);
      return;
    }

    let mintPk: PublicKey;
    try {
      mintPk = new PublicKey(mintAddress);
    } catch {
      setInfoError("Invalid mint address");
      setInfo(null);
      return;
    }

    setInfoLoading(true);
    setInfoError(null);

    try {
      const idl = await loadIdl();
      const provider = buildReadOnlyProvider();
      const sdk = new SolanaStablecoin(provider, idl as never);
      const result = await sdk.getStablecoinInfo(mintPk);
      setInfo(result);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setInfoError(
        msg.includes("Account does not exist")
          ? "Mint not found on chain — check the address or switch network."
          : `Failed to load info: ${msg}`
      );
      setInfo(null);
    } finally {
      setInfoLoading(false);
    }
  }, [mintAddress, buildReadOnlyProvider]);

  // Re-fetch whenever mint address or network connection changes
  useEffect(() => {
    fetchInfo();
  }, [fetchInfo]);

  // ── getSdk — used by hooks that send transactions ────────────────────────

  const getSdk = useCallback(async (): Promise<SolanaStablecoin> => {
    const idl = await loadIdl();
    const provider = buildProvider();
    return new SolanaStablecoin(provider, idl as never);
  }, [buildProvider]);

  // ── isAdmin ──────────────────────────────────────────────────────────────

  const isAdmin =
    !!wallet.publicKey &&
    !!info &&
    info.admin.toBase58() === wallet.publicKey.toBase58();

  // ── Context value ────────────────────────────────────────────────────────

  const value: StablecoinContextValue = {
    mintAddress,
    setMintAddress,
    info,
    infoLoading,
    infoError,
    refreshInfo: fetchInfo,
    getSdk,
    isAdmin,
  };

  return (
    <StablecoinContext.Provider value={value}>
      {children}
    </StablecoinContext.Provider>
  );
}
