"use client";

import { useState } from "react";

interface MintSelectorProps {
  onSelect: (mintAddress: string) => void;
  currentMint: string | null;
}

export function MintSelector({ onSelect, currentMint }: MintSelectorProps) {
  const [address, setAddress] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (address.trim()) {
      onSelect(address.trim());
      setAddress("");
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <h3 className="mb-3 text-sm font-medium text-muted-foreground">
        Active Mint
      </h3>
      {currentMint ? (
        <div className="mb-3 flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-success" />
          <code className="text-xs text-foreground font-mono truncate">
            {currentMint}
          </code>
        </div>
      ) : (
        <p className="mb-3 text-xs text-muted-foreground">
          No mint selected. Enter a mint address below.
        </p>
      )}
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="Enter mint address..."
          className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        />
        <button
          type="submit"
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent/80"
        >
          Load
        </button>
      </form>
    </div>
  );
}
