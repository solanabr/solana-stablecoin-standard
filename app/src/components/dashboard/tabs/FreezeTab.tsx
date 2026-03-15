"use client";

import { useState } from "react";
import { PublicKey } from "@solana/web3.js";
import BrutalCard from "@/components/ui/BrutalCard";
import BrutalButton from "@/components/ui/BrutalButton";
import type { SSSState } from "@/hooks/useSSS";
import { explorerTxUrl } from "@/components/dashboard/consoleUtils";

export default function FreezeTab({ sss }: { sss: SSSState }) {
  const [freezeAddr, setFreezeAddr] = useState("");
  const [thawAddr, setThawAddr] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [txSig, setTxSig] = useState<string | null>(null);

  const handleFreeze = async () => {
    if (!sss.client || !freezeAddr) return;
    setStatus("Freezing account...");
    setTxSig(null);
    try {
      const ownerPk = new PublicKey(freezeAddr);
      const targetAta = sss.client.getAssociatedTokenAddress(sss.mint, ownerPk);
      const { signature } = await sss.client.freezeAccount(sss.mint, targetAta);
      setTxSig(signature);
      setStatus("Account frozen!");
    } catch (e: any) {
      setStatus("Error: " + (e.message || String(e)));
    }
  };

  const handleThaw = async () => {
    if (!sss.client || !thawAddr) return;
    setStatus("Thawing account...");
    setTxSig(null);
    try {
      const ownerPk = new PublicKey(thawAddr);
      const targetAta = sss.client.getAssociatedTokenAddress(sss.mint, ownerPk);
      const { signature } = await sss.client.thawAccount(sss.mint, targetAta);
      setTxSig(signature);
      setStatus("Account thawed!");
    } catch (e: any) {
      setStatus("Error: " + (e.message || String(e)));
    }
  };

  const handlePause = async () => {
    if (!sss.client) return;
    setStatus("Pausing program...");
    setTxSig(null);
    try {
      const { signature } = await sss.client.pause(sss.mint);
      setTxSig(signature);
      setStatus("Program paused!");
      await sss.refresh();
    } catch (e: any) {
      setStatus("Error: " + (e.message || String(e)));
    }
  };

  const handleUnpause = async () => {
    if (!sss.client) return;
    setStatus("Unpausing program...");
    setTxSig(null);
    try {
      const { signature } = await sss.client.unpause(sss.mint);
      setTxSig(signature);
      setStatus("Program unpaused!");
      await sss.refresh();
    } catch (e: any) {
      setStatus("Error: " + (e.message || String(e)));
    }
  };

  const isPaused = sss.config?.isPaused ?? false;

  return (
    <div className="space-y-12">
      <div className="border-b-[3px] border-[#0A0A0A] pb-6">
        <h2 className="font-display text-5xl md:text-7xl font-bold uppercase tracking-tighter mb-4 leading-none">
          Freeze / Thaw
        </h2>
        <p className="font-mono text-lg border-l-4 border-[#FF3E00] pl-4">
          Account-level freeze/thaw and global pause controls.
        </p>
      </div>

      {status && (
        <div className={`font-mono text-sm border-2 p-4 ${status.startsWith("Error") ? "border-[#FF3E00] text-[#FF3E00]" : "border-[#0A0A0A]"}`}>
          {status}
          {txSig && (
            <a href={explorerTxUrl(txSig)} target="_blank" rel="noreferrer" className="block mt-2 underline text-[#0044FF]">View on Explorer</a>
          )}
        </div>
      )}

      {/* Global Pause */}
      <BrutalCard title="Global Pause Control">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-mono text-sm uppercase mb-2">Current State</div>
            <div className={`font-display text-3xl font-bold uppercase ${isPaused ? "text-[#FF3E00]" : "text-[#0044FF]"}`}>
              {isPaused ? "PAUSED" : "ACTIVE"}
            </div>
          </div>
          {isPaused ? (
            <BrutalButton onClick={handleUnpause} variant="secondary" className="px-8 py-4">
              Unpause Program
            </BrutalButton>
          ) : (
            <BrutalButton onClick={handlePause} variant="danger" className="px-8 py-4">
              Pause Program
            </BrutalButton>
          )}
        </div>
      </BrutalCard>

      <div className="grid md:grid-cols-2 gap-8">
        <BrutalCard title="Freeze Account">
          <div className="space-y-6">
            <div>
              <label className="font-mono text-xs uppercase tracking-widest block mb-2">Token Account Owner</label>
              <input type="text" value={freezeAddr} onChange={(e) => setFreezeAddr(e.target.value)} placeholder="Wallet address..." className="w-full border-2 border-[#0A0A0A] bg-white p-3 font-mono text-sm focus:outline-none focus:border-[#FF3E00]" />
            </div>
            <BrutalButton onClick={handleFreeze} variant="danger" className="w-full text-center">
              Freeze Account
            </BrutalButton>
          </div>
        </BrutalCard>

        <BrutalCard title="Thaw Account">
          <div className="space-y-6">
            <div>
              <label className="font-mono text-xs uppercase tracking-widest block mb-2">Token Account Owner</label>
              <input type="text" value={thawAddr} onChange={(e) => setThawAddr(e.target.value)} placeholder="Wallet address..." className="w-full border-2 border-[#0A0A0A] bg-white p-3 font-mono text-sm focus:outline-none focus:border-[#FF3E00]" />
            </div>
            <BrutalButton onClick={handleThaw} variant="secondary" className="w-full text-center">
              Thaw Account
            </BrutalButton>
          </div>
        </BrutalCard>
      </div>
    </div>
  );
}
