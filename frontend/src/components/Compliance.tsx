import { useState } from "react";

export default function Compliance() {
  const [addAddress, setAddAddress] = useState("");
  const [addReason, setAddReason] = useState("");
  const [removeAddress, setRemoveAddress] = useState("");
  const [checkAddress, setCheckAddress] = useState("");
  const [checkResult, setCheckResult] = useState<"blacklisted" | "clean" | null>(
    null
  );

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    console.log("Add to blacklist:", { address: addAddress, reason: addReason });
  };

  const handleRemove = (e: React.FormEvent) => {
    e.preventDefault();
    console.log("Remove from blacklist:", { address: removeAddress });
  };

  const handleCheck = (e: React.FormEvent) => {
    e.preventDefault();
    // Stub: simulate check
    setCheckResult(Math.random() > 0.5 ? "blacklisted" : "clean");
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-zinc-100">
        Compliance (SSS-2)
      </h1>

      <p className="text-sm text-zinc-400">
        Manage the blacklist for sanctioned addresses. Blacklisted accounts
        cannot send or receive tokens. Add, remove, or check blacklist status.
      </p>

      <div className="grid gap-6 lg:grid-cols-2">
        <form
          onSubmit={handleAdd}
          className="rounded-xl border border-zinc-700/50 bg-zinc-800/50 p-6"
        >
          <h2 className="mb-4 text-lg font-medium text-zinc-100">
            Add to Blacklist
          </h2>
          <div className="space-y-4">
            <Input
              label="Address"
              value={addAddress}
              onChange={setAddAddress}
              placeholder="Base58 public key..."
              required
            />
            <Input
              label="Reason"
              value={addReason}
              onChange={setAddReason}
              placeholder="e.g. OFAC SDN List"
              required
            />
          </div>
          <button
            type="submit"
            className="mt-6 w-full rounded-lg bg-rose-500/80 px-4 py-2.5 font-medium text-zinc-100 transition-colors hover:bg-rose-500"
          >
            Add to Blacklist
          </button>
        </form>

        <form
          onSubmit={handleRemove}
          className="rounded-xl border border-zinc-700/50 bg-zinc-800/50 p-6"
        >
          <h2 className="mb-4 text-lg font-medium text-zinc-100">
            Remove from Blacklist
          </h2>
          <div className="space-y-4">
            <Input
              label="Address"
              value={removeAddress}
              onChange={setRemoveAddress}
              placeholder="Base58 public key..."
              required
            />
          </div>
          <button
            type="submit"
            className="mt-6 w-full rounded-lg bg-emerald-500/80 px-4 py-2.5 font-medium text-zinc-900 transition-colors hover:bg-emerald-500"
          >
            Remove from Blacklist
          </button>
        </form>
      </div>

      <form
        onSubmit={handleCheck}
        className="rounded-xl border border-zinc-700/50 bg-zinc-800/50 p-6"
      >
        <h2 className="mb-4 text-lg font-medium text-zinc-100">
          Check Blacklist Status
        </h2>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <div className="flex-1">
            <Input
              label="Address"
              value={checkAddress}
              onChange={setCheckAddress}
              placeholder="Base58 public key..."
              required
            />
          </div>
          <button
            type="submit"
            className="rounded-lg border border-zinc-600 bg-zinc-700 px-4 py-2.5 font-medium text-zinc-100 transition-colors hover:bg-zinc-600 sm:w-auto"
          >
            Check
          </button>
        </div>
        {checkResult && (
          <div
            className={`mt-4 rounded-lg px-4 py-3 font-medium ${
              checkResult === "blacklisted"
                ? "bg-rose-500/20 text-rose-400"
                : "bg-emerald-500/20 text-emerald-400"
            }`}
          >
            {checkResult === "blacklisted" ? "Blacklisted" : "Clean"}
          </div>
        )}
      </form>
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
  placeholder,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-zinc-400">
        {label}
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        className="w-full rounded-lg border border-zinc-600 bg-zinc-800 px-4 py-2.5 text-zinc-100 placeholder-zinc-500 focus:border-cyan-500/50 focus:outline-none focus:ring-1 focus:ring-cyan-500/50"
      />
    </div>
  );
}
