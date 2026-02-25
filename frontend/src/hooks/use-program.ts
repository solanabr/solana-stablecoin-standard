"use client";

import { useMemo } from "react";
import { useConnection, useAnchorWallet } from "@solana/wallet-adapter-react";
import { AnchorProvider, Program } from "@coral-xyz/anchor";
import { SSS_CORE_PROGRAM_ID } from "@/lib/constants";

// Import IDL JSON directly
import SssCoreIdl from "../idl/sss_core.json";

export function useCoreProgram() {
  const { connection } = useConnection();
  const wallet = useAnchorWallet();

  return useMemo(() => {
    if (!wallet) return null;

    const provider = new AnchorProvider(connection, wallet, {
      commitment: "confirmed",
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return new Program(SssCoreIdl as any, provider);
  }, [connection, wallet]);
}

export function useProgramId() {
  return SSS_CORE_PROGRAM_ID;
}
