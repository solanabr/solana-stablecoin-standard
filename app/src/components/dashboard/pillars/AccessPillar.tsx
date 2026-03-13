"use client";

import { useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import { UserCog, UserPlus } from "lucide-react";
import type { SSSState } from "@/hooks/useSSS";
import ActionButton from "../ActionButton";
import { explorerTxUrl } from "@/components/dashboard/consoleUtils";

const DEFAULT_PK = "11111111111111111111111111111111";

function shortAddr(pk: PublicKey | null | undefined): string {
  if (!pk) return "(not set)";
  const s = pk.toBase58();
  if (s === DEFAULT_PK) return "(not set)";
  return s.slice(0, 6) + "..." + s.slice(-4);
}

type ActiveForm = "updateRole" | "updateMinter" | null;

export default function AccessPillar({ sss }: { sss: SSSState }) {
  const [activeForm, setActiveForm] = useState<ActiveForm>(null);
  const [roleType, setRoleType] = useState<"pauser" | "blacklister" | "seizer">("pauser");
  const [roleAddr, setRoleAddr] = useState("");
  const [minterWallet, setMinterWallet] = useState("");
  const [minterQuota, setMinterQuota] = useState("");
  const [minterActive, setMinterActive] = useState(true);
  const [status, setStatus] = useState<string | null>(null);
  const [txSig, setTxSig] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const decimals = sss.supply?.decimals ?? 6;
  const pow = Math.pow(10, decimals);

  const toggleForm = (form: ActiveForm) => {
    setActiveForm(activeForm === form ? null : form);
    clearStatus();
  };

  const clearStatus = () => { setStatus(null); setTxSig(null); };

  const handleUpdateRoles = async () => {
    if (!sss.client || !roleAddr) return;
    setLoading(true);
    setStatus("Updating role...");
    setTxSig(null);
    try {
      const roleEnum: Record<string, object> = {};
      roleEnum[roleType] = {};
      const { signature } = await sss.client.updateRoles(sss.mint, {
        role: roleEnum,
        newHolder: new PublicKey(roleAddr),
      });
      setTxSig(signature);
      setStatus(`${roleType} role updated`);
      setRoleAddr("");
      await sss.refresh();
    } catch (e: unknown) {
      setStatus("Error: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateMinter = async () => {
    if (!sss.client || !minterWallet || !minterQuota) return;
    setLoading(true);
    setStatus("Updating minter...");
    setTxSig(null);
    try {
      const minterPk = new PublicKey(minterWallet);
      const { signature } = await sss.client.updateMinter(sss.mint, minterPk, {
        isActive: minterActive,
        mintQuota: new BN(parseFloat(minterQuota) * pow),
      });
      setTxSig(signature);
      setStatus("Minter updated");
      setMinterWallet("");
      setMinterQuota("");
      await sss.refresh();
    } catch (e: unknown) {
      setStatus("Error: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setLoading(false);
    }
  };

  const roles = [
    { label: "Master Authority", value: shortAddr(sss.roles?.masterAuthority), color: "#D4FF00" },
    { label: "Pauser", value: shortAddr(sss.roles?.pauser), color: "#4488FF" },
    { label: "Blacklister", value: shortAddr(sss.roles?.blacklister), color: "#FF3366" },
    { label: "Seizer", value: shortAddr(sss.roles?.seizer), color: "#FF9933" },
  ];

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

      {/* Current Roles */}
      <div>
        <div
          className="text-[#666] text-[11px] uppercase tracking-[0.25em] mb-4"
          style={{ fontFamily: "var(--font-jetbrains-mono)" }}
        >
          Current Roles
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {roles.map((role) => (
            <div key={role.label} className="dark-card">
              <div
                className="text-[11px] uppercase tracking-wider mb-2"
                style={{ fontFamily: "var(--font-jetbrains-mono)", color: role.color }}
              >
                {role.label}
              </div>
              <div
                className={`text-[13px] ${role.value === "(not set)" ? "text-[#333]" : "text-white"}`}
                style={{ fontFamily: "var(--font-jetbrains-mono)" }}
              >
                {role.value}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Section: Role management */}
      <div
        className="text-[#666] text-[11px] uppercase tracking-[0.25em] pt-2"
        style={{ fontFamily: "var(--font-jetbrains-mono)" }}
      >
        Role Management
      </div>

      <div className="space-y-3">
        <ActionButton
          icon={<UserCog size={18} />}
          label="Update Role"
          desc="Assign a new wallet to a role"
          onClick={() => toggleForm("updateRole")}
        />

        {activeForm === "updateRole" && (
          <div className="dark-card space-y-4">
            <div>
              <label className="text-[#666] text-[11px] uppercase tracking-[0.15em] block mb-2" style={{ fontFamily: "var(--font-jetbrains-mono)" }}>
                Role
              </label>
              <select
                value={roleType}
                onChange={(e) => setRoleType(e.target.value as typeof roleType)}
                className="dark-input"
              >
                <option value="pauser">Pauser</option>
                <option value="blacklister">Blacklister</option>
                <option value="seizer">Seizer</option>
              </select>
            </div>
            <div>
              <label className="text-[#666] text-[11px] uppercase tracking-[0.15em] block mb-2" style={{ fontFamily: "var(--font-jetbrains-mono)" }}>
                New Holder Address
              </label>
              <input type="text" value={roleAddr} onChange={(e) => setRoleAddr(e.target.value)} placeholder="Wallet address..." className="dark-input" />
            </div>
            <button onClick={handleUpdateRoles} disabled={loading || !roleAddr} className="hover-trigger w-full py-3.5 rounded-lg bg-[#D4FF00] text-[#030303] text-sm font-semibold uppercase tracking-widest disabled:opacity-30" style={{ fontFamily: "var(--font-space-grotesk)" }}>
              {loading ? "Processing..." : "Update Role"}
            </button>
          </div>
        )}

        <ActionButton
          icon={<UserPlus size={18} />}
          label="Add / Update Minter"
          desc="Configure minter wallet and quota"
          onClick={() => toggleForm("updateMinter")}
        />

        {activeForm === "updateMinter" && (
          <div className="dark-card space-y-4">
            <div>
              <label className="text-[#666] text-[11px] uppercase tracking-[0.15em] block mb-2" style={{ fontFamily: "var(--font-jetbrains-mono)" }}>
                Minter Wallet
              </label>
              <input type="text" value={minterWallet} onChange={(e) => setMinterWallet(e.target.value)} placeholder="Wallet address..." className="dark-input" />
            </div>
            <div>
              <label className="text-[#666] text-[11px] uppercase tracking-[0.15em] block mb-2" style={{ fontFamily: "var(--font-jetbrains-mono)" }}>
                Mint Quota
              </label>
              <input type="number" value={minterQuota} onChange={(e) => setMinterQuota(e.target.value)} placeholder="1000000" className="dark-input" />
            </div>
            <label className="flex items-center gap-3 py-1" style={{ fontFamily: "var(--font-jetbrains-mono)" }}>
              <input type="checkbox" checked={minterActive} onChange={(e) => setMinterActive(e.target.checked)} className="w-4 h-4 accent-[#D4FF00] rounded" />
              <span className="text-[#999] text-[12px]">Active</span>
            </label>
            <button onClick={handleUpdateMinter} disabled={loading || !minterWallet || !minterQuota} className="hover-trigger w-full py-3.5 rounded-lg bg-[#D4FF00] text-[#030303] text-sm font-semibold uppercase tracking-widest disabled:opacity-30" style={{ fontFamily: "var(--font-space-grotesk)" }}>
              {loading ? "Processing..." : "Update Minter"}
            </button>
          </div>
        )}
      </div>

      {/* Active Minters */}
      {sss.minters.length > 0 && (
        <div>
          <div
            className="text-[#666] text-[11px] uppercase tracking-[0.25em] mb-4 pt-2"
            style={{ fontFamily: "var(--font-jetbrains-mono)" }}
          >
            Active Minters ({sss.minters.length})
          </div>
          <div className="space-y-2">
            {sss.minters.map((m, i) => {
              const addr = m.account.minter.toBase58();
              return (
                <div key={i} className="dark-card flex items-center justify-between">
                  <div>
                    <div
                      className="text-white text-[13px] mb-1"
                      style={{ fontFamily: "var(--font-jetbrains-mono)" }}
                    >
                      {addr.slice(0, 6)}...{addr.slice(-4)}
                    </div>
                    <div
                      className={`text-[10px] font-bold uppercase ${m.account.isActive ? "text-[#D4FF00]" : "text-[#333]"}`}
                      style={{ fontFamily: "var(--font-jetbrains-mono)" }}
                    >
                      {m.account.isActive ? "Active" : "Inactive"}
                    </div>
                  </div>
                  <div className="text-right">
                    <div
                      className="text-white text-[13px]"
                      style={{ fontFamily: "var(--font-jetbrains-mono)" }}
                    >
                      {(m.account.mintQuota.toNumber() / pow).toLocaleString()}
                    </div>
                    <div
                      className="text-[#555] text-[10px]"
                      style={{ fontFamily: "var(--font-jetbrains-mono)" }}
                    >
                      Minted: {(m.account.totalMinted.toNumber() / pow).toLocaleString()}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
