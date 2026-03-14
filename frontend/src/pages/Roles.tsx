import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { Shield, CheckCircle2, XCircle, User } from "lucide-react";
import { motion } from "framer-motion";
import toast from "react-hot-toast";
import { useStablecoin } from "../hooks/useStablecoin";
import { getRoleAddress, ROLE_NAMES, shortenAddress } from "../utils/pda";
import { parseError } from "../utils/errors";

interface Props { mintAddress: string }

const ALL_ROLES = [0, 1, 2, 3, 4, 5];

export default function Roles({ mintAddress }: Props) {
  const wallet = useWallet();
  const { state, configPDA, program, refetch } = useStablecoin(mintAddress);
  const [checkAddr, setCheckAddr] = useState("");
  const [roleResults, setRoleResults] = useState<Record<number, boolean>>({});
  const [assignRole, setAssignRole] = useState(0);
  const [assignAddr, setAssignAddr] = useState("");
  const [revokeRole, setRevokeRole] = useState(0);
  const [revokeAddr, setRevokeAddr] = useState("");
  const [busy, setBusy] = useState("");

  if (!mintAddress || !state) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <Shield className="w-12 h-12 text-slate-600 mb-4" />
        <h3 className="text-lg font-medium text-slate-400 mb-2">No Mint Selected</h3>
        <p className="text-sm text-slate-500">Select a mint address to manage roles.</p>
      </div>
    );
  }

  const handleCheck = async () => {
    if (!program || !configPDA) return;
    try {
      setBusy("check");
      const addr = new PublicKey(checkAddr);
      const results: Record<number, boolean> = {};
      for (const role of ALL_ROLES) {
        try {
          const [pda] = getRoleAddress(configPDA, role, addr);
          const acct = await (program.account as any).roleAssignment.fetch(pda);
          results[role] = acct.active;
        } catch {
          results[role] = false;
        }
      }
      setRoleResults(results);
    } catch { toast.error("Failed to check roles"); }
    finally { setBusy(""); }
  };

  const handleAssign = async () => {
    if (!wallet.publicKey || !program || !configPDA) return;
    try {
      setBusy("assign");
      const addr = new PublicKey(assignAddr);
      const [roleAssignment] = getRoleAddress(configPDA, assignRole, addr);

      await (program.methods as any)
        .grantRole(assignRole, addr)
        .accounts({
          authority: wallet.publicKey,
          config: configPDA,
          roleAssignment,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      toast.success(`${ROLE_NAMES[assignRole]} role granted`);
      setAssignAddr("");
      refetch();
    } catch (err: any) { toast.error(parseError(err)); }
    finally { setBusy(""); }
  };

  const handleRevoke = async () => {
    if (!wallet.publicKey || !program || !configPDA) return;
    try {
      setBusy("revoke");
      const addr = new PublicKey(revokeAddr);
      const [roleAssignment] = getRoleAddress(configPDA, revokeRole, addr);

      await (program.methods as any)
        .revokeRole(revokeRole, addr)
        .accounts({
          authority: wallet.publicKey,
          config: configPDA,
          roleAssignment,
        })
        .rpc();

      toast.success(`${ROLE_NAMES[revokeRole]} role revoked`);
      setRevokeAddr("");
      refetch();
    } catch (err: any) { toast.error(parseError(err)); }
    finally { setBusy(""); }
  };

  const RoleSelect = ({ value, onChange }: { value: number; onChange: (v: number) => void }) => (
    <select
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="glass-input w-full"
    >
      {ALL_ROLES.map((r) => <option key={r} value={r}>{ROLE_NAMES[r]}</option>)}
    </select>
  );

  return (
    <div>
      <h1 className="page-title">Role Management</h1>
      <p className="text-sm text-slate-400 mb-6">Roles: Admin (0), Minter (1), Pauser (2), Freezer (3), Blacklister (4), Seizer (5)</p>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Check */}
        <motion.div
          className="glass-card"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0 }}
        >
          <h2 className="section-title">
            <User className="w-5 h-5" />
            Check Roles
          </h2>
          <div className="flex gap-2 mb-3">
            <input
              value={checkAddr}
              onChange={(e) => setCheckAddr(e.target.value.trim())}
              placeholder="Wallet address"
              className="glass-input flex-1 font-mono"
            />
            <button
              onClick={() => wallet.publicKey && setCheckAddr(wallet.publicKey.toBase58())}
              className="text-xs text-brand-400 hover:text-brand-300 px-2 whitespace-nowrap"
            >
              My Wallet
            </button>
          </div>
          <button
            onClick={handleCheck}
            disabled={busy === "check" || !checkAddr}
            className="btn-primary w-full mb-3"
          >
            {busy === "check" ? "Checking..." : "Check"}
          </button>
          {Object.keys(roleResults).length > 0 && (
            <div className="flex flex-wrap gap-2">
              {ALL_ROLES.map((r) => (
                <span
                  key={r}
                  className={roleResults[r] ? "badge-success" : "badge-neutral"}
                >
                  {ROLE_NAMES[r]}
                </span>
              ))}
            </div>
          )}
        </motion.div>

        {/* Assign */}
        <motion.div
          className="glass-card"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <h2 className="section-title">
            <CheckCircle2 className="w-5 h-5" />
            Assign Role
          </h2>
          <div className="space-y-3">
            <RoleSelect value={assignRole} onChange={setAssignRole} />
            <div className="flex gap-2">
              <input
                value={assignAddr}
                onChange={(e) => setAssignAddr(e.target.value.trim())}
                placeholder="Holder address"
                className="glass-input flex-1 font-mono"
              />
              <button
                onClick={() => wallet.publicKey && setAssignAddr(wallet.publicKey.toBase58())}
                className="text-xs text-brand-400 hover:text-brand-300 px-2 whitespace-nowrap"
              >
                My Wallet
              </button>
            </div>
            <button
              onClick={handleAssign}
              disabled={busy === "assign" || !assignAddr}
              className="btn-primary w-full"
            >
              {busy === "assign" ? "Assigning..." : "Grant Role"}
            </button>
          </div>
          <p className="text-xs text-slate-500 mt-2">Authority only</p>
        </motion.div>

        {/* Revoke */}
        <motion.div
          className="glass-card"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <h2 className="section-title">
            <XCircle className="w-5 h-5" />
            Revoke Role
          </h2>
          <div className="space-y-3">
            <RoleSelect value={revokeRole} onChange={setRevokeRole} />
            <div className="flex gap-2">
              <input
                value={revokeAddr}
                onChange={(e) => setRevokeAddr(e.target.value.trim())}
                placeholder="Holder address"
                className="glass-input flex-1 font-mono"
              />
              <button
                onClick={() => wallet.publicKey && setRevokeAddr(wallet.publicKey.toBase58())}
                className="text-xs text-brand-400 hover:text-brand-300 px-2 whitespace-nowrap"
              >
                My Wallet
              </button>
            </div>
            <button
              onClick={handleRevoke}
              disabled={busy === "revoke" || !revokeAddr}
              className="btn-danger w-full"
            >
              {busy === "revoke" ? "Revoking..." : "Revoke Role"}
            </button>
          </div>
          <p className="text-xs text-slate-500 mt-2">Authority only. Deactivates role (doesn't close account).</p>
        </motion.div>
      </div>
    </div>
  );
}
