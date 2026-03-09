import React, { useState } from "react";
import { Role } from "@sss/sdk";
import { useStablecoin } from "../hooks/useStablecoin";
import { useStablecoinContext } from "../contexts/StablecoinContext";
import { LoadingSpinner } from "../components/shared/LoadingSpinner";
import { toast } from "../components/shared/TransactionToast";
import { roleLabel } from "../utils/format";
import { Field } from "@/components/ui/Field";
import { TxResult } from "@/components/ui/TxResult";

// ── Role option definitions ──────────────────────────────────────────────────

const ROLE_OPTIONS: { value: Role; label: string; description: string }[] = [
  { value: Role.Minter,            label: "Minter",             description: "Can mint new tokens up to allowance" },
  { value: Role.Burner,            label: "Burner",             description: "Can burn tokens from any account" },
  { value: Role.Seizer,            label: "Seizer",             description: "Can seize tokens to treasury" },
  { value: Role.Pauser,            label: "Pauser",             description: "Can pause/unpause the stablecoin" },
  { value: Role.ComplianceOfficer, label: "Compliance Officer", description: "Can freeze/thaw accounts" },
];

// ── Grant role section ────────────────────────────────────────────────────────

function GrantRoleSection() {
  const { grantRole, roleTxState } = useStablecoin();
  const [holder, setHolder] = useState("");
  const [role, setRole] = useState<Role>(Role.Minter);
  const [allowance, setAllowance] = useState("1000000000000"); // 1M with 6 decimals

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const sig = await grantRole(holder.trim(), role, allowance);
    if (sig) {
      toast.success(`${roleLabel(role)} role granted`, { txSig: sig });
      setHolder("");
    } else if (roleTxState.error) {
      toast.error(roleTxState.error);
    }
  };

  return (
    <div className="card p-5 space-y-4">
      <div>
        <h2 className="section-title">Grant Role</h2>
        <p className="section-subtitle mt-0.5">
          Assign an operator role to a wallet (admin only)
        </p>
      </div>
      <form onSubmit={handleSubmit} className="space-y-3">
        <Field label="Holder wallet address">
          <input
            className="input font-mono text-xs"
            value={holder}
            onChange={(e) => setHolder(e.target.value)}
            placeholder="Wallet to receive the role…"
            required
          />
        </Field>
        <Field label="Role">
          <select
            className="input"
            value={role}
            onChange={(e) => setRole(Number(e.target.value) as Role)}
          >
            {ROLE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <p className="text-xs text-slate-600 mt-1">
            {ROLE_OPTIONS.find((o) => o.value === role)?.description}
          </p>
        </Field>
        {(role === Role.Minter) && (
          <Field
            label="Mint allowance (raw units)"
            hint="Maximum total tokens this minter may issue. Use raw lamport-like units."
          >
            <input
              className="input font-mono"
              value={allowance}
              onChange={(e) => setAllowance(e.target.value)}
              placeholder="1000000000000"
              required
            />
          </Field>
        )}
        <button
          type="submit"
          disabled={roleTxState.loading}
          className="btn-primary w-full"
        >
          {roleTxState.loading ? <LoadingSpinner size={16} color="border-white" /> : null}
          {roleTxState.loading ? "Granting…" : "Grant Role"}
        </button>
        <TxResult error={roleTxState.error} txSig={roleTxState.txSig} />
      </form>
    </div>
  );
}

// ── Revoke role section ───────────────────────────────────────────────────────

