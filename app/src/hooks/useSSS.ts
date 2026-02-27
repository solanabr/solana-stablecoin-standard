"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import {
  SSSClient,
  type StablecoinConfig,
  type RoleRegistry,
  type MinterInfo,
} from "@stbr/sss-token";

const DEFAULT_MINT = new PublicKey("9MmnDN61FaYd7SRzsnHmwEMj1jbTWh1XD4xaM9nWYujv");

export interface SSSState {
  client: SSSClient | null;
  config: StablecoinConfig | null;
  roles: RoleRegistry | null;
  supply: {
    totalMinted: BN;
    totalBurned: BN;
    currentSupply: BN;
    decimals: number;
  } | null;
  minters: { pubkey: PublicKey; account: MinterInfo }[];
  loading: boolean;
  error: string | null;
  mint: PublicKey;
  setMint: (mint: PublicKey) => void;
  refresh: () => Promise<void>;
}

export function useSSS(): SSSState {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [mint, setMint] = useState<PublicKey>(DEFAULT_MINT);
  const [config, setConfig] = useState<StablecoinConfig | null>(null);
  const [roles, setRoles] = useState<RoleRegistry | null>(null);
  const [supply, setSupply] = useState<SSSState["supply"]>(null);
  const [minters, setMinters] = useState<SSSState["minters"]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const client = useMemo(() => {
    if (!wallet.publicKey || !wallet.signTransaction || !wallet.signAllTransactions) return null;
    const anchorWallet = {
      publicKey: wallet.publicKey,
      signTransaction: wallet.signTransaction.bind(wallet),
      signAllTransactions: wallet.signAllTransactions.bind(wallet),
    };
    return new SSSClient(connection, anchorWallet as any);
  }, [connection, wallet.publicKey, wallet.signTransaction, wallet.signAllTransactions]);

  const refresh = useCallback(async () => {
    if (!client) return;
    setLoading(true);
    setError(null);
    try {
      const [configPda] = client.getConfigPda(mint);
      const [cfg, sup, minterList] = await Promise.all([
        client.fetchConfig(mint),
        client.getTotalSupply(mint),
        client.fetchAllMinters(mint).catch(() => []),
      ]);
      setConfig(cfg);
      setSupply(sup);
      setMinters(minterList);

      try {
        const r = await client.fetchRoleRegistry(configPda);
        setRoles(r);
      } catch {
        setRoles(null);
      }
    } catch (e: any) {
      setError(e.message || "Failed to fetch data");
    } finally {
      setLoading(false);
    }
  }, [client, mint]);

  useEffect(() => {
    if (client) refresh();
  }, [client, refresh]);

  return { client, config, roles, supply, minters, loading, error, mint, setMint, refresh };
}
