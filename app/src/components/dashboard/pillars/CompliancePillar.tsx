"use client";

import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import {
  ShieldCheck,
  ShieldOff,
  Snowflake,
  Sun,
  UserX,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import type { SSSState } from "@/hooks/useSSS";
import ActionButton from "../ActionButton";

type ActiveForm = "blacklistAdd" | "blacklistRemove" | "freeze" | "thaw" | "seize" | null;

export default function CompliancePillar({ sss }: { sss: SSSState }) {
  const { publicKey } = useWallet();
  const [activeForm, setActiveForm] = useState<ActiveForm>(null);
  const [address, setAddress] = useState("");
  const [reason, setReason] = useState("");
  const [freezeAddr, setFreezeAddr] = useState("");
  const [thawAddr, setThawAddr] = useState("");
  const [removeAddr, setRemoveAddr] = useState("");
  const [seizeAddr, setSeizeAddr] = useState("");
  const [seizeAmount, setSeizeAmount] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [txSig, setTxSig] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const decimals = sss.supply?.decimals ?? 6;

  const hookEnabled = sss.config?.enableTransferHook ?? false;
  const delegateEnabled = sss.config?.enablePermanentDelegate ?? false;
  const defaultFrozen = sss.config?.defaultAccountFrozen ?? false;

  const toggleForm = (form: ActiveForm) => {
    setActiveForm(activeForm === form ? null : form);
    clearStatus();
  };

  const clearStatus = () => { setStatus(null); setTxSig(null); };

  const handleBlacklistAdd = async () => {
    if (!sss.client || !address) return;
    setLoading(true);
    setStatus("Adding to blacklist...");
    setTxSig(null);
    try {
      const addrPk = new PublicKey(address);
      const targetAta = sss.client.getAssociatedTokenAddress(sss.mint, addrPk);
      const { signature } = await sss.client.blacklistAdd(sss.mint, addrPk, targetAta, {
        reason: reason || "Compliance action",
      });
      setTxSig(signature);
      setStatus("Address blacklisted");
      setAddress("");
      setReason("");
    } catch (e: unknown) {
      setStatus("Error: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setLoading(false);
    }
  };

  const handleBlacklistRemove = async () => {
    if (!sss.client || !removeAddr) return;
    setLoading(true);
    setStatus("Removing from blacklist...");
    setTxSig(null);
    try {
      const addrPk = new PublicKey(removeAddr);
      const targetAta = sss.client.getAssociatedTokenAddress(sss.mint, addrPk);
      const { signature } = await sss.client.blacklistRemove(sss.mint, addrPk, targetAta);
      setTxSig(signature);
      setStatus("Address removed from blacklist");
      setRemoveAddr("");
    } catch (e: unknown) {
      setStatus("Error: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setLoading(false);
    }
  };

  const handleFreeze = async () => {
    if (!sss.client || !freezeAddr) return;
    setLoading(true);
    setStatus("Freezing account...");
    setTxSig(null);
    try {
      const ownerPk = new PublicKey(freezeAddr);
      const targetAta = sss.client.getAssociatedTokenAddress(sss.mint, ownerPk);
      const { signature } = await sss.client.freezeAccount(sss.mint, targetAta);
      setTxSig(signature);
      setStatus("Account frozen");
    } catch (e: unknown) {
      setStatus("Error: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setLoading(false);
    }
  };

  const handleThaw = async () => {
    if (!sss.client || !thawAddr) return;
    setLoading(true);
    setStatus("Thawing account...");
    setTxSig(null);
    try {
      const ownerPk = new PublicKey(thawAddr);
      const targetAta = sss.client.getAssociatedTokenAddress(sss.mint, ownerPk);
      const { signature } = await sss.client.thawAccount(sss.mint, targetAta);
      setTxSig(signature);
      setStatus("Account thawed");
    } catch (e: unknown) {
      setStatus("Error: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setLoading(false);
    }
  };

  const handleSeize = async () => {
    if (!sss.client || !seizeAddr || !seizeAmount || !publicKey) return;
    setLoading(true);
    setStatus("Seizing tokens...");
    setTxSig(null);
    try {
      const amount = new BN(parseFloat(seizeAmount) * Math.pow(10, decimals));
      const targetPk = new PublicKey(seizeAddr);
      const fromAta = sss.client.getAssociatedTokenAddress(sss.mint, targetPk);
      const toAta = sss.client.getAssociatedTokenAddress(sss.mint, sss.client.provider.wallet.publicKey);
      const { signature } = await sss.client.seize(sss.mint, targetPk, fromAta, toAta, amount);
      setTxSig(signature);
      setStatus("Tokens seized");
      setSeizeAddr("");
      setSeizeAmount("");
      await sss.refresh();
    } catch (e: unknown) {
      setStatus("Error: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setLoading(false);
    }
  };

  const FeatureCard = ({ label, active }: { label: string; active: boolean }) => (
    <div className="dark-card flex items-center justify-between">
      <span
        className="text-[#999] text-[11px] uppercase tracking-wider"
        style={{ fontFamily: "var(--font-jetbrains-mono)" }}
      >
        {label}
      </span>
      <div className="flex items-center gap-2">
        {active ? (
          <CheckCircle2 size={16} className="text-[#D4FF00]" />
        ) : (
          <XCircle size={16} className="text-[#333]" />
        )}
        <span
          className={`text-xs font-bold ${active ? "text-[#D4FF00]" : "text-[#333]"}`}
          style={{ fontFamily: "var(--font-jetbrains-mono)" }}
        >
          {active ? "ON" : "OFF"}
        </span>
      </div>
    </div>
  );

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
              href={`https://explorer.solana.com/tx/${txSig}?cluster=devnet`}
              target="_blank"
              rel="noreferrer"
              className="tx-link block mt-2 text-[12px]"
            >
              {txSig.slice(0, 8)}...{txSig.slice(-6)} &rarr; Explorer
            </a>
          )}
        </div>
      )}

      {/* Feature flags */}
      <div>
        <div
          className="text-[#666] text-[11px] uppercase tracking-[0.25em] mb-4"
          style={{ fontFamily: "var(--font-jetbrains-mono)" }}
        >
          Feature Flags
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <FeatureCard label="Transfer Hooks" active={hookEnabled} />
          <FeatureCard label="Perm. Delegate" active={delegateEnabled} />
          <FeatureCard label="Default Frozen" active={defaultFrozen} />
        </div>
      </div>

      {/* Section: Blacklist */}
      <div
        className="text-[#666] text-[11px] uppercase tracking-[0.25em] pt-2"
        style={{ fontFamily: "var(--font-jetbrains-mono)" }}
      >
        Blacklist Management
      </div>

      <div className="space-y-3">
        <ActionButton
          icon={<ShieldCheck size={18} />}
          label="Add to Blacklist"
          desc="Restrict an address from transfers"
          danger
          onClick={() => toggleForm("blacklistAdd")}
        />

        {activeForm === "blacklistAdd" && (
          <div className="dark-card space-y-4">
            <div>
              <label className="text-[#666] text-[11px] uppercase tracking-[0.15em] block mb-2" style={{ fontFamily: "var(--font-jetbrains-mono)" }}>
                Address
              </label>
              <input type="text" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Wallet address..." className="dark-input" />
            </div>
            <div>
              <label className="text-[#666] text-[11px] uppercase tracking-[0.15em] block mb-2" style={{ fontFamily: "var(--font-jetbrains-mono)" }}>
                Reason
              </label>
              <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Compliance action" className="dark-input" />
            </div>
            <button onClick={handleBlacklistAdd} disabled={loading || !address} className="hover-trigger w-full py-3.5 rounded-lg bg-[#FF3366] text-white text-sm font-semibold uppercase tracking-widest disabled:opacity-30" style={{ fontFamily: "var(--font-space-grotesk)" }}>
              {loading ? "Processing..." : "Confirm Blacklist"}
            </button>
          </div>
        )}

        <ActionButton
          icon={<ShieldOff size={18} />}
          label="Remove from Blacklist"
          desc="Restore transfer privileges"
          onClick={() => toggleForm("blacklistRemove")}
        />

        {activeForm === "blacklistRemove" && (
          <div className="dark-card space-y-4">
            <div>
              <label className="text-[#666] text-[11px] uppercase tracking-[0.15em] block mb-2" style={{ fontFamily: "var(--font-jetbrains-mono)" }}>
                Address
              </label>
              <input type="text" value={removeAddr} onChange={(e) => setRemoveAddr(e.target.value)} placeholder="Wallet address..." className="dark-input" />
            </div>
            <button onClick={handleBlacklistRemove} disabled={loading || !removeAddr} className="hover-trigger w-full py-3.5 rounded-lg bg-[#D4FF00] text-[#030303] text-sm font-semibold uppercase tracking-widest disabled:opacity-30" style={{ fontFamily: "var(--font-space-grotesk)" }}>
              {loading ? "Processing..." : "Remove from Blacklist"}
            </button>
          </div>
        )}
      </div>

      {/* Section: Freeze */}
      <div
        className="text-[#666] text-[11px] uppercase tracking-[0.25em] pt-2"
        style={{ fontFamily: "var(--font-jetbrains-mono)" }}
      >
        Account Controls
      </div>

      <div className="space-y-3">
        <ActionButton icon={<Snowflake size={18} />} label="Freeze Account" desc="Freeze individual token account" danger onClick={() => toggleForm("freeze")} />

        {activeForm === "freeze" && (
          <div className="dark-card space-y-4">
            <div>
              <label className="text-[#666] text-[11px] uppercase tracking-[0.15em] block mb-2" style={{ fontFamily: "var(--font-jetbrains-mono)" }}>Account Owner Address</label>
              <input type="text" value={freezeAddr} onChange={(e) => setFreezeAddr(e.target.value)} placeholder="Wallet address..." className="dark-input" />
            </div>
            <button onClick={handleFreeze} disabled={loading || !freezeAddr} className="hover-trigger w-full py-3.5 rounded-lg bg-[#FF3366] text-white text-sm font-semibold uppercase tracking-widest disabled:opacity-30" style={{ fontFamily: "var(--font-space-grotesk)" }}>
              {loading ? "Processing..." : "Freeze Account"}
            </button>
          </div>
        )}

        <ActionButton icon={<Sun size={18} />} label="Thaw Account" desc="Unfreeze individual token account" onClick={() => toggleForm("thaw")} />

        {activeForm === "thaw" && (
          <div className="dark-card space-y-4">
            <div>
              <label className="text-[#666] text-[11px] uppercase tracking-[0.15em] block mb-2" style={{ fontFamily: "var(--font-jetbrains-mono)" }}>Account Owner Address</label>
              <input type="text" value={thawAddr} onChange={(e) => setThawAddr(e.target.value)} placeholder="Wallet address..." className="dark-input" />
            </div>
            <button onClick={handleThaw} disabled={loading || !thawAddr} className="hover-trigger w-full py-3.5 rounded-lg bg-[#D4FF00] text-[#030303] text-sm font-semibold uppercase tracking-widest disabled:opacity-30" style={{ fontFamily: "var(--font-space-grotesk)" }}>
              {loading ? "Processing..." : "Thaw Account"}
            </button>
          </div>
        )}

        <ActionButton icon={<UserX size={18} />} label="Seize Tokens" desc="Seize from blacklisted address" danger onClick={() => toggleForm("seize")} />

        {activeForm === "seize" && (
          <div className="dark-card space-y-4">
            <div>
              <label className="text-[#666] text-[11px] uppercase tracking-[0.15em] block mb-2" style={{ fontFamily: "var(--font-jetbrains-mono)" }}>Blacklisted Address</label>
              <input type="text" value={seizeAddr} onChange={(e) => setSeizeAddr(e.target.value)} placeholder="Blacklisted wallet..." className="dark-input" />
            </div>
            <div>
              <label className="text-[#666] text-[11px] uppercase tracking-[0.15em] block mb-2" style={{ fontFamily: "var(--font-jetbrains-mono)" }}>Amount</label>
              <input type="number" value={seizeAmount} onChange={(e) => setSeizeAmount(e.target.value)} placeholder="0.00" className="dark-input" />
            </div>
            <button onClick={handleSeize} disabled={loading || !seizeAddr || !seizeAmount} className="hover-trigger w-full py-3.5 rounded-lg bg-[#FF3366] text-white text-sm font-semibold uppercase tracking-widest disabled:opacity-30" style={{ fontFamily: "var(--font-space-grotesk)" }}>
              {loading ? "Processing..." : "Seize Tokens"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
