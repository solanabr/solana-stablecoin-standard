"use client";

import { useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, Transaction } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import { Coins, Flame, AlertOctagon, Play } from "lucide-react";
import type { SSSState } from "@/hooks/useSSS";
import MetricBlock from "../MetricBlock";
import ActionButton from "../ActionButton";
import {
  explorerTxUrl,
  parseTokenAmountInput,
} from "@/components/dashboard/consoleUtils";

type ActiveForm = "mint" | "burn" | null;

function parseAmountToBn(value: string, decimals: number): BN {
  const parsed = parseTokenAmountInput(value, decimals);
  if (parsed === null) {
    throw new Error(
      `Enter a valid amount with at most ${decimals} decimal places.`
    );
  }

  return new BN(parsed.toString());
}

/** Format a BN with given decimals into a compact display string (e.g. "1.23M", "45.67K", "123.45"). All string-based, no JS number conversion. */
function formatBnShort(bn: BN, decimals: number): string {
  const raw = bn.toString();
  const padded = raw.padStart(decimals + 1, "0");
  const intPart = padded.slice(0, padded.length - decimals);
  const fracDigits = padded.slice(padded.length - decimals);

  if (intPart.length >= 7) {
    const mInt = intPart.slice(0, intPart.length - 6);
    const mFrac = intPart.slice(intPart.length - 6, intPart.length - 4);
    return `${mInt}.${mFrac}M`;
  }
  if (intPart.length >= 4) {
    const kInt = intPart.slice(0, intPart.length - 3);
    const kFrac = intPart.slice(intPart.length - 3, intPart.length - 1);
    return `${kInt}.${kFrac}K`;
  }

  const twoFrac = fracDigits.slice(0, 2).padEnd(2, "0");
  return `${intPart}.${twoFrac}`;
}

/** Format a BN with given decimals into a full display string with thousand separators (e.g. "1,234,567.89"). All string-based. */
function formatBnFull(bn: BN, decimals: number): string {
  const raw = bn.toString();
  const padded = raw.padStart(decimals + 1, "0");
  const intPart = padded.slice(0, padded.length - decimals);
  const fracPart = padded.slice(padded.length - decimals).replace(/0+$/, "");
  const withSeparators = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return fracPart ? `${withSeparators}.${fracPart}` : withSeparators;
}

