import { useCallback, useMemo } from "react";
import type { PublicKey } from "@solana/web3.js";
import type { BN } from "@coral-xyz/anchor";
import { useSSSContext } from "../provider";

export interface UseRolesResult {
  grantRole: (role: number, holder: PublicKey) => Promise<string>;
  revokeRole: (role: number, holder: PublicKey) => Promise<string>;
  hasRole: (role: number, holder: PublicKey) => Promise<boolean>;
  setQuota: (minter: PublicKey, quotaLimit: BN) => Promise<string>;
}

export function useRoles(): UseRolesResult {
  const { stablecoin } = useSSSContext();

  const getRoles = useCallback(() => {
    if (!stablecoin) {
      throw new Error("Stablecoin instance not loaded");
    }
    return stablecoin.roles;
  }, [stablecoin]);

  return useMemo(
    () => ({
      grantRole: (role: number, holder: PublicKey) =>
        getRoles().grantRole(role, holder),
      revokeRole: (role: number, holder: PublicKey) =>
        getRoles().revokeRole(role, holder),
      hasRole: (role: number, holder: PublicKey) =>
        getRoles().hasRole(role, holder),
      setQuota: (minter: PublicKey, quotaLimit: BN) =>
        getRoles().setQuota(minter, quotaLimit),
    }),
    [getRoles],
  );
}
