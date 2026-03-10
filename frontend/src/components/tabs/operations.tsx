"use client";

import { useState } from "react";
import { useConnection } from "@solana/wallet-adapter-react";
import { useAnchorWallet } from "@solana/wallet-adapter-react";
import { useQueryClient } from "@tanstack/react-query";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import {
  getAssociatedTokenAddressSync,
  TOKEN_2022_PROGRAM_ID,
} from "@solana/spl-token";
import BN from "bn.js";
import {
  TrendingUp,
  Flame,
  AlertTriangle,
  Loader2,
  ArrowRight,
} from "lucide-react";
import { Program, AnchorProvider } from "@coral-xyz/anchor";
import type { StablecoinConfig } from "@/hooks/use-stablecoin";
import { useToast } from "@/components/ui/toast";
import { isValidPublicKey } from "@/lib/utils";
import {
  SSS_CORE_PROGRAM_ID,
  findConfigPda,
  findMinterStatePda,
  MINT_AUTHORITY_SEED,
} from "@/lib/constants";
import sssCoreIdl from "@/lib/idl/sss_core.json";

interface OperationsTabProps {
  config: StablecoinConfig;
  mintAddress: string;
  decimals: number;
  symbol: string;
}

export function OperationsTab({
  config,
  mintAddress,
  decimals,
  symbol,
}: OperationsTabProps) {
  return (
    <div className="space-y-4">
      {/* Pause warning */}
      {config.paused && (
        <div className="flex items-center gap-3 px-5 py-4 rounded-xl bg-[var(--danger-muted)] border border-[rgba(239,68,68,0.3)]">
          <AlertTriangle className="w-5 h-5 text-[var(--danger)] shrink-0" />
          <p className="text-sm text-[var(--danger)]">
            Operations are paused. Minting and burning are currently disabled.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <MintForm
          mintAddress={mintAddress}
          decimals={decimals}
          symbol={symbol}
          paused={config.paused}
        />
        <BurnForm
          mintAddress={mintAddress}
          decimals={decimals}
          symbol={symbol}
          paused={config.paused}
        />
      </div>
    </div>
  );
}

function MintForm({
  mintAddress,
  decimals,
  symbol,
  paused,
}: {
  mintAddress: string;
  decimals: number;
  symbol: string;
  paused: boolean;
}) {
  const [destination, setDestination] = useState("");
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const { connection } = useConnection();
  const wallet = useAnchorWallet();
  const { addToast } = useToast();
  const queryClient = useQueryClient();

  const handleMint = async () => {
    if (!wallet || !isValidPublicKey(destination) || !amount) return;
    setLoading(true);
    try {
      const provider = new AnchorProvider(connection, wallet, {
        commitment: "confirmed",
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const program = new Program(sssCoreIdl as any, provider);
      const mint = new PublicKey(mintAddress);
      const [configPda] = findConfigPda(mint);
      const [minterStatePda] = findMinterStatePda(configPda, wallet.publicKey);
      const [mintAuthority] = PublicKey.findProgramAddressSync(
        [Buffer.from(MINT_AUTHORITY_SEED), mint.toBuffer()],
        SSS_CORE_PROGRAM_ID
      );

      const amountBN = new BN(
        Math.floor(parseFloat(amount) * 10 ** decimals).toString()
      );

      // Destination is a token account address
      const destPk = new PublicKey(destination);

      const txSig = await program.methods
        .mintTokens(amountBN)
        .accountsPartial({
          minter: wallet.publicKey,
          config: configPda,
          minterState: minterStatePda,
          mint,
          destination: destPk,
          mintAuthority,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .rpc();

      addToast({
        type: "success",
        message: `Minted ${amount} ${symbol}`,
        txSig,
      });
      setAmount("");
      setDestination("");
      queryClient.invalidateQueries({ queryKey: ["stablecoin-config"] });
      queryClient.invalidateQueries({ queryKey: ["minters"] });
    } catch (err) {
      addToast({
        type: "error",
        message: `Mint failed: ${err instanceof Error ? err.message : "Unknown error"}`,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-xl bg-[var(--bg-card)] border border-[var(--border)] p-5">
      <div className="flex items-center gap-2 mb-5">
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-[var(--success-muted)]">
          <TrendingUp className="w-4 h-4 text-[var(--success)]" />
        </div>
        <h3 className="text-sm font-medium text-[var(--text-primary)]">
          Mint Tokens
        </h3>
      </div>

      <div className="space-y-3">
        <div>
          <label className="block text-xs text-[var(--text-muted)] mb-1.5 uppercase tracking-wider">
            Destination Token Account
          </label>
          <input
            type="text"
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            placeholder="Token account address..."
            disabled={paused}
            className="w-full h-10 px-3.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border)] text-sm font-[family-name:var(--font-jetbrains)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] transition-colors disabled:opacity-40"
          />
        </div>
        <div>
          <label className="block text-xs text-[var(--text-muted)] mb-1.5 uppercase tracking-wider">
            Amount ({symbol})
          </label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            disabled={paused}
            className="w-full h-10 px-3.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border)] text-sm font-[family-name:var(--font-jetbrains)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] transition-colors disabled:opacity-40"
          />
        </div>
        <button
          onClick={handleMint}
          disabled={
            paused ||
            loading ||
            !isValidPublicKey(destination) ||
            !amount ||
            parseFloat(amount) <= 0
          }
          className="w-full h-10 rounded-lg bg-[var(--success)] text-white text-sm font-medium hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <>
              Mint
              <ArrowRight className="w-3.5 h-3.5" />
            </>
          )}
        </button>
      </div>
    </div>
  );
}

function BurnForm({
  mintAddress,
  decimals,
  symbol,
  paused,
}: {
  mintAddress: string;
  decimals: number;
  symbol: string;
  paused: boolean;
}) {
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const { connection } = useConnection();
  const wallet = useAnchorWallet();
  const { addToast } = useToast();
  const queryClient = useQueryClient();

  const handleBurn = async () => {
    if (!wallet || !amount) return;
    setLoading(true);
    try {
      const provider = new AnchorProvider(connection, wallet, {
        commitment: "confirmed",
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const program = new Program(sssCoreIdl as any, provider);
      const mint = new PublicKey(mintAddress);
      const [configPda] = findConfigPda(mint);

      const tokenAccount = getAssociatedTokenAddressSync(
        mint,
        wallet.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID
      );

      const amountBN = new BN(
        Math.floor(parseFloat(amount) * 10 ** decimals).toString()
      );

      const txSig = await program.methods
        .burnTokens(amountBN)
        .accountsPartial({
          burner: wallet.publicKey,
          config: configPda,
          mint,
          tokenAccount,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .rpc();

      addToast({
        type: "success",
        message: `Burned ${amount} ${symbol}`,
        txSig,
      });
      setAmount("");
      queryClient.invalidateQueries({ queryKey: ["stablecoin-config"] });
    } catch (err) {
      addToast({
        type: "error",
        message: `Burn failed: ${err instanceof Error ? err.message : "Unknown error"}`,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-xl bg-[var(--bg-card)] border border-[var(--border)] p-5">
      <div className="flex items-center gap-2 mb-5">
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-[var(--danger-muted)]">
          <Flame className="w-4 h-4 text-[var(--danger)]" />
        </div>
        <h3 className="text-sm font-medium text-[var(--text-primary)]">
          Burn Tokens
        </h3>
      </div>

      <div className="space-y-3">
        <div>
          <label className="block text-xs text-[var(--text-muted)] mb-1.5 uppercase tracking-wider">
            Source
          </label>
          <div className="h-10 px-3.5 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)] flex items-center">
            <span className="text-xs text-[var(--text-muted)]">
              Your associated token account (auto-resolved)
            </span>
          </div>
        </div>
        <div>
          <label className="block text-xs text-[var(--text-muted)] mb-1.5 uppercase tracking-wider">
            Amount ({symbol})
          </label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            disabled={paused}
            className="w-full h-10 px-3.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border)] text-sm font-[family-name:var(--font-jetbrains)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] transition-colors disabled:opacity-40"
          />
        </div>
        <button
          onClick={handleBurn}
          disabled={paused || loading || !amount || parseFloat(amount) <= 0}
          className="w-full h-10 rounded-lg bg-[var(--danger)] text-white text-sm font-medium hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <>
              Burn
              <Flame className="w-3.5 h-3.5" />
            </>
          )}
        </button>
      </div>
    </div>
  );
}
