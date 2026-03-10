"use client";

import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useConnection } from "@solana/wallet-adapter-react";
import { useAnchorWallet } from "@solana/wallet-adapter-react";
import { useQueryClient } from "@tanstack/react-query";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import {
  ShieldAlert,
  Search,
  ShieldCheck,
  ShieldX,
  Plus,
  Loader2,
  Snowflake,
  Sun,
  UserX,
  Trash2,
} from "lucide-react";
import { Program, AnchorProvider } from "@coral-xyz/anchor";
import type { StablecoinConfig, BlacklistEntry } from "@/hooks/use-stablecoin";
import {
  useBlacklistEntries,
  useBlacklistCheck,
} from "@/hooks/use-stablecoin";
import { Address } from "@/components/ui/address";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { isValidPublicKey, formatTimestamp } from "@/lib/utils";
import {
  findConfigPda,
  findBlacklistPda,
  SSS_CORE_PROGRAM_ID,
  SSS_HOOK_PROGRAM_ID,
  MINT_AUTHORITY_SEED,
} from "@/lib/constants";
import sssHookIdl from "@/lib/idl/sss_hook.json";
import sssCoreIdl from "@/lib/idl/sss_core.json";

interface ComplianceTabProps {
  config: StablecoinConfig;
  mintAddress: string;
}

