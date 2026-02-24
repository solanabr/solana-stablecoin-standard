"use client";

import { useState } from "react";
import { Navbar } from "@/components/navbar";

interface BlacklistEntry {
  address: string;
  addedBy: string;
  addedAt: string;
  reason: string;
}

// TODO: Connect to RPC — fetch blacklist entries from on-chain PDAs
const PLACEHOLDER_ENTRIES: BlacklistEntry[] = [
  {
    address: "Hk7Rn3T9vPq...cM2w",
    addedBy: "7xKXk8Lp9TZ...m9Fp",
    addedAt: "2026-02-22",
    reason: "OFAC sanctioned address",
  },
  {
    address: "5uGpY1eWz8K...jL4n",
    addedBy: "7xKXk8Lp9TZ...m9Fp",
    addedAt: "2026-02-23",
    reason: "Suspicious activity flagged by compliance",
  },
];

export default function BlacklistPage() {
  const [checkAddress, setCheckAddress] = useState("");
  const [checkResult, setCheckResult] = useState<"idle" | "clean" | "blacklisted">("idle");
  const [addAddress, setAddAddress] = useState("");
  const [addReason, setAddReason] = useState("");
  const [removeAddress, setRemoveAddress] = useState("");
  const [entries] = useState<BlacklistEntry[]>(PLACEHOLDER_ENTRIES);

  const handleCheck = () => {
    // TODO: Connect to RPC — derive blacklist PDA and check if it exists
    const isBlacklisted = entries.some((e) => e.address === checkAddress);
    setCheckResult(isBlacklisted ? "blacklisted" : "clean");
  };

  const handleAdd = () => {
    // TODO: Connect to RPC — build and send add_to_blacklist instruction via Anchor
    console.log("Add to blacklist", { address: addAddress, reason: addReason });
  };

  const handleRemove = () => {
    // TODO: Connect to RPC — build and send remove_from_blacklist instruction via Anchor
    console.log("Remove from blacklist", { address: removeAddress });
  };

  return (
    <div>
      <Navbar title="Blacklist Management" />
      <div className="p-6 space-y-6">
        {/* SSS-2 notice */}
        <div className="flex items-center gap-3 rounded-xl border border-accent/30 bg-accent/5 p-4">
          <svg className="h-5 w-5 text-accent shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z" />
          </svg>
          <div>
            <p className="text-sm font-medium text-foreground">
              SSS-2 Feature
            </p>
            <p className="text-xs text-muted-foreground">
              Blacklist management is available for SSS-2 (Compliant) presets with
              the transfer hook program enabled.
            </p>
          </div>
        </div>

        {/* Check address */}
        <div className="rounded-xl border border-border bg-card p-6">
          <h3 className="text-base font-semibold text-foreground">
            Check Address
          </h3>
          <p className="mb-4 text-sm text-muted-foreground">
            Verify whether an address is blacklisted.
          </p>
          <div className="flex gap-3">
            <input
              type="text"
              value={checkAddress}
              onChange={(e) => {
                setCheckAddress(e.target.value);
                setCheckResult("idle");
              }}
              placeholder="Enter address to check..."
              className="flex-1 rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
            <button
              onClick={handleCheck}
              className="rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent/80"
            >
              Check
            </button>
          </div>
          {checkResult !== "idle" && (
            <div
              className={`mt-3 flex items-center gap-2 rounded-lg p-3 ${
                checkResult === "clean"
                  ? "bg-success/10 text-success"
                  : "bg-destructive/10 text-destructive"
              }`}
            >
              <div
                className={`h-2 w-2 rounded-full ${
                  checkResult === "clean" ? "bg-success" : "bg-destructive"
                }`}
              />
              <p className="text-sm font-medium">
                {checkResult === "clean"
                  ? "Address is not blacklisted"
                  : "Address is blacklisted"}
              </p>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Add to blacklist */}
          <div className="rounded-xl border border-border bg-card p-6">
            <h3 className="text-base font-semibold text-foreground">
              Add to Blacklist
            </h3>
            <p className="mb-4 text-sm text-muted-foreground">
              Block an address from transferring tokens.
            </p>
            <div className="space-y-3">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-muted-foreground">
                  Address
                </label>
                <input
                  type="text"
                  value={addAddress}
                  onChange={(e) => setAddAddress(e.target.value)}
                  placeholder="Enter address to blacklist..."
                  className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-muted-foreground">
                  Reason
                </label>
                <input
                  type="text"
                  value={addReason}
                  onChange={(e) => setAddReason(e.target.value)}
                  placeholder="e.g. OFAC sanctioned entity"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                  maxLength={128}
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  {addReason.length}/128 characters
                </p>
              </div>
              <button
                onClick={handleAdd}
                className="rounded-lg bg-destructive px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-destructive/80"
              >
                Add to Blacklist
              </button>
            </div>
          </div>

          {/* Remove from blacklist */}
          <div className="rounded-xl border border-border bg-card p-6">
            <h3 className="text-base font-semibold text-foreground">
              Remove from Blacklist
            </h3>
            <p className="mb-4 text-sm text-muted-foreground">
              Restore an address's ability to transfer tokens.
            </p>
            <div className="space-y-3">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-muted-foreground">
                  Address
                </label>
                <input
                  type="text"
                  value={removeAddress}
                  onChange={(e) => setRemoveAddress(e.target.value)}
                  placeholder="Enter address to remove..."
                  className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                />
              </div>
              <button
                onClick={handleRemove}
                className="rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent/80"
              >
                Remove from Blacklist
              </button>
            </div>
          </div>
        </div>

        {/* Blacklist entries table */}
        <div className="rounded-xl border border-border bg-card">
          <div className="border-b border-border px-6 py-4">
            <h3 className="text-base font-semibold text-foreground">
              Blacklisted Addresses
            </h3>
            <p className="text-sm text-muted-foreground">
              {entries.length} address{entries.length !== 1 ? "es" : ""} currently
              blacklisted
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Address
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Reason
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Added By
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Date
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {entries.map((entry, idx) => (
                  <tr key={idx} className="hover:bg-muted/30 transition-colors">
                    <td className="whitespace-nowrap px-6 py-4">
                      <code className="text-sm font-mono text-foreground">
                        {entry.address}
                      </code>
                    </td>
                    <td className="px-6 py-4 text-sm text-muted-foreground">
                      {entry.reason}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4">
                      <code className="text-sm font-mono text-muted-foreground">
                        {entry.addedBy}
                      </code>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-muted-foreground">
                      {entry.addedAt}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
