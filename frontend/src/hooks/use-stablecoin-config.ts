"use client";

import { useEffect, useState, useCallback } from "react";
import { useConnection } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { getMint, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import { useCoreProgram } from "./use-program";
import { deriveConfigPda } from "@/lib/pda";

const PRESET_NAMES: Record<number, string> = {
  1: "SSS-1 (Minimal)",
  2: "SSS-2 (Compliant)",
  3: "SSS-3 (Private)",
};

export interface StablecoinConfigData {
  preset: number;
  presetName: string;
  authority: string;
  paused: boolean;
  supplyCap: number | null;
  totalMinted: number;
  totalBurned: number;
  decimals: number;
  name: string;
  symbol: string;
  currentSupply: number;
}

export function useStablecoinConfig(mintAddress: string | null) {
  const { connection } = useConnection();
  const program = useCoreProgram();
  const [config, setConfig] = useState<StablecoinConfigData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchConfig = useCallback(async () => {
    if (!mintAddress || !program) {
      setConfig(null);
      return;
    }

    // Validate mint address format before RPC call
    try {
      new PublicKey(mintAddress);
    } catch {
      setError("Please enter a valid Solana address");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const mint = new PublicKey(mintAddress);
      const [configPda] = deriveConfigPda(mint);

      // Fetch the on-chain StablecoinConfig account
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const configAccount = await (program.account as any).stablecoinConfig.fetch(
        configPda,
      );

      // Fetch mint info for decimals and current supply
      const mintInfo = await getMint(
        connection,
        mint,
        "confirmed",
        TOKEN_2022_PROGRAM_ID,
      );

      const decimals = mintInfo.decimals;
      const currentSupply = Number(mintInfo.supply);
      const totalMinted = configAccount.totalMinted
        ? Number(configAccount.totalMinted)
        : currentSupply;
      const totalBurned = configAccount.totalBurned
        ? Number(configAccount.totalBurned)
        : 0;

      setConfig({
        preset: configAccount.preset,
        presetName: PRESET_NAMES[configAccount.preset] ?? `Preset ${configAccount.preset}`,
        authority: configAccount.authority?.toBase58() ?? "Unknown",
        paused: configAccount.paused ?? false,
        supplyCap: configAccount.supplyCap
          ? Number(configAccount.supplyCap)
          : null,
        totalMinted,
        totalBurned,
        decimals,
        name: configAccount.name ?? "Unknown",
        symbol: configAccount.symbol ?? "???",
        currentSupply,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to fetch config";
      setError(message);
      setConfig(null);
    } finally {
      setLoading(false);
    }
  }, [mintAddress, program, connection]);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  return { config, loading, error, refetch: fetchConfig };
}
