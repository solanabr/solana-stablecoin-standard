"use client";

import { useMemo } from "react";
import { useConnection, useAnchorWallet } from "@solana/wallet-adapter-react";
import { AnchorProvider, Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";

// Import IDL JSON directly
import SssCoreIdl from "../idl/sss_core.json";

const SSS_CORE_PROGRAM_ID = new PublicKey(
  "Corep3pXJzUGaqpw2xzWQi4q63cn1STABiCDMJhMECB",
);

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
