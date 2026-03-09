import React, { useState } from "react";
import { useStablecoin } from "../hooks/useStablecoin";
import { useStablecoinContext } from "../contexts/StablecoinContext";
import { LoadingSpinner } from "../components/shared/LoadingSpinner";
import { toast } from "../components/shared/TransactionToast";
import { Field } from "@/components/ui/Field";
import { TxResult } from "@/components/ui/TxResult";

// ── Blacklist section ────────────────────────────────────────────────────────

function BlacklistSection() {
  const { blacklist, unblacklist, compliTxState } = useStablecoin();
  const [wallet, setWallet] = useState("");

  const handleBlacklist = async (e: React.FormEvent) => {
    e.preventDefault();
    const sig = await blacklist(wallet.trim());
    if (sig) {
      toast.success("Wallet blacklisted", { txSig: sig });
      setWallet("");
    } else if (compliTxState.error) {
      toast.error(compliTxState.error);
    }
  };

  const handleUnblacklist = async () => {
    if (!wallet.trim()) return;
    const sig = await unblacklist(wallet.trim());
    if (sig) {
      toast.success("Wallet removed from blacklist", { txSig: sig });
      setWallet("");
    } else if (compliTxState.error) {
      toast.error(compliTxState.error);
    }
  };

  return (
    <div className="card p-5 space-y-4">
      <div>
        <h2 className="section-title">Blacklist Management</h2>
        <p className="section-subtitle mt-0.5">
          Block or unblock a wallet from transfers (SSS-2 and above with transfer hook required)
        </p>
      </div>
      <form onSubmit={handleBlacklist} className="space-y-3">
        <Field label="Wallet address" hint="The wallet to blacklist or remove from blacklist">
          <input
            className="input font-mono text-xs"
            value={wallet}
            onChange={(e) => setWallet(e.target.value)}
            placeholder="Wallet public key…"
            required
          />
        </Field>
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={compliTxState.loading || !wallet.trim()}
            className="btn-danger flex-1"
          >
            {compliTxState.loading ? <LoadingSpinner size={16} color="border-white" /> : null}
            Blacklist
          </button>
          <button
            type="button"
            disabled={compliTxState.loading || !wallet.trim()}
            onClick={handleUnblacklist}
            className="btn-secondary flex-1"
          >
            {compliTxState.loading ? <LoadingSpinner size={16} color="border-indigo-500" /> : null}
            Remove
          </button>
        </div>
        <TxResult error={compliTxState.error} txSig={compliTxState.txSig} />
      </form>
    </div>
  );
}

// ── Freeze / Thaw section ─────────────────────────────────────────────────────

function FreezeSection() {
  const { freezeAccount, thawAccount, compliTxState } = useStablecoin();
  const [tokenAccount, setTokenAccount] = useState("");

  const handleFreeze = async (e: React.FormEvent) => {
    e.preventDefault();
    const sig = await freezeAccount(tokenAccount.trim());
    if (sig) {
      toast.success("Account frozen", { txSig: sig });
      setTokenAccount("");
    } else if (compliTxState.error) {
      toast.error(compliTxState.error);
    }
  };

  const handleThaw = async () => {
    if (!tokenAccount.trim()) return;
    const sig = await thawAccount(tokenAccount.trim());
    if (sig) {
      toast.success("Account thawed", { txSig: sig });
      setTokenAccount("");
    } else if (compliTxState.error) {
      toast.error(compliTxState.error);
    }
  };

  return (
    <div className="card p-5 space-y-4">
      <div>
        <h2 className="section-title">Freeze / Thaw Account</h2>
        <p className="section-subtitle mt-0.5">
          Freeze or thaw a token account (requires admin or ComplianceOfficer role)
        </p>
      </div>
      <form onSubmit={handleFreeze} className="space-y-3">
        <Field
          label="Token account address"
          hint="The associated token account (ATA) to freeze or thaw"
        >
          <input
            className="input font-mono text-xs"
            value={tokenAccount}
            onChange={(e) => setTokenAccount(e.target.value)}
            placeholder="Token account public key…"
            required
          />
        </Field>
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={compliTxState.loading || !tokenAccount.trim()}
            className="btn-danger flex-1"
          >
            {compliTxState.loading ? <LoadingSpinner size={16} color="border-white" /> : null}
            Freeze
          </button>
          <button
            type="button"
            disabled={compliTxState.loading || !tokenAccount.trim()}
            onClick={handleThaw}
            className="btn-success flex-1"
          >
            {compliTxState.loading ? <LoadingSpinner size={16} color="border-white" /> : null}
            Thaw
          </button>
        </div>
        <TxResult error={compliTxState.error} txSig={compliTxState.txSig} />
      </form>
    </div>
  );
}

// ── Info panel ────────────────────────────────────────────────────────────────

function ComplianceInfoPanel() {
  return (
    <div className="card p-5 space-y-3">
      <h2 className="section-title">About Compliance Features</h2>
      <div className="space-y-3 text-sm text-slate-400">
        <div className="flex gap-3">
          <span className="w-6 h-6 rounded-full bg-red-900/40 text-red-400 flex items-center justify-center flex-shrink-0 text-xs font-bold mt-0.5">B</span>
          <div>
            <p className="font-medium text-slate-300">Blacklist</p>
            <p className="text-xs mt-0.5 text-slate-500">
              Prevents a wallet from sending or receiving the stablecoin via the
              transfer hook program. Requires SSS-2 or above with transfer hook enabled.
            </p>
          </div>
        </div>
        <div className="flex gap-3">
          <span className="w-6 h-6 rounded-full bg-amber-900/40 text-amber-400 flex items-center justify-center flex-shrink-0 text-xs font-bold mt-0.5">F</span>
          <div>
            <p className="font-medium text-slate-300">Freeze</p>
            <p className="text-xs mt-0.5 text-slate-500">
              Freezes a specific token account using the Token-2022 freeze authority.
              The account cannot send or receive tokens while frozen.
            </p>
          </div>
        </div>
        <div className="flex gap-3">
          <span className="w-6 h-6 rounded-full bg-emerald-900/40 text-emerald-400 flex items-center justify-center flex-shrink-0 text-xs font-bold mt-0.5">T</span>
          <div>
            <p className="font-medium text-slate-300">Thaw</p>
            <p className="text-xs mt-0.5 text-slate-500">
              Restores a previously frozen token account, re-enabling transfers.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CompliancePage() {
  const { mintAddress, infoError } = useStablecoinContext();

  if (!mintAddress) {
    return (
      <div className="card p-8 text-center text-slate-500 text-sm">
        Select a mint address in the header to access compliance controls.
      </div>
    );
  }

  if (infoError) {
    return <div className="card p-6 text-red-400 text-sm">{infoError}</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white">Compliance</h1>
        <p className="text-sm text-slate-500 mt-1">
          Blacklist wallets and freeze token accounts.
        </p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <BlacklistSection />
        <FreezeSection />
      </div>
      <ComplianceInfoPanel />
    </div>
  );
}
