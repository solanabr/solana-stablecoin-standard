"use client";

import { useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, Transaction } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import BrutalCard from "@/components/ui/BrutalCard";
import BrutalButton from "@/components/ui/BrutalButton";
import type { SSSState } from "@/hooks/useSSS";
import { explorerTxUrl } from "@/components/dashboard/consoleUtils";

export default function SupplyTab({ sss }: { sss: SSSState }) {
  const { publicKey } = useWallet();
  const { connection } = useConnection();
  const [mintAmount, setMintAmount] = useState("");
  const [recipient, setRecipient] = useState("");
  const [burnAmount, setBurnAmount] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [txSig, setTxSig] = useState<string | null>(null);

  const decimals = sss.supply?.decimals ?? 6;

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
    setStatus("Preparing mint...");
    setTxSig(null);
    try {
      const amount = new BN(parseFloat(mintAmount) * Math.pow(10, decimals));
      const recipientPk = new PublicKey(recipient);
      const recipientAta = await ensureAta(recipientPk);
      setStatus("Sending mint transaction...");
      const { signature } = await sss.client.mintTokens(sss.mint, amount, recipientAta);
      setTxSig(signature);
      setStatus("Mint successful!");
      await sss.refresh();
    } catch (e: any) {
      const msg = e.message || String(e);
      if (msg.includes("AccountNotInitialized") || msg.includes("3012")) {
        setStatus("Error: You must be registered as a minter first. Go to Roles tab → Update Minter.");
      } else {
        setStatus("Error: " + msg);
      }
    }
  };

  const handleBurn = async () => {
    if (!sss.client || !burnAmount || !publicKey) return;
    setStatus("Sending burn transaction...");
    setTxSig(null);
    try {
      const amount = new BN(parseFloat(burnAmount) * Math.pow(10, decimals));
      const burnerAta = sss.client.getAssociatedTokenAddress(sss.mint, publicKey);
      const { signature } = await sss.client.burnTokens(sss.mint, amount, burnerAta);
      setTxSig(signature);
      setStatus("Burn successful!");
      await sss.refresh();
    } catch (e: any) {
      setStatus("Error: " + (e.message || String(e)));
    }
  };

  const pow = Math.pow(10, decimals);
  const currentSupply = sss.supply ? sss.supply.currentSupply.toNumber() / pow : 0;

  return (
    <div className="space-y-12">
      <div className="border-b-[3px] border-[#0A0A0A] pb-6">
        <h2 className="font-display text-5xl md:text-7xl font-bold uppercase tracking-tighter mb-4 leading-none">
          Supply Ops
        </h2>
        <p className="font-mono text-lg border-l-4 border-[#FF3E00] pl-4">
          Current supply: {currentSupply.toLocaleString()} {sss.config?.symbol || ""}
        </p>
      </div>

      {status && (
        <div className={`font-mono text-sm border-2 p-4 ${status.startsWith("Error") ? "border-[#FF3E00] text-[#FF3E00]" : "border-[#0A0A0A]"}`}>
          {status}
          {txSig && (
            <a
              href={explorerTxUrl(txSig)}
              target="_blank"
              rel="noreferrer"
              className="block mt-2 underline text-[#0044FF]"
            >
              View on Explorer
            </a>
          )}
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-8">
        <BrutalCard title="Mint Tokens">
          <div className="space-y-6">
            <div>
              <label className="font-mono text-xs uppercase tracking-widest block mb-2">
                Recipient Address
              </label>
              <input
                type="text"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                placeholder={publicKey?.toBase58() || "Wallet address..."}
                className="w-full border-2 border-[#0A0A0A] bg-white p-3 font-mono text-sm focus:outline-none focus:border-[#FF3E00]"
              />
            </div>
            <div>
              <label className="font-mono text-xs uppercase tracking-widest block mb-2">
                Amount
              </label>
              <input
                type="number"
                value={mintAmount}
                onChange={(e) => setMintAmount(e.target.value)}
                placeholder="0.00"
                className="w-full border-2 border-[#0A0A0A] bg-white p-3 font-mono text-sm focus:outline-none focus:border-[#FF3E00]"
              />
            </div>
            <BrutalButton onClick={handleMint} className="w-full text-center">
              Mint Tokens
            </BrutalButton>
          </div>
        </BrutalCard>

        <BrutalCard title="Burn Tokens">
          <div className="space-y-6">
            <div>
              <label className="font-mono text-xs uppercase tracking-widest block mb-2">
                Burn from your wallet
              </label>
              <div className="font-mono text-xs border-2 border-[#0A0A0A]/20 p-3 bg-white/50 truncate">
                {publicKey?.toBase58() || "Not connected"}
              </div>
            </div>
            <div>
              <label className="font-mono text-xs uppercase tracking-widest block mb-2">
                Amount
              </label>
              <input
                type="number"
                value={burnAmount}
                onChange={(e) => setBurnAmount(e.target.value)}
                placeholder="0.00"
                className="w-full border-2 border-[#0A0A0A] bg-white p-3 font-mono text-sm focus:outline-none focus:border-[#FF3E00]"
              />
            </div>
            <BrutalButton
              onClick={handleBurn}
              variant="danger"
              className="w-full text-center"
            >
              Burn Tokens
            </BrutalButton>
          </div>
        </BrutalCard>
      </div>
    </div>
  );
}
