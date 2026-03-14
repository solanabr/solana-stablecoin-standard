import { useEffect, useState, useCallback } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { Program, AnchorProvider, BN, type Idl } from "@coral-xyz/anchor";
import { getConfigAddress } from "../utils/pda";
import idl from "../idl/sss_core.json";

/** On-chain StablecoinConfig account shape after deserialization. */
export interface StablecoinState {
  authority: PublicKey;
  pendingAuthority: PublicKey;
  mint: PublicKey;
  transferHookProgram: PublicKey;
  paused: boolean;
  complianceEnabled: boolean;
  totalMinted: BN;
  totalBurned: BN;
  supplyCap: BN;
  enableAllowlist: boolean;
  bump: number;
}

/**
 * Anchor doesn't generate TS types from JSON IDLs at runtime,
 * so we use the untyped Program interface for account/method access.
 * This is the standard pattern for Anchor 0.31.x with dynamic IDLs.
 */
type AnchorProgram = Program<Idl>;

/** Hook to load and interact with a deployed SSS stablecoin. */
export function useStablecoin(mintAddress: string) {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [state, setState] = useState<StablecoinState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [configPDA, setConfigPDA] = useState<PublicKey | null>(null);
  const [program, setProgram] = useState<AnchorProgram | null>(null);
  const [currentSupply, setCurrentSupply] = useState<string>("0");
  const [decimals, setDecimals] = useState<number>(6);

  const getProgram = useCallback((): AnchorProgram => {
    // Anchor requires a wallet-compatible provider.
    // When the wallet is connected we use a real AnchorProvider;
    // otherwise we fall back to a read-only provider stub.
    if (wallet.publicKey && wallet.signTransaction && wallet.signAllTransactions) {
      const provider = new AnchorProvider(
        connection,
        { publicKey: wallet.publicKey, signTransaction: wallet.signTransaction, signAllTransactions: wallet.signAllTransactions },
        { commitment: "confirmed" },
      );
      return new Program(idl as Idl, provider);
    }
    const readOnlyProvider = { connection, publicKey: PublicKey.default } as unknown as AnchorProvider;
    return new Program(idl as Idl, readOnlyProvider);
  }, [connection, wallet]);

  const fetchState = useCallback(async () => {
    if (!mintAddress) {
      setState(null);
      setConfigPDA(null);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const mint = new PublicKey(mintAddress);
      const [pda] = getConfigAddress(mint);
      setConfigPDA(pda);

      const prog = getProgram();
      setProgram(prog);

      // Fetch StablecoinConfig account via Anchor
      const account = await (prog.account as Record<string, { fetch: (k: PublicKey) => Promise<StablecoinState> }>)
        .stablecoinConfig
        .fetch(pda);
      setState(account);

      // Fetch current mint supply and decimals
      try {
        const mintInfo = await connection.getTokenSupply(mint);
        setCurrentSupply(mintInfo.value.amount);
        setDecimals(mintInfo.value.decimals);
      } catch {
        setCurrentSupply("0");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to fetch stablecoin state";
      setError(msg);
      setState(null);
    } finally {
      setLoading(false);
    }
  }, [mintAddress, connection, getProgram]);

  useEffect(() => {
    fetchState();
  }, [fetchState]);

  return {
    state,
    loading,
    error,
    configPDA,
    program,
    currentSupply,
    decimals,
    refetch: fetchState,
  };
}
