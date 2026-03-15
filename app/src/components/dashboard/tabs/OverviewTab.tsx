"use client";

import { useState, useEffect } from "react";
import { useConnection } from "@solana/wallet-adapter-react";
import { ConfirmedSignatureInfo } from "@solana/web3.js";
import BrutalCard from "@/components/ui/BrutalCard";
import BrutalButton from "@/components/ui/BrutalButton";
import type { SSSState } from "@/hooks/useSSS";
import { explorerTxUrl } from "@/components/dashboard/consoleUtils";

export default function OverviewTab({ sss }: { sss: SSSState }) {
  const { connection } = useConnection();
  const [signatures, setSignatures] = useState<ConfirmedSignatureInfo[]>([]);

  useEffect(() => {
    if (!sss.client) return;
    const [configPda] = sss.client.getConfigPda(sss.mint);
    connection
      .getSignaturesForAddress(configPda, { limit: 10 })
      .then(setSignatures)
      .catch(() => {});
  }, [sss.client, sss.mint, connection]);

  const decimals = sss.supply?.decimals ?? 6;
  const pow = Math.pow(10, decimals);
  const currentSupply = sss.supply
    ? sss.supply.currentSupply.toNumber() / pow
    : 0;
  const totalMinted = sss.supply ? sss.supply.totalMinted.toNumber() / pow : 0;
  const totalBurned = sss.supply ? sss.supply.totalBurned.toNumber() / pow : 0;
  const symbol = sss.config?.symbol || "---";

  const fmt = (n: number) =>
    n >= 1_000_000
      ? (n / 1_000_000).toFixed(2) + "M"
      : n >= 1_000
        ? (n / 1_000).toFixed(2) + "K"
        : n.toFixed(2);

  return (
    <div className="space-y-12">
      <div className="flex justify-between items-end border-b-[3px] border-[#0A0A0A] pb-6">
        <div>
          <h2 className="font-display text-5xl md:text-7xl font-bold uppercase tracking-tighter mb-4 leading-none">
            Overview
          </h2>
          <p className="font-mono text-lg border-l-4 border-[#FF3E00] pl-4">
            Managing token lifecycle for {sss.config?.name || "..."}.
          </p>
        </div>
        <BrutalButton
          variant="secondary"
          className="text-sm px-4 py-2"
          onClick={() => sss.refresh()}
        >
          Refresh
        </BrutalButton>
      </div>

      {sss.loading && (
        <div className="font-mono text-sm uppercase animate-pulse">
          Loading devnet data...
        </div>
      )}
      {sss.error && (
        <div className="font-mono text-sm text-[#FF3E00] border-2 border-[#FF3E00] p-4">
          {sss.error}
        </div>
      )}

      <div className="grid md:grid-cols-12 gap-8">
        {/* Giant Supply Card */}
        <BrutalCard
          className="md:col-span-8 !bg-[#0044FF] !text-[#EBE9E1] !border-[#0A0A0A]"
          headerAction={
            <span className="font-mono text-xs bg-[#FF3E00] px-2 py-1 text-[#EBE9E1]">
              LIVE
            </span>
          }
        >
          <div className="font-mono text-sm uppercase mb-4 opacity-80">
            Total Outstanding Supply
          </div>
          <div className="font-display text-[clamp(3rem,6vw,6rem)] font-bold leading-none tracking-tighter mb-8 break-all">
            {fmt(currentSupply)}
            <span className="text-3xl text-[#EBE9E1]/50"> {symbol}</span>
          </div>
          <div className="flex gap-4 border-t-2 border-[#EBE9E1]/20 pt-6">
            <div>
              <div className="font-mono text-xs opacity-80 uppercase">
                Minted
              </div>
              <div className="font-mono font-bold text-xl">
                +{fmt(totalMinted)}
              </div>
            </div>
            <div className="w-[2px] bg-[#EBE9E1]/20" />
            <div>
              <div className="font-mono text-xs opacity-80 uppercase">
                Burned
              </div>
              <div className="font-mono font-bold text-xl text-[#FF3E00]">
                -{fmt(totalBurned)}
              </div>
            </div>
          </div>
        </BrutalCard>

        {/* State Flags */}
        <div className="md:col-span-4 flex flex-col gap-8">
          <BrutalCard title="State Flags" className="flex-1">
            <ul className="font-mono text-sm space-y-4 font-bold">
              <li className="flex justify-between border-b-2 border-[#0A0A0A]/10 pb-2">
                <span>Perm. Delegate</span>
                <span
                  className={
                    sss.config?.enablePermanentDelegate
                      ? "text-[#0044FF]"
                      : "text-gray-400"
                  }
                >
                  {sss.config?.enablePermanentDelegate ? "ACTIVE" : "OFF"}
                </span>
              </li>
              <li className="flex justify-between border-b-2 border-[#0A0A0A]/10 pb-2">
                <span>Transfer Hook</span>
                <span
                  className={
                    sss.config?.enableTransferHook
                      ? "text-[#0044FF]"
                      : "text-gray-400"
                  }
                >
                  {sss.config?.enableTransferHook ? "ACTIVE" : "OFF"}
                </span>
              </li>
              <li className="flex justify-between border-b-2 border-[#0A0A0A]/10 pb-2">
                <span>Global Pause</span>
                <span
                  className={
                    sss.config?.isPaused ? "text-[#FF3E00]" : "text-gray-400"
                  }
                >
                  {sss.config?.isPaused ? "PAUSED" : "FALSE"}
                </span>
              </li>
            </ul>
          </BrutalCard>
        </div>

        {/* Recent Activity */}
        <BrutalCard title="Recent Activity" className="md:col-span-12">
          <div className="overflow-x-auto -m-6">
            <table className="w-full font-mono text-sm text-left whitespace-nowrap">
              <thead className="bg-[#0A0A0A] text-[#EBE9E1] uppercase">
                <tr>
                  <th className="p-4 border-r-2 border-[#EBE9E1]/20">
                    Signature
                  </th>
                  <th className="p-4 border-r-2 border-[#EBE9E1]/20">Slot</th>
                  <th className="p-4">Time</th>
                </tr>
              </thead>
              <tbody>
                {signatures.length === 0 && (
                  <tr>
                    <td colSpan={3} className="p-4 text-center opacity-50">
                      No transactions found
                    </td>
                  </tr>
                )}
                {signatures.map((sig, i) => (
                  <tr
                    key={i}
                    className="border-b-[3px] border-[#0A0A0A] hover:bg-[#FF3E00] hover:text-[#EBE9E1] group cursor-pointer"
                    onClick={() =>
                      window.open(
                        explorerTxUrl(sig.signature),
                        "_blank"
                      )
                    }
                  >
                    <td className="p-4 border-r-[3px] border-[#0A0A0A] underline decoration-2">
                      {sig.signature.slice(0, 8)}...{sig.signature.slice(-4)}
                    </td>
                    <td className="p-4 border-r-[3px] border-[#0A0A0A]">
                      {sig.slot}
                    </td>
                    <td className="p-4">
                      {sig.blockTime
                        ? new Date(sig.blockTime * 1000).toLocaleString()
                        : "--"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </BrutalCard>
      </div>
    </div>
  );
}
