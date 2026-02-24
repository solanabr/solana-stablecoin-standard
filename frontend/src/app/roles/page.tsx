"use client";

import { useState } from "react";
import { Navbar } from "@/components/navbar";

type Role = "Admin" | "Minter" | "Freezer" | "Pauser";

interface RoleEntry {
  address: string;
  role: Role;
  grantedBy: string;
  grantedAt: string;
}

// TODO: Connect to RPC — fetch role accounts from on-chain PDAs
const PLACEHOLDER_ROLES: RoleEntry[] = [
  {
    address: "7xKXk8Lp9TZ...m9Fp",
    role: "Admin",
    grantedBy: "7xKXk8Lp9TZ...m9Fp",
    grantedAt: "2026-02-20",
  },
  {
    address: "4vMsoZ7eH2R...bN3q",
    role: "Minter",
    grantedBy: "7xKXk8Lp9TZ...m9Fp",
    grantedAt: "2026-02-21",
  },
  {
    address: "9pRsU3fvK5Y...xW8d",
    role: "Freezer",
    grantedBy: "7xKXk8Lp9TZ...m9Fp",
    grantedAt: "2026-02-21",
  },
  {
    address: "2mQnJ4hT8Zc...kY6r",
    role: "Pauser",
    grantedBy: "7xKXk8Lp9TZ...m9Fp",
    grantedAt: "2026-02-22",
  },
];

const ROLE_COLORS: Record<Role, string> = {
  Admin: "bg-accent/10 text-accent",
  Minter: "bg-success/10 text-success",
  Freezer: "bg-warning/10 text-warning",
  Pauser: "bg-destructive/10 text-destructive",
};

export default function RolesPage() {
  const [grantAddress, setGrantAddress] = useState("");
  const [grantRole, setGrantRole] = useState<Role>("Minter");
  const [roles] = useState<RoleEntry[]>(PLACEHOLDER_ROLES);

  const handleGrant = () => {
    // TODO: Connect to RPC — build and send manage_roles (grant) instruction via Anchor
    console.log("Grant role", { address: grantAddress, role: grantRole });
  };

  const handleRevoke = (address: string, role: Role) => {
    // TODO: Connect to RPC — build and send manage_roles (revoke) instruction via Anchor
    console.log("Revoke role", { address, role });
  };

  return (
    <div>
      <Navbar title="Role Management" />
      <div className="p-6 space-y-6">
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
            className="mt-4 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent/80"
          >
            Grant Role
          </button>
        </div>

        {/* Current roles table */}
        <div className="rounded-xl border border-border bg-card">
          <div className="border-b border-border px-6 py-4">
            <h3 className="text-base font-semibold text-foreground">
              Current Roles
            </h3>
            <p className="text-sm text-muted-foreground">
              {roles.length} role{roles.length !== 1 ? "s" : ""} assigned
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Address
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Role
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Granted By
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Date
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {roles.map((entry, idx) => (
                  <tr key={idx} className="hover:bg-muted/30 transition-colors">
                    <td className="whitespace-nowrap px-6 py-4">
                      <code className="text-sm font-mono text-foreground">
                        {entry.address}
                      </code>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${ROLE_COLORS[entry.role]}`}
                      >
                        {entry.role}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4">
                      <code className="text-sm font-mono text-muted-foreground">
                        {entry.grantedBy}
                      </code>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-muted-foreground">
                      {entry.grantedAt}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-right">
                      {entry.role !== "Admin" && (
                        <button
                          onClick={() => handleRevoke(entry.address, entry.role)}
                          className="rounded-lg border border-destructive/30 px-3 py-1.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10"
                        >
                          Revoke
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
                desc: "Can mint new tokens up to the supply cap. Cannot burn or freeze.",
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
