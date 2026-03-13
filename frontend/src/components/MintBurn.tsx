import { useState } from "react";

export default function MintBurn() {
  const [mintRecipient, setMintRecipient] = useState("");
  const [mintAmount, setMintAmount] = useState("");
  const [burnRecipient, setBurnRecipient] = useState("");
  const [burnAmount, setBurnAmount] = useState("");
  const [activeTab, setActiveTab] = useState<"mint" | "burn">("mint");

  const handleMint = (e: React.FormEvent) => {
    e.preventDefault();
    console.log("Mint:", { recipient: mintRecipient, amount: mintAmount });
  };

  const handleBurn = (e: React.FormEvent) => {
    e.preventDefault();
    console.log("Burn:", { recipient: burnRecipient, amount: burnAmount });
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-zinc-100">Mint / Burn</h1>

      <div className="flex gap-2 rounded-lg border border-zinc-700/50 bg-zinc-800/30 p-1">
        <TabButton
          active={activeTab === "mint"}
          onClick={() => setActiveTab("mint")}
        >
          Mint
        </TabButton>
        <TabButton
          active={activeTab === "burn"}
          onClick={() => setActiveTab("burn")}
        >
          Burn
        </TabButton>
      </div>

      {activeTab === "mint" && (
        <form
          onSubmit={handleMint}
          className="rounded-xl border border-zinc-700/50 bg-zinc-800/50 p-6"
        >
          <h2 className="mb-4 text-lg font-medium text-zinc-100">Mint Tokens</h2>
          <div className="space-y-4">
            <Input
              label="Recipient Address"
              value={mintRecipient}
              onChange={setMintRecipient}
              placeholder="Base58 public key or Solana address..."
              required
            />
            <Input
              label="Amount"
              value={mintAmount}
              onChange={setMintAmount}
              type="number"
              placeholder="0"
              required
              min="0"
              step="0.000001"
            />
          </div>
          <button
            type="submit"
            className="mt-6 w-full rounded-lg bg-cyan-500 px-4 py-2.5 font-medium text-zinc-900 transition-colors hover:bg-cyan-400"
          >
            Mint Tokens
          </button>
        </form>
      )}

      {activeTab === "burn" && (
        <form
          onSubmit={handleBurn}
          className="rounded-xl border border-zinc-700/50 bg-zinc-800/50 p-6"
        >
          <h2 className="mb-4 text-lg font-medium text-zinc-100">Burn Tokens</h2>
          <div className="space-y-4">
            <Input
              label="Token Account / Recipient"
              value={burnRecipient}
              onChange={setBurnRecipient}
              placeholder="Token account to burn from..."
            />
            <Input
              label="Amount"
              value={burnAmount}
              onChange={setBurnAmount}
              type="number"
              placeholder="0"
              required
              min="0"
              step="0.000001"
            />
          </div>
          <button
            type="submit"
            className="mt-6 w-full rounded-lg bg-amber-500/80 px-4 py-2.5 font-medium text-zinc-900 transition-colors hover:bg-amber-500"
          >
            Burn Tokens
          </button>
        </form>
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
        active
          ? "bg-cyan-500/20 text-cyan-400"
          : "text-zinc-400 hover:text-zinc-200"
      }`}
    >
      {children}
    </button>
  );
}

function Input({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  required,
  min,
  step,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
  min?: string;
  step?: string;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-zinc-400">
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        min={min}
        step={step}
        className="w-full rounded-lg border border-zinc-600 bg-zinc-800 px-4 py-2.5 text-zinc-100 placeholder-zinc-500 focus:border-cyan-500/50 focus:outline-none focus:ring-1 focus:ring-cyan-500/50"
      />
    </div>
  );
}
