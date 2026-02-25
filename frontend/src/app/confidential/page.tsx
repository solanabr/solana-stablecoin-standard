"use client";

import { useState } from "react";
import { Navbar } from "@/components/navbar";

function StatusBadge({
  label,
  active,
}: {
  label: string;
  active: boolean;
}) {
  return (
    <div
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ${
        active
          ? "bg-success/10 text-success"
          : "bg-muted text-muted-foreground"
      }`}
    >
      <div
        className={`h-1.5 w-1.5 rounded-full ${
          active ? "bg-success" : "bg-muted-foreground"
        }`}
      />
      {label}
    </div>
  );
}

function InfoRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-border last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span
        className={`text-sm text-foreground ${mono ? "font-mono" : ""}`}
      >
        {value}
      </span>
    </div>
  );
}

export default function ConfidentialPage() {
  const [accountAddress, setAccountAddress] = useState("");
  const [depositAmount, setDepositAmount] = useState("");
  const [transferTo, setTransferTo] = useState("");
  const [transferAmount, setTransferAmount] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");

  return (
    <div>
      <Navbar title="Confidential Transfers" />
      <div className="p-6 space-y-6">
        {/* SSS-3 Info Banner */}
        <div className="rounded-xl border border-accent/20 bg-accent/5 p-5">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent/10">
              <svg
                className="w-5 h-5 text-accent"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z"
                />
              </svg>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">
                SSS-3 Privacy Preset
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Uses Token-2022 Confidential Transfer extension to encrypt balances
                and transfer amounts on-chain. Only the account owner and designated
                auditor can decrypt values.
              </p>
            </div>
          </div>
        </div>

        {/* Coming Soon Warning */}
        <div className="rounded-xl border border-warning/20 bg-warning/5 p-4">
          <p className="text-sm text-warning font-medium">Client-side operations coming soon</p>
          <p className="text-xs text-muted-foreground mt-1">
            Confidential transfers require client-side ElGamal key derivation and zero-knowledge
            proof generation. Use the SSS CLI or SDK for direct operations.
          </p>
        </div>

        {/* Extension Status */}
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-base font-semibold text-foreground mb-4">
            Extension Status
          </h3>
          <div className="flex flex-wrap gap-3">
            <StatusBadge label="ConfidentialTransferMint" active={true} />
            <StatusBadge label="MetadataPointer" active={true} />
            <StatusBadge label="PermanentDelegate" active={true} />
            <StatusBadge label="TransferHook" active={false} />
          </div>
          <div className="mt-4">
            <InfoRow label="Preset" value="SSS-3 (Private)" />
            <InfoRow label="Auto-approve" value="Enabled" />
            <InfoRow
              label="Auditor Key"
              value="Set by issuer at mint creation"
            />
          </div>
        </div>

        {/* Configure Account */}
        <div className="rounded-xl border border-border bg-card p-6">
          <h3 className="text-base font-semibold text-foreground">
            Configure Account
          </h3>
          <p className="mb-4 text-sm text-muted-foreground">
            Initialize confidential transfer state on a token account. Required
            before deposits or transfers.
          </p>
          <div className="space-y-3">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-muted-foreground">
                Token Account
              </label>
              <input
                type="text"
                value={accountAddress}
                onChange={(e) => setAccountAddress(e.target.value)}
                placeholder="Enter token account address..."
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </div>
            <button
              disabled
              className="rounded-lg bg-muted px-4 py-2.5 text-sm font-medium text-muted-foreground cursor-not-allowed"
              title="Requires client-side ZK proof generation (coming soon)"
            >
              Configure Account
            </button>
          </div>
        </div>

        {/* Deposit & Withdraw */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="rounded-xl border border-border bg-card p-6">
            <h3 className="text-base font-semibold text-foreground">
              Deposit to Confidential
            </h3>
            <p className="mb-4 text-sm text-muted-foreground">
              Move tokens from public balance into encrypted confidential balance.
            </p>
            <div className="space-y-3">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-muted-foreground">
                  Amount
                </label>
                <input
                  type="number"
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                  placeholder="e.g. 1000000"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                />
              </div>
              <button
                disabled
                className="rounded-lg bg-muted px-4 py-2.5 text-sm font-medium text-muted-foreground cursor-not-allowed"
                title="Requires client-side ZK proof generation (coming soon)"
              >
                Deposit
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-6">
            <h3 className="text-base font-semibold text-foreground">
              Withdraw from Confidential
            </h3>
            <p className="mb-4 text-sm text-muted-foreground">
              Move tokens from encrypted confidential balance back to public balance.
            </p>
            <div className="space-y-3">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-muted-foreground">
                  Amount
                </label>
                <input
                  type="number"
                  value={withdrawAmount}
                  onChange={(e) => setWithdrawAmount(e.target.value)}
                  placeholder="e.g. 500000"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                />
              </div>
              <button
                disabled
                className="rounded-lg bg-muted px-4 py-2.5 text-sm font-medium text-muted-foreground cursor-not-allowed"
                title="Requires client-side ZK proof generation (coming soon)"
              >
                Withdraw
              </button>
            </div>
          </div>
        </div>

        {/* Confidential Transfer */}
        <div className="rounded-xl border border-border bg-card p-6">
          <h3 className="text-base font-semibold text-foreground">
            Confidential Transfer
          </h3>
          <p className="mb-4 text-sm text-muted-foreground">
            Transfer tokens privately. Amount and balances remain encrypted on-chain.
            Only sender, recipient, and auditor can decrypt.
          </p>
          <div className="space-y-3">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-muted-foreground">
                Recipient Address
              </label>
              <input
                type="text"
                value={transferTo}
                onChange={(e) => setTransferTo(e.target.value)}
                placeholder="Enter recipient wallet address..."
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-muted-foreground">
                Amount
              </label>
              <input
                type="number"
                value={transferAmount}
                onChange={(e) => setTransferAmount(e.target.value)}
                placeholder="e.g. 1000000"
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </div>
            <button
              disabled
              className="rounded-lg bg-muted px-4 py-2.5 text-sm font-medium text-muted-foreground cursor-not-allowed"
              title="Requires client-side ZK proof generation (coming soon)"
            >
              Send Confidential Transfer
            </button>
          </div>
        </div>

        {/* How It Works */}
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-base font-semibold text-foreground mb-3">
            How Confidential Transfers Work
          </h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10 text-accent text-sm font-bold">
                1
              </div>
              <p className="text-sm font-medium text-foreground">Configure</p>
              <p className="text-xs text-muted-foreground">
                Initialize ElGamal keypair and AES key on your token account for
                encryption.
              </p>
            </div>
            <div className="space-y-1.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10 text-accent text-sm font-bold">
                2
              </div>
              <p className="text-sm font-medium text-foreground">Deposit</p>
              <p className="text-xs text-muted-foreground">
                Move tokens from public balance into encrypted confidential
                balance.
              </p>
            </div>
            <div className="space-y-1.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10 text-accent text-sm font-bold">
                3
              </div>
              <p className="text-sm font-medium text-foreground">Transfer</p>
              <p className="text-xs text-muted-foreground">
                Send tokens privately. Amounts encrypted with zero-knowledge
                proofs.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