export default function SupplyPillar({ sss }: { sss: SSSState }) {
  const { publicKey } = useWallet();
  const { connection } = useConnection();
  const [activeForm, setActiveForm] = useState<ActiveForm>(null);
  const [recipient, setRecipient] = useState("");
  const [mintAmount, setMintAmount] = useState("");
  const [burnAmount, setBurnAmount] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [txSig, setTxSig] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const decimals = sss.supply?.decimals ?? 6;
  const zeroBn = new BN(0);
  const symbol = sss.config?.symbol || "---";
  const isPaused = sss.config?.isPaused ?? false;

  const clearStatus = () => { setStatus(null); setTxSig(null); };

  const ensureAta = async (owner: PublicKey): Promise<PublicKey> => {
    if (!sss.client || !publicKey) throw new Error("Not connected");
    const ata = sss.client.getAssociatedTokenAddress(sss.mint, owner);
    const info = await connection.getAccountInfo(ata);
    if (!info) {
      setStatus("Creating token account...");
      const ix = sss.client.createAssociatedTokenAccountInstruction(publicKey, sss.mint, owner);
      const tx = new Transaction().add(ix);
      tx.feePayer = publicKey;
      tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
      const signed = await sss.client.provider.wallet.signTransaction(tx);
      await connection.sendRawTransaction(signed.serialize());
      await new Promise((r) => setTimeout(r, 2000));
    }
    return ata;
  };

  const handleMint = async () => {
    if (!sss.client || !mintAmount || !recipient) return;
    setLoading(true);
    setStatus("Preparing mint...");
    setTxSig(null);
    try {
      const amount = parseAmountToBn(mintAmount, decimals);
      const recipientPk = new PublicKey(recipient);
      const recipientAta = await ensureAta(recipientPk);
      setStatus("Sending mint transaction...");
      const { signature } = await sss.client.mintTokens(sss.mint, amount, recipientAta);
      setTxSig(signature);
      setStatus("Mint successful");
      await sss.refresh();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("AccountNotInitialized") || msg.includes("3012")) {
        setStatus("Error: You must be registered as a minter first. Go to Access Control → Update Minter.");
      } else {
        setStatus("Error: " + msg);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleBurn = async () => {
    if (!sss.client || !burnAmount || !publicKey) return;
    setLoading(true);
    setStatus("Sending burn transaction...");
    setTxSig(null);
    try {
      const amount = parseAmountToBn(burnAmount, decimals);
      const burnerAta = sss.client.getAssociatedTokenAddress(sss.mint, publicKey);
      const { signature } = await sss.client.burnTokens(sss.mint, amount, burnerAta);
      setTxSig(signature);
      setStatus("Burn successful");
      await sss.refresh();
    } catch (e: unknown) {
      setStatus("Error: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setLoading(false);
    }
  };

  const handlePauseToggle = async () => {
    if (!sss.client) return;
    setLoading(true);
    setStatus(isPaused ? "Unpausing..." : "Pausing...");
    setTxSig(null);
    try {
      const { signature } = isPaused
        ? await sss.client.unpause(sss.mint)
        : await sss.client.pause(sss.mint);
      setTxSig(signature);
      setStatus(isPaused ? "Program unpaused" : "Program paused");
      await sss.refresh();
    } catch (e: unknown) {
      setStatus("Error: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Status feedback */}
      {status && (
        <div
          className={`status-banner ${status.startsWith("Error") ? "error" : "success"}`}
          style={{ fontFamily: "var(--font-jetbrains-mono)" }}
        >
          <div className="flex items-center justify-between">
            <span>{status}</span>
            <button onClick={clearStatus} className="hover-trigger text-[#666] hover:text-white ml-4 text-lg leading-none">&times;</button>
          </div>
          {txSig && (
            <a
              href={explorerTxUrl(txSig)}
              target="_blank"
              rel="noreferrer"
              className="tx-link block mt-2 text-[12px]"
            >
              {txSig.slice(0, 8)}...{txSig.slice(-6)} &rarr; Explorer
            </a>
          )}
        </div>
      )}

      {/* Metrics */}
      <MetricBlock
        label={`Total Outstanding Supply (${symbol})`}
        value={formatBnShort(sss.supply?.currentSupply ?? zeroBn, decimals)}
        subtext={formatBnFull(sss.supply?.currentSupply ?? zeroBn, decimals) + " tokens"}
        highlight
        large
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <MetricBlock label="Total Minted" value={"+" + formatBnShort(sss.supply?.totalMinted ?? zeroBn, decimals)} />
        <MetricBlock label="Total Burned" value={"-" + formatBnShort(sss.supply?.totalBurned ?? zeroBn, decimals)} />
      </div>

      {/* Decorative chart */}
      <div className="dark-card !p-6 opacity-60">
        <svg width="100%" height="60" viewBox="0 0 400 60" preserveAspectRatio="none">
          <polyline
            fill="none"
            stroke="#D4FF00"
            strokeWidth="1.5"
            points="0,50 40,45 80,48 120,30 160,35 200,15 240,20 280,10 320,18 360,5 400,12"
          />
          <circle cx="400" cy="12" r="3" fill="#D4FF00" />
        </svg>
        <div
          className="text-[#D4FF00] text-[10px] uppercase tracking-widest mt-3"
          style={{ fontFamily: "var(--font-jetbrains-mono)" }}
        >
          Supply Trajectory
        </div>
      </div>

      {/* Section title */}
      <div
        className="text-[#666] text-[11px] uppercase tracking-[0.25em] pt-4"
        style={{ fontFamily: "var(--font-jetbrains-mono)" }}
      >
        Actions
      </div>

      {/* Actions */}
      <div className="space-y-3">
        <ActionButton
          icon={<Coins size={18} />}
          label="Issue Mint Order"
          desc="Mint new tokens to an address"
          onClick={() => { setActiveForm(activeForm === "mint" ? null : "mint"); clearStatus(); }}
        />

        {activeForm === "mint" && (
          <div className="dark-card space-y-4">
            <div>
              <label
                className="text-[#666] text-[11px] uppercase tracking-[0.15em] block mb-2"
                style={{ fontFamily: "var(--font-jetbrains-mono)" }}
              >
                Recipient Address
              </label>
              <input
                type="text"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                placeholder={publicKey?.toBase58() || "Wallet address..."}
                className="dark-input"
              />
            </div>
            <div>
              <label
                className="text-[#666] text-[11px] uppercase tracking-[0.15em] block mb-2"
                style={{ fontFamily: "var(--font-jetbrains-mono)" }}
              >
                Amount ({symbol})
              </label>
              <input
                type="number"
                value={mintAmount}
                onChange={(e) => setMintAmount(e.target.value)}
                placeholder="0.00"
                className="dark-input"
              />
            </div>
            <button
              onClick={handleMint}
              disabled={loading || !mintAmount || !recipient}
              className="hover-trigger w-full py-3.5 rounded-lg bg-[#D4FF00] text-[#030303] text-sm font-semibold uppercase tracking-widest disabled:opacity-30 transition-all hover:brightness-110"
              style={{ fontFamily: "var(--font-space-grotesk)" }}
            >
              {loading ? "Processing..." : "Confirm Mint"}
            </button>
          </div>
        )}

        <ActionButton
          icon={<Flame size={18} />}
          label="Execute Burn"
          desc="Burn tokens from your wallet"
          danger
          onClick={() => { setActiveForm(activeForm === "burn" ? null : "burn"); clearStatus(); }}
        />

        {activeForm === "burn" && (
          <div className="dark-card space-y-4">
            <div>
              <label
                className="text-[#666] text-[11px] uppercase tracking-[0.15em] block mb-2"
                style={{ fontFamily: "var(--font-jetbrains-mono)" }}
              >
                Burn from
              </label>
              <div
                className="text-[#666] text-[12px] p-3 border border-[#2a2a2a] rounded-lg bg-[#0A0A0A] truncate"
                style={{ fontFamily: "var(--font-jetbrains-mono)" }}
              >
                {publicKey?.toBase58() || "Not connected"}
              </div>
            </div>
            <div>
              <label
                className="text-[#666] text-[11px] uppercase tracking-[0.15em] block mb-2"
                style={{ fontFamily: "var(--font-jetbrains-mono)" }}
              >
                Amount ({symbol})
              </label>
              <input
                type="number"
                value={burnAmount}
                onChange={(e) => setBurnAmount(e.target.value)}
                placeholder="0.00"
                className="dark-input"
              />
            </div>
            <button
              onClick={handleBurn}
              disabled={loading || !burnAmount}
              className="hover-trigger w-full py-3.5 rounded-lg bg-[#FF3366] text-white text-sm font-semibold uppercase tracking-widest disabled:opacity-30 transition-all hover:brightness-110"
              style={{ fontFamily: "var(--font-space-grotesk)" }}
            >
              {loading ? "Processing..." : "Confirm Burn"}
            </button>
          </div>
        )}

        <div className="pt-3">
          <ActionButton
            icon={isPaused ? <Play size={18} /> : <AlertOctagon size={18} />}
            label={isPaused ? "Resume Operations" : "Global Pause"}
            desc={isPaused ? "Unpause the program" : "Emergency halt all operations"}
            danger={!isPaused}
            onClick={handlePauseToggle}
            disabled={loading}
          />
        </div>
      </div>
    </div>
  );
}
