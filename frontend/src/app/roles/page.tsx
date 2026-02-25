"use client";

import { useState, useCallback } from "react";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { useWallet } from "@solana/wallet-adapter-react";
import { Navbar } from "@/components/navbar";
import { MintSelector } from "@/components/mint-selector";
import { TxFeedback } from "@/components/tx-feedback";
import { useCoreProgram } from "@/hooks/use-program";
import { useTransaction } from "@/hooks/use-transaction";
import { deriveConfigPda, deriveRolePda } from "@/lib/pda";
import { isValidPubkey } from "@/lib/validation";

type Role = "Admin" | "Minter" | "Freezer" | "Pauser";

const ROLE_MAP: Record<Role, number> = {
  Admin: 0,
  Minter: 1,
  Freezer: 2,
  Pauser: 3,
};

const ROLE_COLORS: Record<Role, string> = {
  Admin: "bg-accent/10 text-accent",
  Minter: "bg-success/10 text-success",
  Freezer: "bg-warning/10 text-warning",
  Pauser: "bg-destructive/10 text-destructive",
};

export default function RolesPage() {
  const { publicKey } = useWallet();
  const program = useCoreProgram();
  const { loading, error, signature, execute, reset } = useTransaction();

  const [activeMint, setActiveMint] = useState<string | null>(null);
  const [grantAddress, setGrantAddress] = useState("");
  const [grantRole, setGrantRole] = useState<Role>("Minter");
  const [revokeAddress, setRevokeAddress] = useState("");
  const [revokeRole, setRevokeRole] = useState<Role>("Minter");

  const canOperate = !!publicKey && !!program && !!activeMint;

  const handleGrant = useCallback(async () => {
    if (!canOperate) return;
    if (!grantAddress || !isValidPubkey(grantAddress)) return;
    reset();

    const mintPubkey = new PublicKey(activeMint!);
    const [configPda] = deriveConfigPda(mintPubkey);
    const [adminRolePda] = deriveRolePda(configPda, publicKey!, ROLE_MAP.Admin);
    const granteePubkey = new PublicKey(grantAddress);
    const roleValue = ROLE_MAP[grantRole];
    const [roleAccountPda] = deriveRolePda(configPda, granteePubkey, roleValue);

    const tx = await program!.methods
      .grantRole(roleValue)
      .accountsPartial({
        admin: publicKey!,
        config: configPda,
        adminRole: adminRolePda,
        grantee: granteePubkey,
        roleAccount: roleAccountPda,
        systemProgram: SystemProgram.programId,
      })
      .transaction();

    const sig = await execute(tx);
    if (sig) {
      setGrantAddress("");
    }
  }, [canOperate, grantAddress, grantRole, activeMint, publicKey, program, execute, reset]);

  const handleRevoke = useCallback(async () => {
    if (!canOperate) return;
    if (!revokeAddress || !isValidPubkey(revokeAddress)) return;
    reset();

    const mintPubkey = new PublicKey(activeMint!);
    const [configPda] = deriveConfigPda(mintPubkey);
    const [adminRolePda] = deriveRolePda(configPda, publicKey!, ROLE_MAP.Admin);
    const revokePubkey = new PublicKey(revokeAddress);
    const roleValue = ROLE_MAP[revokeRole];
    const [roleAccountPda] = deriveRolePda(configPda, revokePubkey, roleValue);

    const tx = await program!.methods
      .revokeRole()
      .accountsPartial({
        admin: publicKey!,
        config: configPda,
        adminRole: adminRolePda,
        roleAccount: roleAccountPda,
      })
      .transaction();

    const sig = await execute(tx);
    if (sig) {
      setRevokeAddress("");
    }
  }, [canOperate, revokeAddress, revokeRole, activeMint, publicKey, program, execute, reset]);

  return (
    <div>
      <Navbar title="Role Management" />
      <div className="p-6 space-y-6">
        <MintSelector onSelect={setActiveMint} currentMint={activeMint} />

        {!activeMint && (
          <div className="rounded-xl border border-border bg-card p-8 text-center">
            <p className="text-sm text-muted-foreground">
              Connect wallet and select a mint to view and manage roles.
            </p>
          </div>
        )}

        {!publicKey && (
          <div className="rounded-xl border border-warning/20 bg-warning/5 p-5 text-center">
            <p className="text-sm text-warning">
              Connect your wallet to manage roles.
            </p>
          </div>
        )}

        <TxFeedback loading={loading} error={error} signature={signature} />

        {/* Grant role form */}
        <div className="rounded-xl border border-border bg-card p-6">
          <h3 className="text-base font-semibold text-foreground">
            Grant Role
          </h3>
          <p className="mb-4 text-sm text-muted-foreground">
            Assign a role to an address. Only the admin can grant roles.
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-sm font-medium text-muted-foreground">
                Address
              </label>
              <input
                type="text"
                value={grantAddress}
                onChange={(e) => setGrantAddress(e.target.value)}
                placeholder="Enter Solana wallet address..."
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-muted-foreground">
                Role
              </label>
              <select
                value={grantRole}
                onChange={(e) => setGrantRole(e.target.value as Role)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              >
                <option value="Admin">Admin</option>
                <option value="Minter">Minter</option>
                <option value="Freezer">Freezer</option>
                <option value="Pauser">Pauser</option>
              </select>
            </div>
          </div>
          <button
            onClick={handleGrant}
            disabled={!canOperate}
            className={`mt-4 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent/80 ${!canOperate ? "opacity-50 cursor-not-allowed" : ""}`}
          >
            Grant Role
          </button>
        </div>

        {/* Revoke role form */}
        <div className="rounded-xl border border-border bg-card p-6">
          <h3 className="text-base font-semibold text-foreground">
            Revoke Role
          </h3>
          <p className="mb-4 text-sm text-muted-foreground">
            Remove a role from an address. The role PDA will be closed and rent returned.
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-sm font-medium text-muted-foreground">
                Address
              </label>
              <input
                type="text"
                value={revokeAddress}
                onChange={(e) => setRevokeAddress(e.target.value)}
                placeholder="Enter address to revoke role from..."
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-muted-foreground">
                Role
              </label>
              <select
                value={revokeRole}
                onChange={(e) => setRevokeRole(e.target.value as Role)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              >
                <option value="Admin">Admin</option>
                <option value="Minter">Minter</option>
                <option value="Freezer">Freezer</option>
                <option value="Pauser">Pauser</option>
              </select>
            </div>
          </div>
          <button
            onClick={handleRevoke}
            disabled={!canOperate}
            className={`mt-4 rounded-lg border border-destructive/30 px-4 py-2.5 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10 ${!canOperate ? "opacity-50 cursor-not-allowed" : ""}`}
          >
            Revoke Role
          </button>
        </div>

        {/* Role descriptions */}
        <div className="rounded-xl border border-border bg-card p-6">
          <h3 className="mb-4 text-base font-semibold text-foreground">
            Role Descriptions
          </h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {[
              {
                role: "Admin" as Role,
                desc: "Full authority. Can grant/revoke roles, update config, and manage supply cap.",
              },
              {
                role: "Minter" as Role,
                desc: "Can mint new tokens up to the supply cap. Can also burn tokens.",
              },
              {
                role: "Freezer" as Role,
                desc: "Can freeze and thaw individual token accounts for compliance.",
              },
              {
                role: "Pauser" as Role,
                desc: "Can pause and unpause all stablecoin operations in emergencies.",
              },
            ].map(({ role, desc }) => (
              <div key={role} className="flex items-start gap-3 rounded-lg bg-muted/30 p-3">
                <span
                  className={`mt-0.5 inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${ROLE_COLORS[role]}`}
                >
                  {role}
                </span>
                <p className="text-sm text-muted-foreground">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
