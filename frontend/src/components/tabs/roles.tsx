"use client";

import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useConnection } from "@solana/wallet-adapter-react";
import { useAnchorWallet } from "@solana/wallet-adapter-react";
import { useQueryClient } from "@tanstack/react-query";
import { PublicKey } from "@solana/web3.js";
import {
  Shield,
  Loader2,
  ArrowRight,
  PauseCircle,
  PlayCircle,
  Pencil,
} from "lucide-react";
import { Program, AnchorProvider } from "@coral-xyz/anchor";
import type { StablecoinConfig } from "@/hooks/use-stablecoin";
import { Address } from "@/components/ui/address";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { isValidPublicKey } from "@/lib/utils";
import { findConfigPda } from "@/lib/constants";
import sssCoreIdl from "@/lib/idl/sss_core.json";

interface RolesTabProps {
  config: StablecoinConfig;
  mintAddress: string;
}

interface RoleDef {
  label: string;
  address: string;
  roleType?: { masterMinter: Record<string, never> } | { pauser: Record<string, never> } | { blacklister: Record<string, never> };
  description: string;
}

export function RolesTab({ config, mintAddress }: RolesTabProps) {
  const { publicKey } = useWallet();
  const [editingRole, setEditingRole] = useState<RoleDef | null>(null);
  const [showTransfer, setShowTransfer] = useState(false);
  const [showAccept, setShowAccept] = useState(false);

  const isAuthority = publicKey?.toBase58() === config.authority;
  const isPauser = publicKey?.toBase58() === config.pauser;
  const isPendingAuth =
    config.pendingAuthority !== "11111111111111111111111111111111" &&
    publicKey?.toBase58() === config.pendingAuthority;

  const roles: RoleDef[] = [
    {
      label: "Authority",
      address: config.authority,
      description: "Master authority. Can update all roles and seize tokens (SSS-2).",
    },
    {
      label: "Master Minter",
      address: config.masterMinter,
      roleType: { masterMinter: {} },
      description: "Manages minters and their quotas.",
    },
    {
      label: "Pauser",
      address: config.pauser,
      roleType: { pauser: {} },
      description: "Can pause/unpause all operations.",
    },
  ];

  if (config.preset === 2) {
    roles.push({
      label: "Blacklister",
      address: config.blacklister,
      roleType: { blacklister: {} },
      description: "Manages the wallet blacklist (SSS-2 only).",
    });
  }

  return (
    <div className="space-y-4">
      {/* Pause/unpause control */}
      {isPauser && (
        <PauseControl config={config} mintAddress={mintAddress} />
      )}

      {/* Roles table */}
      <div className="rounded-xl bg-[var(--bg-card)] border border-[var(--border)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[var(--border)]">
                <th className="text-left text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider px-5 py-3">
                  Role
                </th>
                <th className="text-left text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider px-5 py-3">
                  Assigned To
                </th>
                <th className="text-left text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider px-5 py-3 hidden md:table-cell">
                  Description
                </th>
                {isAuthority && (
                  <th className="text-right text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider px-5 py-3">
                    Actions
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {roles.map((role) => (
                <tr
                  key={role.label}
                  className="border-b border-[var(--border)] last:border-b-0 hover:bg-[var(--bg-secondary)] transition-colors"
                >
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2">
                      <Shield className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                      <span className="text-sm font-medium text-[var(--text-primary)]">
                        {role.label}
                      </span>
                    </div>
                  </td>
                  <td className="px-5 py-3.5">
                    <Address address={role.address} chars={6} showExplorer />
                  </td>
                  <td className="px-5 py-3.5 hidden md:table-cell">
                    <span className="text-xs text-[var(--text-muted)]">
                      {role.description}
                    </span>
                  </td>
                  {isAuthority && (
                    <td className="px-5 py-3.5 text-right">
                      {role.roleType ? (
                        <button
                          onClick={() => setEditingRole(role)}
                          className="inline-flex items-center gap-1.5 text-xs text-[var(--accent)] hover:text-[var(--accent-hover)] transition-colors"
                        >
                          <Pencil className="w-3 h-3" />
                          Update
                        </button>
                      ) : (
                        <button
                          onClick={() => setShowTransfer(true)}
                          className="inline-flex items-center gap-1.5 text-xs text-[var(--warning)] hover:text-[var(--text-primary)] transition-colors"
                        >
                          <ArrowRight className="w-3 h-3" />
                          Transfer
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pending authority notice */}
      {config.pendingAuthority !== "11111111111111111111111111111111" && (
        <div className="rounded-xl bg-[var(--warning-muted)] border border-[rgba(245,158,11,0.3)] p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-[var(--warning)]">
                Pending Authority Transfer
              </p>
              <p className="text-xs text-[var(--text-muted)] mt-1">
                Pending:{" "}
                <span className="font-[family-name:var(--font-jetbrains)]">
                  {config.pendingAuthority.slice(0, 8)}...
                  {config.pendingAuthority.slice(-4)}
                </span>
              </p>
            </div>
            {isPendingAuth && (
              <button
                onClick={() => setShowAccept(true)}
                className="h-9 px-4 rounded-lg bg-[var(--warning)] text-black text-sm font-medium hover:brightness-110 transition-all"
              >
                Accept Authority
              </button>
            )}
          </div>
        </div>
      )}

      {/* Update role modal */}
      {editingRole && (
        <UpdateRoleModal
          role={editingRole}
          mintAddress={mintAddress}
          onClose={() => setEditingRole(null)}
        />
      )}

      {/* Transfer authority modal */}
      {showTransfer && (
        <TransferAuthorityModal
          mintAddress={mintAddress}
          onClose={() => setShowTransfer(false)}
        />
      )}

      {/* Accept authority modal */}
      {showAccept && (
        <AcceptAuthorityModal
          mintAddress={mintAddress}
          onClose={() => setShowAccept(false)}
        />
      )}
    </div>
  );
}

function PauseControl({
  config,
  mintAddress,
}: {
  config: StablecoinConfig;
  mintAddress: string;
}) {
  const [loading, setLoading] = useState(false);
  const { connection } = useConnection();
  const wallet = useAnchorWallet();
  const { addToast } = useToast();
  const queryClient = useQueryClient();

  const handleToggle = async () => {
    if (!wallet) return;
    setLoading(true);
    try {
      const provider = new AnchorProvider(connection, wallet, {
        commitment: "confirmed",
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const program = new Program(sssCoreIdl as any, provider);
      const mint = new PublicKey(mintAddress);
      const [configPda] = findConfigPda(mint);

      const method = config.paused
        ? program.methods.unpause()
        : program.methods.pause();

      const txSig = await method
        .accountsPartial({
          pauser: wallet.publicKey,
          config: configPda,
        })
        .rpc();

      addToast({
        type: "success",
        message: config.paused ? "Operations resumed" : "Operations paused",
        txSig,
      });
      queryClient.invalidateQueries({ queryKey: ["stablecoin-config"] });
    } catch (err) {
      addToast({
        type: "error",
        message: `Failed to ${config.paused ? "unpause" : "pause"}: ${err instanceof Error ? err.message : "Unknown error"}`,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-xl bg-[var(--bg-card)] border border-[var(--border)] p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {config.paused ? (
            <PauseCircle className="w-5 h-5 text-[var(--danger)]" />
          ) : (
            <PlayCircle className="w-5 h-5 text-[var(--success)]" />
          )}
          <div>
            <p className="text-sm font-medium text-[var(--text-primary)]">
              Contract {config.paused ? "Paused" : "Active"}
            </p>
            <p className="text-xs text-[var(--text-muted)]">
              You are the pauser. You can {config.paused ? "resume" : "pause"}{" "}
              operations.
            </p>
          </div>
        </div>
        <button
          onClick={handleToggle}
          disabled={loading}
          className={`h-9 px-4 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
            config.paused
              ? "bg-[var(--success)] text-white hover:brightness-110"
              : "bg-[var(--danger)] text-white hover:brightness-110"
          } disabled:opacity-50`}
        >
          {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          {config.paused ? "Unpause" : "Pause"}
        </button>
      </div>
    </div>
  );
}

function UpdateRoleModal({
  role,
  mintAddress,
  onClose,
}: {
  role: RoleDef;
  mintAddress: string;
  onClose: () => void;
}) {
  const [newAddress, setNewAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const { connection } = useConnection();
  const wallet = useAnchorWallet();
  const { addToast } = useToast();
  const queryClient = useQueryClient();

  const handleSubmit = async () => {
    if (!wallet || !isValidPublicKey(newAddress) || !role.roleType) return;
    setLoading(true);
    try {
      const provider = new AnchorProvider(connection, wallet, {
        commitment: "confirmed",
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const program = new Program(sssCoreIdl as any, provider);
      const mint = new PublicKey(mintAddress);
      const [configPda] = findConfigPda(mint);

      const txSig = await program.methods
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .updateRole(role.roleType as any, new PublicKey(newAddress))
        .accountsPartial({
          authority: wallet.publicKey,
          config: configPda,
        })
        .rpc();

      addToast({
        type: "success",
        message: `${role.label} role updated`,
        txSig,
      });
      queryClient.invalidateQueries({ queryKey: ["stablecoin-config"] });
      onClose();
    } catch (err) {
      addToast({
        type: "error",
        message: `Failed to update role: ${err instanceof Error ? err.message : "Unknown error"}`,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={true} onClose={onClose} title={`Update ${role.label}`}>
      <div className="space-y-4">
        <div>
          <label className="block text-xs text-[var(--text-muted)] mb-1.5 uppercase tracking-wider">
            Current Address
          </label>
          <div className="h-10 px-3.5 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)] flex items-center">
            <span className="text-xs font-[family-name:var(--font-jetbrains)] text-[var(--text-muted)]">
              {role.address}
            </span>
          </div>
        </div>
        <div>
          <label className="block text-xs text-[var(--text-muted)] mb-1.5 uppercase tracking-wider">
            New Address
          </label>
          <input
            type="text"
            value={newAddress}
            onChange={(e) => setNewAddress(e.target.value)}
            placeholder="New wallet public key..."
            className="w-full h-10 px-3.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border)] text-sm font-[family-name:var(--font-jetbrains)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] transition-colors"
          />
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
            disabled={loading || !isValidPublicKey(newAddress)}
            className="flex-1 h-10 rounded-lg bg-[var(--accent)] text-white text-sm font-medium hover:bg-[var(--accent-hover)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
          >
            {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Update Role
          </button>
        </div>
      </div>
    </Modal>
  );
}

function TransferAuthorityModal({
  mintAddress,
  onClose,
}: {
  mintAddress: string;
  onClose: () => void;
}) {
  const [newAuth, setNewAuth] = useState("");
  const [loading, setLoading] = useState(false);
  const { connection } = useConnection();
  const wallet = useAnchorWallet();
  const { addToast } = useToast();
  const queryClient = useQueryClient();

  const handleSubmit = async () => {
    if (!wallet || !isValidPublicKey(newAuth)) return;
    setLoading(true);
    try {
      const provider = new AnchorProvider(connection, wallet, {
        commitment: "confirmed",
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const program = new Program(sssCoreIdl as any, provider);
      const mint = new PublicKey(mintAddress);
      const [configPda] = findConfigPda(mint);

      const txSig = await program.methods
        .transferAuthority(new PublicKey(newAuth))
        .accountsPartial({
          authority: wallet.publicKey,
          config: configPda,
        })
        .rpc();

      addToast({
        type: "success",
        message: "Authority transfer initiated (pending acceptance)",
        txSig,
      });
      queryClient.invalidateQueries({ queryKey: ["stablecoin-config"] });
      onClose();
    } catch (err) {
      addToast({
        type: "error",
        message: `Failed to transfer authority: ${err instanceof Error ? err.message : "Unknown error"}`,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={true} onClose={onClose} title="Transfer Authority">
      <div className="space-y-4">
        <div className="rounded-lg bg-[var(--warning-muted)] border border-[rgba(245,158,11,0.3)] p-3">
          <p className="text-xs text-[var(--warning)]">
            This is a two-step process. The new authority must accept the
            transfer before it takes effect.
          </p>
        </div>
        <div>
          <label className="block text-xs text-[var(--text-muted)] mb-1.5 uppercase tracking-wider">
            New Authority Address
          </label>
          <input
            type="text"
            value={newAuth}
            onChange={(e) => setNewAuth(e.target.value)}
            placeholder="New authority public key..."
            className="w-full h-10 px-3.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border)] text-sm font-[family-name:var(--font-jetbrains)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] transition-colors"
          />
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
            disabled={loading || !isValidPublicKey(newAuth)}
            className="flex-1 h-10 rounded-lg bg-[var(--warning)] text-black text-sm font-medium hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
          >
            {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Initiate Transfer
          </button>
        </div>
      </div>
    </Modal>
  );
}

function AcceptAuthorityModal({
  mintAddress,
  onClose,
}: {
  mintAddress: string;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const { connection } = useConnection();
  const wallet = useAnchorWallet();
  const { addToast } = useToast();
  const queryClient = useQueryClient();

  const handleAccept = async () => {
    if (!wallet) return;
    setLoading(true);
    try {
      const provider = new AnchorProvider(connection, wallet, {
        commitment: "confirmed",
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const program = new Program(sssCoreIdl as any, provider);
      const mint = new PublicKey(mintAddress);
      const [configPda] = findConfigPda(mint);

      const txSig = await program.methods
        .acceptAuthority()
        .accountsPartial({
          newAuthority: wallet.publicKey,
          config: configPda,
        })
        .rpc();

      addToast({
        type: "success",
        message: "Authority accepted. You are now the authority.",
        txSig,
      });
      queryClient.invalidateQueries({ queryKey: ["stablecoin-config"] });
      onClose();
    } catch (err) {
      addToast({
        type: "error",
        message: `Failed to accept authority: ${err instanceof Error ? err.message : "Unknown error"}`,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={true} onClose={onClose} title="Accept Authority">
      <div className="space-y-4">
        <p className="text-sm text-[var(--text-secondary)]">
          You have been nominated as the new authority. By accepting, you will
          become the authority for this stablecoin.
        </p>
        <div className="flex gap-3 pt-2">
          <button
            onClick={onClose}
            className="flex-1 h-10 rounded-lg border border-[var(--border)] text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleAccept}
            disabled={loading}
            className="flex-1 h-10 rounded-lg bg-[var(--accent)] text-white text-sm font-medium hover:bg-[var(--accent-hover)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
          >
            {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Accept Authority
          </button>
        </div>
      </div>
    </Modal>
  );
}
