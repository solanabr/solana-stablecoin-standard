"use client";

import { useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import { Role } from "solana-stablecoin-standard";
import BrutalCard from "@/components/ui/BrutalCard";
import BrutalButton from "@/components/ui/BrutalButton";
import type { SSSState } from "@/hooks/useSSS";

const DEFAULT_PK = "11111111111111111111111111111111";

function shortAddr(pk: PublicKey | null | undefined): string {
  if (!pk) return "(not set)";
  const s = pk.toBase58();
  if (s === DEFAULT_PK) return "(not set)";
  return s.slice(0, 6) + "..." + s.slice(-4);
}

export default function RolesTab({ sss }: { sss: SSSState }) {
  const [roleType, setRoleType] = useState<"pauser" | "blacklister" | "seizer">("pauser");
  const [roleAddr, setRoleAddr] = useState("");
  const [minterWallet, setMinterWallet] = useState("");
  const [minterQuota, setMinterQuota] = useState("");
  const [minterActive, setMinterActive] = useState(true);
  const [status, setStatus] = useState<string | null>(null);
  const [txSig, setTxSig] = useState<string | null>(null);

  const roleDisplayMap: Record<string, string> = {
    pauser: "Pauser",
    blacklister: "Blacklister",
    seizer: "Seizer",
  };

  const handleUpdateRoles = async () => {
    if (!sss.client || !roleAddr) return;
    setStatus("Updating role...");
    setTxSig(null);
    try {
      const roleEnum: Record<string, any> = {};
      roleEnum[roleType] = {};
      const { signature } = await sss.client.updateRoles(sss.mint, {
        role: roleEnum,
        newHolder: new PublicKey(roleAddr),
      });
      setTxSig(signature);
      setStatus(`${roleDisplayMap[roleType]} role updated!`);
      await sss.refresh();
    } catch (e: any) {
      setStatus("Error: " + (e.message || String(e)));
    }
  };

  const handleUpdateMinter = async () => {
    if (!sss.client || !minterWallet || !minterQuota) return;
    setStatus("Updating minter...");
    setTxSig(null);
    try {
      const decimals = sss.supply?.decimals ?? 6;
      const minterPk = new PublicKey(minterWallet);
      const { signature } = await sss.client.updateMinter(sss.mint, minterPk, {
        isActive: minterActive,
        mintQuota: new BN(parseFloat(minterQuota) * Math.pow(10, decimals)),
      });
      setTxSig(signature);
      setStatus("Minter updated!");
      await sss.refresh();
    } catch (e: any) {
      setStatus("Error: " + (e.message || String(e)));
    }
  };

  return (
    <div className="space-y-12">
      <div className="border-b-[3px] border-[#0A0A0A] pb-6">
        <h2 className="font-display text-5xl md:text-7xl font-bold uppercase tracking-tighter mb-4 leading-none">
          Roles & Access
        </h2>
        <p className="font-mono text-lg border-l-4 border-[#FF3E00] pl-4">
          Role-based access control management.
        </p>
      </div>

      {status && (
        <div className={`font-mono text-sm border-2 p-4 ${status.startsWith("Error") ? "border-[#FF3E00] text-[#FF3E00]" : "border-[#0A0A0A]"}`}>
          {status}
          {txSig && (
            <a href={`https://explorer.solana.com/tx/${txSig}?cluster=devnet`} target="_blank" rel="noreferrer" className="block mt-2 underline text-[#0044FF]">View on Explorer</a>
          )}
        </div>
      )}

      {/* Current Roles Display */}
      <BrutalCard title="Current Roles">
        <ul className="font-mono text-sm space-y-4">
          <li className="flex justify-between border-b-2 border-[#0A0A0A]/10 pb-3">
            <span className="font-bold uppercase">Master Authority</span>
            <span className="text-[#0044FF]">{shortAddr(sss.roles?.masterAuthority)}</span>
          </li>
          <li className="flex justify-between border-b-2 border-[#0A0A0A]/10 pb-3">
            <span className="font-bold uppercase">Pauser</span>
            <span>{shortAddr(sss.roles?.pauser)}</span>
          </li>
          <li className="flex justify-between border-b-2 border-[#0A0A0A]/10 pb-3">
            <span className="font-bold uppercase">Blacklister</span>
            <span>{shortAddr(sss.roles?.blacklister)}</span>
          </li>
          <li className="flex justify-between">
            <span className="font-bold uppercase">Seizer</span>
            <span>{shortAddr(sss.roles?.seizer)}</span>
          </li>
        </ul>
      </BrutalCard>

      <div className="grid md:grid-cols-2 gap-8">
        <BrutalCard title="Update Role">
          <div className="space-y-6">
            <div>
              <label className="font-mono text-xs uppercase tracking-widest block mb-2">Role</label>
              <select
                value={roleType}
                onChange={(e) => setRoleType(e.target.value as any)}
                className="w-full border-2 border-[#0A0A0A] bg-white p-3 font-mono text-sm focus:outline-none focus:border-[#FF3E00]"
              >
                <option value="pauser">Pauser</option>
                <option value="blacklister">Blacklister</option>
                <option value="seizer">Seizer</option>
              </select>
            </div>
            <div>
              <label className="font-mono text-xs uppercase tracking-widest block mb-2">Address</label>
              <input type="text" value={roleAddr} onChange={(e) => setRoleAddr(e.target.value)} placeholder="Wallet address..." className="w-full border-2 border-[#0A0A0A] bg-white p-3 font-mono text-sm focus:outline-none focus:border-[#FF3E00]" />
            </div>
            <BrutalButton onClick={handleUpdateRoles} className="w-full text-center">
              Update Role
            </BrutalButton>
          </div>
        </BrutalCard>

        <BrutalCard title="Add / Update Minter">
          <div className="space-y-6">
            <div>
              <label className="font-mono text-xs uppercase tracking-widest block mb-2">Minter Wallet</label>
              <input type="text" value={minterWallet} onChange={(e) => setMinterWallet(e.target.value)} placeholder="Wallet address..." className="w-full border-2 border-[#0A0A0A] bg-white p-3 font-mono text-sm focus:outline-none focus:border-[#FF3E00]" />
            </div>
            <div>
              <label className="font-mono text-xs uppercase tracking-widest block mb-2">Mint Quota</label>
              <input type="number" value={minterQuota} onChange={(e) => setMinterQuota(e.target.value)} placeholder="1000000" className="w-full border-2 border-[#0A0A0A] bg-white p-3 font-mono text-sm focus:outline-none focus:border-[#FF3E00]" />
            </div>
            <label className="flex items-center gap-3 font-mono text-sm cursor-pointer">
              <input type="checkbox" checked={minterActive} onChange={(e) => setMinterActive(e.target.checked)} className="w-5 h-5 accent-[#FF3E00]" />
              Active
            </label>
            <BrutalButton onClick={handleUpdateMinter} className="w-full text-center">
              Update Minter
            </BrutalButton>
          </div>
        </BrutalCard>
      </div>

      {/* Minter List */}
      {sss.minters.length > 0 && (
        <BrutalCard title="Active Minters">
          <div className="overflow-x-auto -m-6">
            <table className="w-full font-mono text-sm text-left whitespace-nowrap">
              <thead className="bg-[#0A0A0A] text-[#EBE9E1] uppercase">
                <tr>
                  <th className="p-4 border-r-2 border-[#EBE9E1]/20">Wallet</th>
                  <th className="p-4 border-r-2 border-[#EBE9E1]/20">Active</th>
                  <th className="p-4 border-r-2 border-[#EBE9E1]/20">Quota</th>
                  <th className="p-4">Minted</th>
                </tr>
              </thead>
              <tbody>
                {sss.minters.map((m, i) => {
                  const decimals = sss.supply?.decimals ?? 6;
                  const pow = Math.pow(10, decimals);
                  return (
                    <tr key={i} className="border-b-[3px] border-[#0A0A0A]">
                      <td className="p-4 border-r-[3px] border-[#0A0A0A]">
                        {m.account.minter.toBase58().slice(0, 8)}...
                      </td>
                      <td className="p-4 border-r-[3px] border-[#0A0A0A]">
                        <span className={m.account.isActive ? "text-[#0044FF]" : "text-gray-400"}>
                          {m.account.isActive ? "YES" : "NO"}
                        </span>
                      </td>
                      <td className="p-4 border-r-[3px] border-[#0A0A0A]">
                        {(m.account.mintQuota.toNumber() / pow).toLocaleString()}
                      </td>
                      <td className="p-4">
                        {(m.account.totalMinted.toNumber() / pow).toLocaleString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </BrutalCard>
      )}

      {/* fetchAllMinters indicator */}
      <div className="font-mono text-xs uppercase opacity-50">
        {sss.minters.length} minter(s) loaded via fetchAllMinters
      </div>
    </div>
  );
}