function RevokeRoleSection() {
  const { revokeRole, roleTxState } = useStablecoin();
  const [holder, setHolder] = useState("");
  const [role, setRole] = useState<Role>(Role.Minter);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const sig = await revokeRole(holder.trim(), role);
    if (sig) {
      toast.success(`${roleLabel(role)} role revoked`, { txSig: sig });
      setHolder("");
    } else if (roleTxState.error) {
      toast.error(roleTxState.error);
    }
  };

  return (
    <div className="card p-5 space-y-4">
      <div>
        <h2 className="section-title">Revoke Role</h2>
        <p className="section-subtitle mt-0.5">
          Remove an operator role from a wallet (admin only)
        </p>
      </div>
      <form onSubmit={handleSubmit} className="space-y-3">
        <Field label="Holder wallet address">
          <input
            className="input font-mono text-xs"
            value={holder}
            onChange={(e) => setHolder(e.target.value)}
            placeholder="Wallet to revoke role from…"
            required
          />
        </Field>
        <Field label="Role to revoke">
          <select
            className="input"
            value={role}
            onChange={(e) => setRole(Number(e.target.value) as Role)}
          >
            {ROLE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
        <button
          type="submit"
          disabled={roleTxState.loading}
          className="btn-danger w-full"
        >
          {roleTxState.loading ? <LoadingSpinner size={16} color="border-white" /> : null}
          {roleTxState.loading ? "Revoking…" : "Revoke Role"}
        </button>
        <TxResult error={roleTxState.error} txSig={roleTxState.txSig} />
      </form>
    </div>
  );
}

// ── Increment allowance section ───────────────────────────────────────────────

function IncrementAllowanceSection() {
  const { incrementAllowance, roleTxState } = useStablecoin();
  const [minterHolder, setMinterHolder] = useState("");
  const [amount, setAmount] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const sig = await incrementAllowance(minterHolder.trim(), amount);
    if (sig) {
      toast.success("Allowance incremented", { txSig: sig });
      setMinterHolder("");
      setAmount("");
    } else if (roleTxState.error) {
      toast.error(roleTxState.error);
    }
  };

  return (
    <div className="card p-5 space-y-4">
      <div>
        <h2 className="section-title">Increment Minter Allowance</h2>
        <p className="section-subtitle mt-0.5">
          Top up an existing minter's mint allowance (admin only)
        </p>
      </div>
      <form onSubmit={handleSubmit} className="space-y-3">
        <Field label="Minter wallet address">
          <input
            className="input font-mono text-xs"
            value={minterHolder}
            onChange={(e) => setMinterHolder(e.target.value)}
            placeholder="Minter wallet…"
            required
          />
        </Field>
        <Field label="Amount (raw units)" hint="Added to the existing allowance as raw units">
          <input
            className="input font-mono"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="500000000000"
            required
          />
        </Field>
        <button
          type="submit"
          disabled={roleTxState.loading}
          className="btn-secondary w-full"
        >
          {roleTxState.loading ? <LoadingSpinner size={16} color="border-indigo-500" /> : null}
          {roleTxState.loading ? "Incrementing…" : "Increment Allowance"}
        </button>
        <TxResult error={roleTxState.error} txSig={roleTxState.txSig} />
      </form>
    </div>
  );
}

// ── Role reference table ──────────────────────────────────────────────────────

function RoleReferenceTable() {
  return (
    <div className="table-wrapper">
      <div className="px-5 py-4 border-b border-surface-border">
        <h2 className="section-title">Role Reference</h2>
      </div>
      <table className="table-base">
        <thead>
          <tr>
            <th>Role</th>
            <th>ID</th>
            <th>Permissions</th>
            <th>Allowance</th>
          </tr>
        </thead>
        <tbody>
          {ROLE_OPTIONS.map((r) => (
            <tr key={r.value}>
              <td>
                <span className="badge badge-blue">{r.label}</span>
              </td>
              <td className="font-mono text-slate-500">{r.value}</td>
              <td className="text-slate-400">{r.description}</td>
              <td className="text-slate-500">
                {r.value === Role.Minter ? "Yes (capped)" : "N/A (0)"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function RolesPage() {
  const { mintAddress, infoError } = useStablecoinContext();

  if (!mintAddress) {
    return (
      <div className="card p-8 text-center text-slate-500 text-sm">
        Select a mint address in the header to manage roles.
      </div>
    );
  }

  if (infoError) {
    return <div className="card p-6 text-red-400 text-sm">{infoError}</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white">Role Management</h1>
        <p className="text-sm text-slate-500 mt-1">
          Grant, revoke, and manage operator roles for this stablecoin.
        </p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
        <GrantRoleSection />
        <RevokeRoleSection />
        <IncrementAllowanceSection />
      </div>
      <RoleReferenceTable />
    </div>
  );
}
