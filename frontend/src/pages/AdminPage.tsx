import React, { useState } from "react";
import { useStablecoin } from "../hooks/useStablecoin";
import { useStablecoinContext } from "../contexts/StablecoinContext";
import { useWallet } from "@solana/wallet-adapter-react";
import { LoadingSpinner } from "../components/shared/LoadingSpinner";
import { AddressDisplay } from "../components/shared/AddressDisplay";
import { toast } from "../components/shared/TransactionToast";
import { Field } from "@/components/ui/Field";
import { TxResult } from "@/components/ui/TxResult";

// ── Pause / Unpause ───────────────────────────────────────────────────────────

function PauseSection() {
  const { pause, unpause, pauseTxState } = useStablecoin();
  const { info } = useStablecoinContext();

  const handlePause = async () => {
    const sig = await pause();
    if (sig) toast.success("Stablecoin paused", { txSig: sig });
    else if (pauseTxState.error) toast.error(pauseTxState.error);
  };

  const handleUnpause = async () => {
    const sig = await unpause();
    if (sig) toast.success("Stablecoin unpaused", { txSig: sig });
    else if (pauseTxState.error) toast.error(pauseTxState.error);
  };

  const paused = info?.paused ?? false;

  return (
    <div className="card p-5 space-y-4">
      <div>
        <h2 className="section-title">Pause Control</h2>
        <p className="section-subtitle mt-0.5">
          Halt or resume all transfers for this stablecoin
        </p>
      </div>

      <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-surface border border-surface-border">
        <span
          className={`w-3 h-3 rounded-full flex-shrink-0 ${
            paused ? "bg-amber-400" : "bg-emerald-400"
          }`}
        />
        <span className="text-sm text-slate-300">
          Status:{" "}
          <span className={`font-semibold ${paused ? "text-amber-400" : "text-emerald-400"}`}>
            {paused ? "Paused" : "Active"}
          </span>
        </span>
      </div>

      <div className="flex gap-2">
        <button
          onClick={handlePause}
          disabled={pauseTxState.loading || paused}
          className="btn-danger flex-1"
        >
          {pauseTxState.loading ? <LoadingSpinner size={16} color="border-white" /> : null}
          Pause
        </button>
        <button
          onClick={handleUnpause}
          disabled={pauseTxState.loading || !paused}
          className="btn-success flex-1"
        >
          {pauseTxState.loading ? <LoadingSpinner size={16} color="border-white" /> : null}
          Unpause
        </button>
      </div>
      <TxResult error={pauseTxState.error} txSig={pauseTxState.txSig} />

      <p className="text-xs text-slate-600">
        Pausing prevents all token transfers. Only the admin or a wallet with the
        Pauser role can pause/unpause.
      </p>
    </div>
  );
}

// ── Transfer admin ────────────────────────────────────────────────────────────

