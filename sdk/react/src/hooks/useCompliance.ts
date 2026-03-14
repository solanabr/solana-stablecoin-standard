import { useCallback, useMemo } from "react";
import type { PublicKey } from "@solana/web3.js";
import { useSSSContext } from "../provider";

export interface UseComplianceResult {
  addToBlacklist: (address: PublicKey, reason: string) => Promise<string>;
  removeFromBlacklist: (address: PublicKey) => Promise<string>;
  isBlacklisted: (address: PublicKey) => Promise<boolean>;
  addToAllowlist: (address: PublicKey) => Promise<string>;
  removeFromAllowlist: (address: PublicKey) => Promise<string>;
  isAllowlisted: (address: PublicKey) => Promise<boolean>;
}

export function useCompliance(): UseComplianceResult {
  const { stablecoin } = useSSSContext();

  const getCompliance = useCallback(() => {
    if (!stablecoin) {
      throw new Error("Stablecoin instance not loaded");
    }
    return stablecoin.compliance;
  }, [stablecoin]);

  return useMemo(
    () => ({
      addToBlacklist: (address: PublicKey, reason: string) =>
        getCompliance().addToBlacklist(address, reason),
      removeFromBlacklist: (address: PublicKey) =>
        getCompliance().removeFromBlacklist(address),
      isBlacklisted: (address: PublicKey) =>
        getCompliance().isBlacklisted(address),
      addToAllowlist: (address: PublicKey) =>
        getCompliance().allowlistAdd(address),
      removeFromAllowlist: (address: PublicKey) =>
        getCompliance().allowlistRemove(address),
      isAllowlisted: (address: PublicKey) =>
        getCompliance().isAllowlisted(address),
    }),
    [getCompliance],
  );
}