export function ComplianceTab({ config, mintAddress }: ComplianceTabProps) {
  const { publicKey } = useWallet();
  const { data: entries, isLoading } = useBlacklistEntries(
    mintAddress,
    config.preset
  );

  const isBlacklister = publicKey?.toBase58() === config.blacklister;
  const isAuthority = publicKey?.toBase58() === config.authority;
  const canFreeze = isBlacklister || isAuthority;

  return (
    <div className="space-y-6">
      {/* Blacklist check */}
      <BlacklistChecker mintAddress={mintAddress} />

      {/* Add to blacklist (if blacklister) */}
      {isBlacklister && (
        <AddToBlacklist mintAddress={mintAddress} config={config} />
      )}

      {/* Freeze/Thaw controls */}
      {canFreeze && (
        <FreezeThawControls mintAddress={mintAddress} />
      )}

      {/* Blacklisted wallets */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium text-[var(--text-secondary)]">
            Blacklisted Wallets
          </h3>
          {entries && <Badge variant="neutral">{entries.length}</Badge>}
        </div>

        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-5 h-5 text-[var(--accent)] animate-spin" />
          </div>
        )}

        {!isLoading && (!entries || entries.length === 0) && (
          <div className="rounded-xl bg-[var(--bg-card)] border border-[var(--border)] py-12 text-center">
            <ShieldCheck className="w-8 h-8 text-[var(--success)] mx-auto mb-3" />
            <p className="text-sm text-[var(--text-secondary)]">
              No blacklisted wallets
            </p>
          </div>
        )}

        {entries && entries.length > 0 && (
          <div className="rounded-xl bg-[var(--bg-card)] border border-[var(--border)] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[var(--border)]">
                    <th className="text-left text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider px-5 py-3">
                      Wallet
                    </th>
                    <th className="text-left text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider px-5 py-3">
                      Reason
                    </th>
                    <th className="text-left text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider px-5 py-3 hidden md:table-cell">
                      Blacklisted By
                    </th>
                    <th className="text-center text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider px-5 py-3">
                      Status
                    </th>
                    {isBlacklister && (
                      <th className="text-right text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider px-5 py-3">
                        Actions
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry) => (
                    <BlacklistRow
                      key={entry.wallet}
                      entry={entry}
                      mintAddress={mintAddress}
                      isBlacklister={isBlacklister}
                      config={config}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function BlacklistChecker({ mintAddress }: { mintAddress: string }) {
  const [checkAddress, setCheckAddress] = useState("");
  const [queryAddr, setQueryAddr] = useState<string | null>(null);
  const { data: entry, isLoading } = useBlacklistCheck(mintAddress, queryAddr);

  const handleCheck = () => {
    if (isValidPublicKey(checkAddress)) {
      setQueryAddr(checkAddress);
    }
  };

  return (
    <div className="rounded-xl bg-[var(--bg-card)] border border-[var(--border)] p-5">
      <div className="flex items-center gap-2 mb-4">
        <Search className="w-4 h-4 text-[var(--text-muted)]" />
        <h3 className="text-sm font-medium text-[var(--text-primary)]">
          Check Blacklist Status
        </h3>
      </div>
      <div className="flex gap-3 mb-3">
        <input
          type="text"
          value={checkAddress}
          onChange={(e) => {
            setCheckAddress(e.target.value);
            setQueryAddr(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleCheck();
          }}
          placeholder="Enter wallet address to check..."
          className="flex-1 h-10 px-3.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border)] text-sm font-[family-name:var(--font-jetbrains)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] transition-colors"
        />
        <button
          onClick={handleCheck}
          disabled={!isValidPublicKey(checkAddress) || isLoading}
          className="h-10 px-4 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)] text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-focus)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
        >
          {isLoading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Search className="w-3.5 h-3.5" />
          )}
          Check
        </button>
      </div>

      {queryAddr && !isLoading && (
        <div className="mt-3">
          {entry && entry.blacklisted ? (
            <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-[var(--danger-muted)] border border-[rgba(239,68,68,0.3)]">
              <ShieldX className="w-5 h-5 text-[var(--danger)] shrink-0" />
              <div>
                <p className="text-sm font-medium text-[var(--danger)]">
                  Blacklisted
                </p>
                {entry.reason && (
                  <p className="text-xs text-[var(--text-muted)] mt-0.5">
                    Reason: {entry.reason}
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-[var(--success-muted)] border border-[rgba(34,197,94,0.3)]">
              <ShieldCheck className="w-5 h-5 text-[var(--success)] shrink-0" />
              <p className="text-sm font-medium text-[var(--success)]">
                Not blacklisted
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function AddToBlacklist({
  mintAddress,
  config,
}: {
  mintAddress: string;
  config: StablecoinConfig;
}) {
  const [wallet, setWallet] = useState("");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const { connection } = useConnection();
  const anchorWallet = useAnchorWallet();
  const { addToast } = useToast();
  const queryClient = useQueryClient();

  const handleAdd = async () => {
    if (!anchorWallet || !isValidPublicKey(wallet)) return;
    setLoading(true);
    try {
      const provider = new AnchorProvider(connection, anchorWallet, {
        commitment: "confirmed",
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const hookProgram = new Program(sssHookIdl as any, provider);
      const mint = new PublicKey(mintAddress);
      const walletPk = new PublicKey(wallet);
      const [configPda] = findConfigPda(mint);
      const [blacklistPda] = findBlacklistPda(mint, walletPk);

      const txSig = await hookProgram.methods
        .addToBlacklist(walletPk, reason || "No reason specified")
        .accountsPartial({
          blacklister: anchorWallet.publicKey,
          mint,
          stablecoinConfig: configPda,
          blacklistEntry: blacklistPda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      addToast({
        type: "success",
        message: "Wallet added to blacklist",
        txSig,
      });
      setWallet("");
      setReason("");
      queryClient.invalidateQueries({ queryKey: ["blacklist"] });
    } catch (err) {
      addToast({
        type: "error",
        message: `Failed to blacklist: ${err instanceof Error ? err.message : "Unknown error"}`,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-xl bg-[var(--bg-card)] border border-[var(--border)] p-5">
      <div className="flex items-center gap-2 mb-4">
        <Plus className="w-4 h-4 text-[var(--text-muted)]" />
        <h3 className="text-sm font-medium text-[var(--text-primary)]">
          Add to Blacklist
        </h3>
      </div>
      <div className="space-y-3">
        <input
          type="text"
          value={wallet}
          onChange={(e) => setWallet(e.target.value)}
          placeholder="Wallet address to blacklist..."
          className="w-full h-10 px-3.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border)] text-sm font-[family-name:var(--font-jetbrains)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] transition-colors"
        />
        <input
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason for blacklisting (optional)..."
          maxLength={200}
          className="w-full h-10 px-3.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] transition-colors"
        />
        <button
          onClick={handleAdd}
          disabled={loading || !isValidPublicKey(wallet)}
          className="h-10 px-5 rounded-lg bg-[var(--danger)] text-white text-sm font-medium hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-2"
        >
          {loading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <UserX className="w-3.5 h-3.5" />
          )}
          Add to Blacklist
        </button>
      </div>
    </div>
  );
}

function FreezeThawControls({ mintAddress }: { mintAddress: string }) {
  const [tokenAccount, setTokenAccount] = useState("");
  const [freezeLoading, setFreezeLoading] = useState(false);
  const [thawLoading, setThawLoading] = useState(false);
  const { connection } = useConnection();
  const wallet = useAnchorWallet();
  const { addToast } = useToast();

  const handleFreeze = async () => {
    if (!wallet || !isValidPublicKey(tokenAccount)) return;
    setFreezeLoading(true);
    try {
      const provider = new AnchorProvider(connection, wallet, {
        commitment: "confirmed",
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const program = new Program(sssCoreIdl as any, provider);
      const mint = new PublicKey(mintAddress);
      const [configPda] = findConfigPda(mint);
      const [mintAuthority] = PublicKey.findProgramAddressSync(
        [Buffer.from(MINT_AUTHORITY_SEED), mint.toBuffer()],
        SSS_CORE_PROGRAM_ID
      );

      const txSig = await program.methods
        .freezeAccount()
        .accountsPartial({
          signer: wallet.publicKey,
          config: configPda,
          mint,
          targetTokenAccount: new PublicKey(tokenAccount),
          mintAuthority,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .rpc();

      addToast({ type: "success", message: "Account frozen", txSig });
    } catch (err) {
      addToast({
        type: "error",
        message: `Freeze failed: ${err instanceof Error ? err.message : "Unknown error"}`,
      });
    } finally {
      setFreezeLoading(false);
    }
  };

  const handleThaw = async () => {
    if (!wallet || !isValidPublicKey(tokenAccount)) return;
    setThawLoading(true);
    try {
      const provider = new AnchorProvider(connection, wallet, {
        commitment: "confirmed",
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const program = new Program(sssCoreIdl as any, provider);
      const mint = new PublicKey(mintAddress);
      const [configPda] = findConfigPda(mint);
      const [mintAuthority] = PublicKey.findProgramAddressSync(
        [Buffer.from(MINT_AUTHORITY_SEED), mint.toBuffer()],
        SSS_CORE_PROGRAM_ID
      );

      const txSig = await program.methods
        .thawAccount()
        .accountsPartial({
          signer: wallet.publicKey,
          config: configPda,
          mint,
          targetTokenAccount: new PublicKey(tokenAccount),
          mintAuthority,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .rpc();

      addToast({ type: "success", message: "Account thawed", txSig });
    } catch (err) {
      addToast({
        type: "error",
        message: `Thaw failed: ${err instanceof Error ? err.message : "Unknown error"}`,
      });
    } finally {
      setThawLoading(false);
    }
  };

  return (
    <div className="rounded-xl bg-[var(--bg-card)] border border-[var(--border)] p-5">
      <div className="flex items-center gap-2 mb-4">
        <Snowflake className="w-4 h-4 text-[var(--info)]" />
        <h3 className="text-sm font-medium text-[var(--text-primary)]">
          Freeze / Thaw Account
        </h3>
      </div>
      <div className="space-y-3">
        <input
          type="text"
          value={tokenAccount}
          onChange={(e) => setTokenAccount(e.target.value)}
          placeholder="Token account address..."
          className="w-full h-10 px-3.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border)] text-sm font-[family-name:var(--font-jetbrains)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] transition-colors"
        />
        <p className="text-xs text-[var(--text-muted)]">
          Enter the token account (not wallet) address to freeze or thaw. Works
          even when paused.
        </p>
        <div className="flex gap-3">
          <button
            onClick={handleFreeze}
            disabled={freezeLoading || !isValidPublicKey(tokenAccount)}
            className="h-10 px-4 rounded-lg bg-[var(--info)] text-white text-sm font-medium hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-2"
          >
            {freezeLoading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Snowflake className="w-3.5 h-3.5" />
            )}
            Freeze
          </button>
          <button
            onClick={handleThaw}
            disabled={thawLoading || !isValidPublicKey(tokenAccount)}
            className="h-10 px-4 rounded-lg bg-[var(--warning)] text-black text-sm font-medium hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-2"
          >
            {thawLoading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Sun className="w-3.5 h-3.5" />
            )}
            Thaw
          </button>
        </div>
      </div>
    </div>
  );
}

function BlacklistRow({
  entry,
  mintAddress,
  isBlacklister,
  config,
}: {
  entry: BlacklistEntry;
  mintAddress: string;
  isBlacklister: boolean;
  config: StablecoinConfig;
}) {
  const [removing, setRemoving] = useState(false);
  const { connection } = useConnection();
  const wallet = useAnchorWallet();
  const { addToast } = useToast();
  const queryClient = useQueryClient();

  const handleRemove = async () => {
    if (!wallet) return;
    setRemoving(true);
    try {
      const provider = new AnchorProvider(connection, wallet, {
        commitment: "confirmed",
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const hookProgram = new Program(sssHookIdl as any, provider);
      const mint = new PublicKey(mintAddress);
      const walletPk = new PublicKey(entry.wallet);
      const [configPda] = findConfigPda(mint);
      const [blacklistPda] = findBlacklistPda(mint, walletPk);

      const txSig = await hookProgram.methods
        .removeFromBlacklist()
        .accountsPartial({
          blacklister: wallet.publicKey,
          mint,
          stablecoinConfig: configPda,
          blacklistEntry: blacklistPda,
        })
        .rpc();

      addToast({
        type: "success",
        message: "Wallet removed from blacklist",
        txSig,
      });
      queryClient.invalidateQueries({ queryKey: ["blacklist"] });
    } catch (err) {
      addToast({
        type: "error",
        message: `Remove failed: ${err instanceof Error ? err.message : "Unknown error"}`,
      });
    } finally {
      setRemoving(false);
    }
  };

  return (
    <tr className="border-b border-[var(--border)] last:border-b-0 hover:bg-[var(--bg-secondary)] transition-colors">
      <td className="px-5 py-3.5">
        <Address address={entry.wallet} chars={6} showExplorer />
      </td>
      <td className="px-5 py-3.5">
        <span className="text-xs text-[var(--text-secondary)] max-w-[200px] truncate block">
          {entry.reason || "No reason"}
        </span>
      </td>
      <td className="px-5 py-3.5 hidden md:table-cell">
        <Address address={entry.blacklistedBy} chars={4} />
      </td>
      <td className="px-5 py-3.5 text-center">
        <Badge variant="danger">Blacklisted</Badge>
      </td>
      {isBlacklister && (
        <td className="px-5 py-3.5 text-right">
          <button
            onClick={handleRemove}
            disabled={removing}
            className="inline-flex items-center gap-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--danger)] transition-colors disabled:opacity-50"
          >
            {removing ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Trash2 className="w-3 h-3" />
            )}
            Remove
          </button>
        </td>
      )}
    </tr>
  );
}