function TransferAdminSection() {
  const { transferAdmin, adminTxState } = useStablecoin();
  const { info } = useStablecoinContext();
  const [newAdmin, setNewAdmin] = useState("");
  const [confirmed, setConfirmed] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!confirmed) return;
    const sig = await transferAdmin(newAdmin.trim());
    if (sig) {
      toast.success("Admin transfer initiated. New admin must call Accept Admin.", { txSig: sig });
      setNewAdmin("");
      setConfirmed(false);
    } else if (adminTxState.error) {
      toast.error(adminTxState.error);
    }
  };

  return (
    <div className="card p-5 space-y-4">
      <div>
        <h2 className="section-title">Transfer Admin</h2>
        <p className="section-subtitle mt-0.5">
          Initiate a two-step admin handover to a new wallet
        </p>
      </div>

      {info && (
        <div className="text-xs space-y-1 px-3 py-2 bg-surface rounded-lg border border-surface-border">
          <div className="flex justify-between">
            <span className="text-slate-500">Current admin</span>
            <AddressDisplay address={info.admin.toBase58()} textSize="text-xs" />
          </div>
          {info.pendingAdmin &&
            info.pendingAdmin.toBase58() !== "11111111111111111111111111111111" && (
              <div className="flex justify-between">
                <span className="text-slate-500">Pending admin</span>
                <AddressDisplay address={info.pendingAdmin.toBase58()} textSize="text-xs" />
              </div>
            )}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-3">
        <Field
          label="New admin wallet"
          hint="This wallet must call Accept Admin to complete the transfer."
        >
          <input
            className="input font-mono text-xs"
            value={newAdmin}
            onChange={(e) => setNewAdmin(e.target.value)}
            placeholder="New admin public key…"
            required
          />
        </Field>
        <label className="flex items-start gap-2 cursor-pointer">
          <input
            type="checkbox"
            className="mt-0.5 rounded border-surface-border bg-surface text-indigo-600
                       focus:ring-indigo-500 focus:ring-offset-surface"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
          />
          <span className="text-xs text-slate-400">
            I understand this will begin a two-step admin transfer. The current admin
            retains control until the new admin accepts.
          </span>
        </label>
        <button
          type="submit"
          disabled={adminTxState.loading || !confirmed || !newAdmin.trim()}
          className="btn-danger w-full"
        >
          {adminTxState.loading ? <LoadingSpinner size={16} color="border-white" /> : null}
          {adminTxState.loading ? "Initiating…" : "Initiate Transfer"}
        </button>
        <TxResult error={adminTxState.error} txSig={adminTxState.txSig} />
      </form>
    </div>
  );
}

// ── Accept admin ──────────────────────────────────────────────────────────────

function AcceptAdminSection() {
  const { acceptAdmin, adminTxState } = useStablecoin();
  const { info } = useStablecoinContext();
  const { publicKey } = useWallet();

  const isPendingAdmin =
    publicKey &&
    info?.pendingAdmin &&
    info.pendingAdmin.toBase58() === publicKey.toBase58() &&
    info.pendingAdmin.toBase58() !== "11111111111111111111111111111111";

  const handleAccept = async () => {
    const sig = await acceptAdmin();
    if (sig) toast.success("Admin transfer accepted. You are now the admin.", { txSig: sig });
    else if (adminTxState.error) toast.error(adminTxState.error);
  };

  return (
    <div className="card p-5 space-y-4">
      <div>
        <h2 className="section-title">Accept Admin</h2>
        <p className="section-subtitle mt-0.5">
          Complete the pending admin transfer (pending admin only)
        </p>
      </div>

      {isPendingAdmin ? (
        <>
          <div className="flex items-center gap-2 px-3 py-2 bg-indigo-900/30 border border-indigo-700/40 rounded-lg">
            <svg className="w-4 h-4 text-indigo-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-xs text-indigo-300">
              Your connected wallet is the pending admin. You can accept the transfer.
            </p>
          </div>
          <button
            onClick={handleAccept}
            disabled={adminTxState.loading}
            className="btn-primary w-full"
          >
            {adminTxState.loading ? <LoadingSpinner size={16} color="border-white" /> : null}
            {adminTxState.loading ? "Accepting…" : "Accept Admin Transfer"}
          </button>
          <TxResult error={adminTxState.error} txSig={adminTxState.txSig} />
        </>
      ) : (
        <div className="px-3 py-3 bg-surface rounded-lg border border-surface-border text-xs text-slate-500">
          {!publicKey
            ? "Connect the pending-admin wallet to accept."
            : !info?.pendingAdmin ||
              info.pendingAdmin.toBase58() === "11111111111111111111111111111111"
            ? "No pending admin transfer found for this mint."
            : "Your connected wallet is not the pending admin."}
        </div>
      )}
    </div>
  );
}

// ── Set metadata ──────────────────────────────────────────────────────────────

function SetMetadataSection() {
  const { setMetadata, metaTxState } = useStablecoin();
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [uri, setUri] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const sig = await setMetadata(name.trim(), symbol.trim(), uri.trim());
    if (sig) {
      toast.success("Metadata updated", { txSig: sig });
      setName("");
      setSymbol("");
      setUri("");
    } else if (metaTxState.error) {
      toast.error(metaTxState.error);
    }
  };

  return (
    <div className="card p-5 space-y-4">
      <div>
        <h2 className="section-title">Update Metadata</h2>
        <p className="section-subtitle mt-0.5">Change token name, symbol, and URI (admin only)</p>
      </div>
      <form onSubmit={handleSubmit} className="space-y-3">
        <Field label="Token name">
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="My Stablecoin"
            required
          />
        </Field>
        <Field label="Symbol">
          <input
            className="input"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            placeholder="MUSD"
            maxLength={10}
            required
          />
        </Field>
        <Field label="Metadata URI" hint="HTTPS URL pointing to JSON metadata">
          <input
            className="input text-xs"
            value={uri}
            onChange={(e) => setUri(e.target.value)}
            placeholder="https://example.com/metadata.json"
            type="url"
            required
          />
        </Field>
        <button
          type="submit"
          disabled={metaTxState.loading}
          className="btn-primary w-full"
        >
          {metaTxState.loading ? <LoadingSpinner size={16} color="border-white" /> : null}
          {metaTxState.loading ? "Updating…" : "Update Metadata"}
        </button>
        <TxResult error={metaTxState.error} txSig={metaTxState.txSig} />
      </form>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AdminPage() {
  const { mintAddress, infoError } = useStablecoinContext();

  if (!mintAddress) {
    return (
      <div className="card p-8 text-center text-slate-500 text-sm">
        Select a mint address in the header to access admin controls.
      </div>
    );
  }

  if (infoError) {
    return <div className="card p-6 text-red-400 text-sm">{infoError}</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white">Admin Controls</h1>
        <p className="text-sm text-slate-500 mt-1">
          Pause the stablecoin, transfer admin rights, and update metadata.
        </p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <PauseSection />
        <SetMetadataSection />
        <TransferAdminSection />
        <AcceptAdminSection />
      </div>
    </div>
  );
}
