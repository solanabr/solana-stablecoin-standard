"use client";

import { useState, useCallback } from "react";
import { PublicKey } from "@solana/web3.js";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { Navbar } from "@/components/navbar";
import { MintSelector } from "@/components/mint-selector";
import { SSS_HOOK_PROGRAM_ID } from "@/lib/constants";

function deriveBlacklistPda(
  mint: PublicKey,
  address: PublicKey,
): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("blacklist"), mint.toBuffer(), address.toBuffer()],
    SSS_HOOK_PROGRAM_ID,
  )[0];
}

function isValidPubkey(value: string): boolean {
  try {
    new PublicKey(value);
    return true;
  } catch {
    return false;
  }
}

export default function BlacklistPage() {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const [activeMint, setActiveMint] = useState<string | null>(null);

  const [checkAddress, setCheckAddress] = useState("");
  const [checkResult, setCheckResult] = useState<
    "idle" | "clean" | "blacklisted" | "loading" | "error"
  >("idle");
  const [checkError, setCheckError] = useState<string | null>(null);

  const [addAddress, setAddAddress] = useState("");
  const [addReason, setAddReason] = useState("");
  const [removeAddress, setRemoveAddress] = useState("");

  const handleCheck = useCallback(async () => {
    if (!activeMint || !checkAddress) return;
    if (!isValidPubkey(checkAddress) || !isValidPubkey(activeMint)) {
      setCheckError("Invalid address format");
      setCheckResult("error");
      return;
    }

    setCheckResult("loading");
    setCheckError(null);

    try {
      const mintPubkey = new PublicKey(activeMint);
      const addressPubkey = new PublicKey(checkAddress);
      const blacklistPda = deriveBlacklistPda(mintPubkey, addressPubkey);

      const accountInfo = await connection.getAccountInfo(blacklistPda);
      setCheckResult(accountInfo !== null ? "blacklisted" : "clean");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Check failed";
      setCheckError(message);
      setCheckResult("error");
    }
  }, [activeMint, checkAddress, connection]);

  return (
    <div>
      <Navbar title="Blacklist Management" />
      <div className="p-6 space-y-6">
        <MintSelector onSelect={setActiveMint} currentMint={activeMint} />

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

        {!activeMint && (
          <div className="rounded-xl border border-border bg-card p-8 text-center">
            <p className="text-sm text-muted-foreground">
              Select a mint address above to check blacklist status.
            </p>
          </div>
        )}

        {!publicKey && (
          <div className="rounded-xl border border-warning/20 bg-warning/5 p-5 text-center">
            <p className="text-sm text-warning">
              Connect your wallet to manage blacklist entries.
            </p>
          </div>
        )}

        {/* Check address */}
        <div className="rounded-xl border border-border bg-card p-6">
          <h3 className="text-base font-semibold text-foreground">
            Check Address
          </h3>
          <p className="mb-4 text-sm text-muted-foreground">
            Verify whether an address is blacklisted by checking the on-chain PDA.
          </p>
          <div className="flex gap-3">
            <input
              type="text"
              value={checkAddress}
              onChange={(e) => {
                setCheckAddress(e.target.value);
                setCheckResult("idle");
                setCheckError(null);
              }}
              placeholder="Enter address to check..."
              className="flex-1 rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
            <button
              onClick={handleCheck}
              disabled={!activeMint || !checkAddress}
              className={`rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent/80 ${!activeMint || !checkAddress ? "opacity-50 cursor-not-allowed" : ""}`}
            >
              Check
            </button>
          </div>
          {checkResult === "loading" && (
            <div className="mt-3 flex items-center gap-2 rounded-lg bg-muted p-3">
              <svg className="h-4 w-4 animate-spin text-muted-foreground" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <span className="text-sm text-muted-foreground">Checking on-chain...</span>
            </div>
          )}
          {checkResult === "error" && (
            <div className="mt-3 rounded-lg bg-destructive/10 p-3">
              <p className="text-sm font-medium text-destructive">
                {checkError ?? "Failed to check address"}
              </p>
            </div>
          )}
          {(checkResult === "clean" || checkResult === "blacklisted") && (
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
                disabled
                className="rounded-lg bg-muted px-4 py-2.5 text-sm font-medium text-muted-foreground cursor-not-allowed"
                title="Requires transfer hook program IDL (coming soon)"
              >
                Add to Blacklist (Coming Soon)
              </button>
              <p className="text-xs text-muted-foreground">
                Blacklist add/remove requires the transfer hook program. Use the SSS CLI or SDK for direct operations.
              </p>
            </div>
          </div>

          {/* Remove from blacklist */}
          <div className="rounded-xl border border-border bg-card p-6">
            <h3 className="text-base font-semibold text-foreground">
              Remove from Blacklist
            </h3>
            <p className="mb-4 text-sm text-muted-foreground">
              Restore an address&apos;s ability to transfer tokens.
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
                disabled
                className="rounded-lg bg-muted px-4 py-2.5 text-sm font-medium text-muted-foreground cursor-not-allowed"
                title="Requires transfer hook program IDL (coming soon)"
              >
                Remove from Blacklist (Coming Soon)
              </button>
              <p className="text-xs text-muted-foreground">
                Blacklist add/remove requires the transfer hook program. Use the SSS CLI or SDK for direct operations.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
