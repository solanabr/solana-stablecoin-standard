"use client";

import { useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import BrutalCard from "@/components/ui/BrutalCard";
import BrutalButton from "@/components/ui/BrutalButton";
import type { SSSState } from "@/hooks/useSSS";

export default function BlacklistTab({ sss }: { sss: SSSState }) {
  const [address, setAddress] = useState("");
  const [reason, setReason] = useState("");
  const [removeAddr, setRemoveAddr] = useState("");
  const [seizeAddr, setSeizeAddr] = useState("");
  const [seizeAmount, setSeizeAmount] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [txSig, setTxSig] = useState<string | null>(null);

  const handleBlacklistAdd = async () => {
    if (!sss.client || !address) return;
    setStatus("Adding to blacklist...");
    setTxSig(null);
    try {
      const addrPk = new PublicKey(address);
      const targetAta = sss.client.getAssociatedTokenAddress(sss.mint, addrPk);
      const { signature } = await sss.client.blacklistAdd(
        sss.mint,
        addrPk,
        targetAta,
        { reason: reason || "Compliance action" }
      );
      setTxSig(signature);
      setStatus("Address blacklisted!");
      setAddress("");
      setReason("");
    } catch (e: any) {
      setStatus("Error: " + (e.message || String(e)));
    }
  };

  const handleBlacklistRemove = async () => {
    if (!sss.client || !removeAddr) return;
    setStatus("Removing from blacklist...");
    setTxSig(null);
    try {
      const addrPk = new PublicKey(removeAddr);
      const targetAta = sss.client.getAssociatedTokenAddress(sss.mint, addrPk);
      const { signature } = await sss.client.blacklistRemove(
        sss.mint,
        addrPk,
        targetAta
      );
      setTxSig(signature);
      setStatus("Address removed from blacklist!");
      setRemoveAddr("");
    } catch (e: any) {
      setStatus("Error: " + (e.message || String(e)));
    }
  };

  const handleSeize = async () => {
    if (!sss.client || !seizeAddr || !seizeAmount) return;
    setStatus("Seizing tokens...");
    setTxSig(null);
    try {
      const decimals = sss.supply?.decimals ?? 6;
      const amount = new BN(parseFloat(seizeAmount) * Math.pow(10, decimals));
      const targetPk = new PublicKey(seizeAddr);
      const fromAta = sss.client.getAssociatedTokenAddress(sss.mint, targetPk);
      const toAta = sss.client.getAssociatedTokenAddress(
        sss.mint,
        sss.client.provider.wallet.publicKey
      );
      const { signature } = await sss.client.seize(
        sss.mint,
        targetPk,
        fromAta,
        toAta,
        amount
      );
      setTxSig(signature);
      setStatus("Tokens seized!");
      setSeizeAddr("");
      setSeizeAmount("");
      await sss.refresh();
    } catch (e: any) {
      setStatus("Error: " + (e.message || String(e)));
    }
  };

  return (
    <div className="space-y-12">
      <div className="border-b-[3px] border-[#0A0A0A] pb-6">
        <h2 className="font-display text-5xl md:text-7xl font-bold uppercase tracking-tighter mb-4 leading-none">
          Blacklist
        </h2>
        <p className="font-mono text-lg border-l-4 border-[#FF3E00] pl-4">
          Manage address restrictions and asset seizure (SSS-2).
        </p>
      </div>

      {status && (
        <div className={`font-mono text-sm border-2 p-4 ${status.startsWith("Error") ? "border-[#FF3E00] text-[#FF3E00]" : "border-[#0A0A0A]"}`}>
          {status}
          {txSig && (
            <a href={`https://explorer.solana.com/tx/${txSig}?cluster=devnet`} target="_blank" rel="noreferrer" className="block mt-2 underline text-[#0044FF]">
              View on Explorer
            </a>
          )}
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-8">
        <BrutalCard title="Add to Blacklist">
          <div className="space-y-6">
            <div>
              <label className="font-mono text-xs uppercase tracking-widest block mb-2">Address</label>
              <input type="text" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Wallet address..." className="w-full border-2 border-[#0A0A0A] bg-white p-3 font-mono text-sm focus:outline-none focus:border-[#FF3E00]" />
            </div>
            <div>
              <label className="font-mono text-xs uppercase tracking-widest block mb-2">Reason</label>
              <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Compliance action" className="w-full border-2 border-[#0A0A0A] bg-white p-3 font-mono text-sm focus:outline-none focus:border-[#FF3E00]" />
            </div>
            <BrutalButton onClick={handleBlacklistAdd} variant="danger" className="w-full text-center">
              Blacklist Address
            </BrutalButton>
          </div>
        </BrutalCard>

        <BrutalCard title="Remove from Blacklist">
          <div className="space-y-6">
            <div>
              <label className="font-mono text-xs uppercase tracking-widest block mb-2">Address</label>
              <input type="text" value={removeAddr} onChange={(e) => setRemoveAddr(e.target.value)} placeholder="Wallet address..." className="w-full border-2 border-[#0A0A0A] bg-white p-3 font-mono text-sm focus:outline-none focus:border-[#FF3E00]" />
            </div>
            <BrutalButton onClick={handleBlacklistRemove} variant="secondary" className="w-full text-center">
              Remove from Blacklist
            </BrutalButton>
          </div>
        </BrutalCard>
      </div>

      <BrutalCard title="Seize Tokens">
        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <label className="font-mono text-xs uppercase tracking-widest block mb-2">Blacklisted Address</label>
            <input type="text" value={seizeAddr} onChange={(e) => setSeizeAddr(e.target.value)} placeholder="Blacklisted wallet..." className="w-full border-2 border-[#0A0A0A] bg-white p-3 font-mono text-sm focus:outline-none focus:border-[#FF3E00]" />
          </div>
          <div>
            <label className="font-mono text-xs uppercase tracking-widest block mb-2">Amount to Seize</label>
            <input type="number" value={seizeAmount} onChange={(e) => setSeizeAmount(e.target.value)} placeholder="0.00" className="w-full border-2 border-[#0A0A0A] bg-white p-3 font-mono text-sm focus:outline-none focus:border-[#FF3E00]" />
          </div>
        </div>
        <BrutalButton onClick={handleSeize} variant="danger" className="w-full text-center mt-6">
          Seize Tokens from Blacklisted Address
        </BrutalButton>
      </BrutalCard>
    </div>
  );
}
