"use client";

import { useState } from "react";
import { Navbar } from "@/components/navbar";

function SectionCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
      <p className="mb-4 text-sm text-muted-foreground">{description}</p>
      {children}
    </div>
  );
}

function FormInput({
  label,
  placeholder,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-muted-foreground">
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
      />
    </div>
  );
}

function ActionButton({
  children,
  onClick,
  variant = "primary",
}: {
  children: React.ReactNode;
  onClick: () => void;
  variant?: "primary" | "destructive" | "warning";
}) {
  const styles = {
    primary: "bg-accent hover:bg-accent/80 text-white",
    destructive: "bg-destructive hover:bg-destructive/80 text-white",
    warning: "bg-warning hover:bg-warning/80 text-black",
  };

  return (
    <button
      onClick={onClick}
      className={`rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${styles[variant]}`}
    >
      {children}
    </button>
  );
}

export default function OperationsPage() {
  const [mintTo, setMintTo] = useState("");
  const [mintAmount, setMintAmount] = useState("");
  const [burnFrom, setBurnFrom] = useState("");
  const [burnAmount, setBurnAmount] = useState("");
  const [freezeAccount, setFreezeAccount] = useState("");
  const [thawAccount, setThawAccount] = useState("");

  const handleMint = () => {
    // TODO: Connect to RPC — build and send mint_tokens instruction via Anchor
    console.log("Mint", { to: mintTo, amount: mintAmount });
  };

  const handleBurn = () => {
    // TODO: Connect to RPC — build and send burn_tokens instruction via Anchor
    console.log("Burn", { from: burnFrom, amount: burnAmount });
  };

  const handleFreeze = () => {
    // TODO: Connect to RPC — build and send freeze_account instruction via Anchor
    console.log("Freeze", { account: freezeAccount });
  };

  const handleThaw = () => {
    // TODO: Connect to RPC — build and send thaw_account instruction via Anchor
    console.log("Thaw", { account: thawAccount });
  };

  const handlePause = () => {
    // TODO: Connect to RPC — build and send pause instruction via Anchor
    console.log("Pause triggered");
  };

  const handleUnpause = () => {
    // TODO: Connect to RPC — build and send unpause instruction via Anchor
    console.log("Unpause triggered");
  };

  return (
    <div>
      <Navbar title="Token Operations" />
      <div className="p-6 space-y-6">
        {/* Mint */}
        <SectionCard
          title="Mint Tokens"
          description="Issue new tokens to a recipient address. Requires minter role."
        >
          <div className="space-y-3">
            <FormInput
              label="Recipient Address"
              placeholder="Enter Solana wallet address..."
              value={mintTo}
              onChange={setMintTo}
            />
            <FormInput
              label="Amount"
              placeholder="e.g. 1000000"
              value={mintAmount}
              onChange={setMintAmount}
              type="number"
            />
            <ActionButton onClick={handleMint}>Mint Tokens</ActionButton>
          </div>
        </SectionCard>

        {/* Burn */}
        <SectionCard
          title="Burn Tokens"
          description="Burn tokens from a token account. Reduces circulating supply."
        >
          <div className="space-y-3">
            <FormInput
              label="Token Account"
              placeholder="Enter token account address..."
              value={burnFrom}
              onChange={setBurnFrom}
            />
            <FormInput
              label="Amount"
              placeholder="e.g. 500000"
              value={burnAmount}
              onChange={setBurnAmount}
              type="number"
            />
            <ActionButton onClick={handleBurn} variant="destructive">
              Burn Tokens
            </ActionButton>
          </div>
        </SectionCard>

        {/* Freeze / Thaw */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <SectionCard
            title="Freeze Account"
            description="Freeze a token account to prevent all transfers. Requires freezer role."
          >
            <div className="space-y-3">
              <FormInput
                label="Account to Freeze"
                placeholder="Enter token account address..."
                value={freezeAccount}
                onChange={setFreezeAccount}
              />
              <ActionButton onClick={handleFreeze} variant="warning">
                Freeze Account
              </ActionButton>
            </div>
          </SectionCard>

          <SectionCard
            title="Thaw Account"
            description="Unfreeze a previously frozen token account to restore transfers."
          >
            <div className="space-y-3">
              <FormInput
                label="Account to Thaw"
                placeholder="Enter token account address..."
                value={thawAccount}
                onChange={setThawAccount}
              />
              <ActionButton onClick={handleThaw}>Thaw Account</ActionButton>
            </div>
          </SectionCard>
        </div>

        {/* Pause / Unpause */}
        <SectionCard
          title="Emergency Controls"
          description="Pause or resume all stablecoin operations. Requires pauser role."
        >
          <div className="flex items-center gap-3">
            <ActionButton onClick={handlePause} variant="destructive">
              Pause All Operations
            </ActionButton>
            <ActionButton onClick={handleUnpause}>
              Resume Operations
            </ActionButton>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Pausing halts all mint, burn, and transfer operations for this stablecoin.
          </p>
        </SectionCard>
      </div>
    </div>
  );
}
