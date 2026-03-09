import React, { useState } from "react";
import { useStablecoin } from "../hooks/useStablecoin";
import { useStablecoinContext } from "../contexts/StablecoinContext";
import { LoadingSpinner } from "../components/shared/LoadingSpinner";
import { toast } from "../components/shared/TransactionToast";
import { Field } from "@/components/ui/Field";
import { TxResult } from "@/components/ui/TxResult";

const DECIMALS = 6;

// ── Mint section ─────────────────────────────────────────────────────────────

function MintSection() {
  const { mintTo, mintTxState } = useStablecoin();
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const sig = await mintTo(to.trim(), amount, DECIMALS);
    if (sig) {
      toast.success("Tokens minted successfully", { txSig: sig });
      setTo("");
      setAmount("");
    } else if (mintTxState.error) {
      toast.error(mintTxState.error);
    }
  };

  return (
    <div className="card p-5 space-y-4">
      <div>
        <h2 className="section-title">Mint Tokens</h2>
        <p className="section-subtitle mt-0.5">Issue new tokens to a wallet (requires Minter role)</p>
      </div>
      <form onSubmit={handleSubmit} className="space-y-3">
        <Field label="Recipient wallet address">
          <input
            className="input font-mono text-xs"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="Recipient token account or wallet…"
            required
          />
        </Field>
        <Field label="Amount" hint={`Whole units (e.g. 1000 = 1,000 tokens). Decimals: ${DECIMALS}`}>
          <input
            className="input"
            type="number"
            min="0"
            step="any"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="1000"
            required
          />
        </Field>
        <button
          type="submit"
          disabled={mintTxState.loading}
          className="btn-primary w-full"
        >
          {mintTxState.loading ? <LoadingSpinner size={16} color="border-white" /> : null}
          {mintTxState.loading ? "Minting…" : "Mint Tokens"}
        </button>
        <TxResult error={mintTxState.error} txSig={mintTxState.txSig} />
      </form>
    </div>
  );
}

// ── Burn section ─────────────────────────────────────────────────────────────

function BurnSection() {
  const { burnFrom, burnTxState } = useStablecoin();
  const [from, setFrom] = useState("");
  const [amount, setAmount] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const sig = await burnFrom(from.trim(), amount, DECIMALS);
    if (sig) {
      toast.success("Tokens burned successfully", { txSig: sig });
      setFrom("");
      setAmount("");
    } else if (burnTxState.error) {
      toast.error(burnTxState.error);
    }
  };

  return (
    <div className="card p-5 space-y-4">
      <div>
        <h2 className="section-title">Burn Tokens</h2>
        <p className="section-subtitle mt-0.5">Remove tokens from a token account (requires Burner role)</p>
      </div>
      <form onSubmit={handleSubmit} className="space-y-3">
        <Field label="Source token account">
          <input
            className="input font-mono text-xs"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            placeholder="Token account address…"
            required
          />
        </Field>
        <Field label="Amount" hint={`Whole units. Decimals: ${DECIMALS}`}>
          <input
            className="input"
            type="number"
            min="0"
            step="any"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="100"
            required
          />
        </Field>
        <button
          type="submit"
          disabled={burnTxState.loading}
          className="btn-danger w-full"
        >
          {burnTxState.loading ? <LoadingSpinner size={16} color="border-white" /> : null}
          {burnTxState.loading ? "Burning…" : "Burn Tokens"}
        </button>
        <TxResult error={burnTxState.error} txSig={burnTxState.txSig} />
      </form>
    </div>
  );
}

// ── Seize section ─────────────────────────────────────────────────────────────

function SeizeSection() {
  const { seize, seizeTxState } = useStablecoin();
  const [from, setFrom] = useState("");
  const [treasuryAta, setTreasuryAta] = useState("");
  const [amount, setAmount] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const sig = await seize(from.trim(), treasuryAta.trim(), amount, DECIMALS);
    if (sig) {
      toast.success("Tokens seized successfully", { txSig: sig });
      setFrom("");
      setTreasuryAta("");
      setAmount("");
    } else if (seizeTxState.error) {
      toast.error(seizeTxState.error);
    }
  };

  return (
    <div className="card p-5 space-y-4">
      <div>
        <h2 className="section-title">Seize Tokens</h2>
        <p className="section-subtitle mt-0.5">Confiscate tokens to the treasury (requires Seizer role)</p>
      </div>
      <form onSubmit={handleSubmit} className="space-y-3">
        <Field label="Source token account">
          <input
            className="input font-mono text-xs"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            placeholder="Token account to seize from…"
            required
          />
        </Field>
        <Field label="Treasury ATA" hint="Associated token account of the treasury">
          <input
            className="input font-mono text-xs"
            value={treasuryAta}
            onChange={(e) => setTreasuryAta(e.target.value)}
            placeholder="Treasury associated token account…"
            required
          />
        </Field>
        <Field label="Amount" hint={`Whole units. Decimals: ${DECIMALS}`}>
          <input
            className="input"
            type="number"
            min="0"
            step="any"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="50"
            required
          />
        </Field>
        <button
          type="submit"
          disabled={seizeTxState.loading}
          className="btn-danger w-full"
        >
          {seizeTxState.loading ? <LoadingSpinner size={16} color="border-white" /> : null}
          {seizeTxState.loading ? "Seizing…" : "Seize Tokens"}
        </button>
        <TxResult error={seizeTxState.error} txSig={seizeTxState.txSig} />
      </form>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function OperationsPage() {
  const { mintAddress, infoError } = useStablecoinContext();

  if (!mintAddress) {
    return (
      <div className="card p-8 text-center text-slate-500 text-sm">
        Select a mint address in the header to perform operations.
      </div>
    );
  }

  if (infoError) {
    return (
      <div className="card p-6 text-red-400 text-sm">{infoError}</div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white">Operations</h1>
        <p className="text-sm text-slate-500 mt-1">
          Mint, burn, and seize stablecoin tokens.
        </p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
        <MintSection />
        <BurnSection />
        <SeizeSection />
      </div>
    </div>
  );
}
