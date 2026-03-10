"use client";

import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useConnection } from "@solana/wallet-adapter-react";
import { useQueryClient } from "@tanstack/react-query";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import BN from "bn.js";
import {
  Users,
  Plus,
  Loader2,
  UserX,
} from "lucide-react";
import {
  useMinters,
  type StablecoinConfig,
  type MinterState,
} from "@/hooks/use-stablecoin";
import { Address } from "@/components/ui/address";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { formatAmount, isValidPublicKey } from "@/lib/utils";
import {
  SSS_CORE_PROGRAM_ID,
  findConfigPda,
  findMinterStatePda,
} from "@/lib/constants";
import sssCoreIdl from "@/lib/idl/sss_core.json";
import { Program, AnchorProvider } from "@coral-xyz/anchor";
import { useAnchorWallet } from "@solana/wallet-adapter-react";

interface MintersTabProps {
  config: StablecoinConfig;
  mintAddress: string;
  decimals: number;
}

export function MintersTab({ config, mintAddress, decimals }: MintersTabProps) {
  const { data: minters, isLoading } = useMinters(mintAddress);
  const { publicKey } = useWallet();
  const [showAddModal, setShowAddModal] = useState(false);

  const isMasterMinter =
    publicKey?.toBase58() === config.masterMinter;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium text-[var(--text-secondary)]">
            Configured Minters
          </h3>
          {minters && (
            <Badge variant="neutral">{minters.length}</Badge>
          )}
        </div>
        {isMasterMinter && (
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 h-9 px-4 rounded-lg bg-[var(--accent)] text-white text-sm font-medium hover:bg-[var(--accent-hover)] transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Configure Minter
          </button>
        )}
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-5 h-5 text-[var(--accent)] animate-spin" />
        </div>
      )}

      {/* Empty state */}
      {!isLoading && (!minters || minters.length === 0) && (
        <div className="rounded-xl bg-[var(--bg-card)] border border-[var(--border)] py-16 text-center">
          <Users className="w-8 h-8 text-[var(--text-muted)] mx-auto mb-3" />
          <p className="text-sm text-[var(--text-secondary)]">
            No minters configured
          </p>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            The master minter can add minters from this dashboard.
          </p>
        </div>
      )}

      {/* Minters table */}
      {minters && minters.length > 0 && (
        <div className="rounded-xl bg-[var(--bg-card)] border border-[var(--border)] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  <th className="text-left text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider px-5 py-3">
                    Wallet
                  </th>
                  <th className="text-right text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider px-5 py-3">
                    Quota
                  </th>
                  <th className="text-right text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider px-5 py-3">
                    Minted
                  </th>
                  <th className="text-left text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider px-5 py-3">
                    Usage
                  </th>
                  <th className="text-center text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider px-5 py-3">
                    Status
                  </th>
                  {isMasterMinter && (
                    <th className="text-right text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider px-5 py-3">
                      Actions
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {minters.map((minter) => (
                  <MinterRow
                    key={minter.minter}
                    minter={minter}
                    decimals={decimals}
                    isMasterMinter={isMasterMinter}
                    mintAddress={mintAddress}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add minter modal */}
      {showAddModal && (
        <ConfigureMinterModal
          mintAddress={mintAddress}
          decimals={decimals}
          onClose={() => setShowAddModal(false)}
        />
      )}
    </div>
  );
}

function MinterRow({
  minter,
  decimals,
  isMasterMinter,
  mintAddress,
}: {
  minter: MinterState;
  decimals: number;
  isMasterMinter: boolean;
  mintAddress: string;
}) {
  const [removing, setRemoving] = useState(false);
  const { connection } = useConnection();
  const wallet = useAnchorWallet();
  const { addToast } = useToast();
  const queryClient = useQueryClient();

  const quotaNum = parseFloat(minter.quota.toString());
  const mintedNum = parseFloat(minter.mintedAmount.toString());
  const percentage = quotaNum > 0 ? Math.min((mintedNum / quotaNum) * 100, 100) : 0;

  const handleRemove = async () => {
    if (!wallet) return;
    setRemoving(true);
    try {
      const provider = new AnchorProvider(connection, wallet, {
        commitment: "confirmed",
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const program = new Program(sssCoreIdl as any, provider);
      const mint = new PublicKey(mintAddress);
      const [configPda] = findConfigPda(mint);
      const minterWallet = new PublicKey(minter.minter);
      const [minterStatePda] = findMinterStatePda(configPda, minterWallet);

      const txSig = await program.methods
        .removeMinter()
        .accountsPartial({
          masterMinter: wallet.publicKey,
          config: configPda,
          minterState: minterStatePda,
        })
        .rpc();

      addToast({
        type: "success",
        message: "Minter disabled successfully",
        txSig,
      });
      queryClient.invalidateQueries({ queryKey: ["minters"] });
    } catch (err) {
      addToast({
        type: "error",
        message: `Failed to remove minter: ${err instanceof Error ? err.message : "Unknown error"}`,
      });
    } finally {
      setRemoving(false);
    }
  };

  return (
    <tr className="border-b border-[var(--border)] last:border-b-0 hover:bg-[var(--bg-secondary)] transition-colors">
      <td className="px-5 py-3.5">
        <Address address={minter.minter} chars={6} showExplorer />
      </td>
      <td className="px-5 py-3.5 text-right">
        <span className="text-sm font-[family-name:var(--font-jetbrains)] text-[var(--text-primary)]">
          {formatAmount(minter.quota, decimals)}
        </span>
      </td>
      <td className="px-5 py-3.5 text-right">
        <span className="text-sm font-[family-name:var(--font-jetbrains)] text-[var(--text-primary)]">
          {formatAmount(minter.mintedAmount, decimals)}
        </span>
      </td>
      <td className="px-5 py-3.5">
        <div className="flex items-center gap-3 min-w-[120px]">
          <div className="flex-1 h-1.5 rounded-full bg-[var(--bg-secondary)]">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${percentage}%`,
                backgroundColor:
                  percentage > 90
                    ? "var(--danger)"
                    : percentage > 70
                      ? "var(--warning)"
                      : "var(--accent)",
              }}
            />
          </div>
          <span className="text-xs font-[family-name:var(--font-jetbrains)] text-[var(--text-muted)] w-10 text-right">
            {percentage.toFixed(0)}%
          </span>
        </div>
      </td>
      <td className="px-5 py-3.5 text-center">
        <Badge variant={minter.enabled ? "success" : "danger"}>
          {minter.enabled ? "Active" : "Disabled"}
        </Badge>
      </td>
      {isMasterMinter && (
        <td className="px-5 py-3.5 text-right">
          {minter.enabled && (
            <button
              onClick={handleRemove}
              disabled={removing}
              className="inline-flex items-center gap-1.5 text-xs text-[var(--danger)] hover:text-[var(--text-primary)] transition-colors disabled:opacity-50"
            >
              {removing ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <UserX className="w-3 h-3" />
              )}
              Disable
            </button>
          )}
        </td>
      )}
    </tr>
  );
}

function ConfigureMinterModal({
  mintAddress,
  decimals,
  onClose,
}: {
  mintAddress: string;
  decimals: number;
  onClose: () => void;
}) {
  const [minterWallet, setMinterWallet] = useState("");
  const [quota, setQuota] = useState("");
  const [loading, setLoading] = useState(false);
  const { connection } = useConnection();
  const wallet = useAnchorWallet();
  const { addToast } = useToast();
  const queryClient = useQueryClient();

  const handleSubmit = async () => {
    if (!wallet || !isValidPublicKey(minterWallet) || !quota) return;
    setLoading(true);
    try {
      const provider = new AnchorProvider(connection, wallet, {
        commitment: "confirmed",
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const program = new Program(sssCoreIdl as any, provider);
      const mint = new PublicKey(mintAddress);
      const minterPk = new PublicKey(minterWallet);
      const [configPda] = findConfigPda(mint);
      const [minterStatePda] = findMinterStatePda(configPda, minterPk);

      const quotaBN = new BN(
        Math.floor(parseFloat(quota) * 10 ** decimals).toString()
      );

      const txSig = await program.methods
        .configureMinter(minterPk, quotaBN)
        .accountsPartial({
          masterMinter: wallet.publicKey,
          config: configPda,
          minterState: minterStatePda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      addToast({
        type: "success",
        message: "Minter configured successfully",
        txSig,
      });
      queryClient.invalidateQueries({ queryKey: ["minters"] });
      onClose();
    } catch (err) {
      addToast({
        type: "error",
        message: `Failed to configure minter: ${err instanceof Error ? err.message : "Unknown error"}`,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={true} onClose={onClose} title="Configure Minter">
      <div className="space-y-4">
        <div>
          <label className="block text-xs text-[var(--text-secondary)] mb-1.5 uppercase tracking-wider">
            Minter Wallet
          </label>
          <input
            type="text"
            value={minterWallet}
            onChange={(e) => setMinterWallet(e.target.value)}
            placeholder="Wallet public key..."
            className="w-full h-10 px-3.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border)] text-sm font-[family-name:var(--font-jetbrains)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] transition-colors"
          />
        </div>
        <div>
          <label className="block text-xs text-[var(--text-secondary)] mb-1.5 uppercase tracking-wider">
            Minting Quota
          </label>
          <input
            type="number"
            value={quota}
            onChange={(e) => setQuota(e.target.value)}
            placeholder="e.g. 1000000"
            className="w-full h-10 px-3.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border)] text-sm font-[family-name:var(--font-jetbrains)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] transition-colors"
          />
          <p className="text-xs text-[var(--text-muted)] mt-1">
            Maximum tokens this minter can mint (human-readable amount)
          </p>
        </div>
        <div className="flex gap-3 pt-2">
          <button
            onClick={onClose}
            className="flex-1 h-10 rounded-lg border border-[var(--border)] text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading || !isValidPublicKey(minterWallet) || !quota}
            className="flex-1 h-10 rounded-lg bg-[var(--accent)] text-white text-sm font-medium hover:bg-[var(--accent-hover)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
          >
            {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Configure
          </button>
        </div>
      </div>
    </Modal>
  );
}
