import { Connection } from "@solana/web3.js";
import { StablecoinClient, Presets } from "@stbr/sss-client";
import { transferHook } from "@stbr/sss-generated-web3js";
import type { Wallet } from "@stbr/sss-client";
import { env } from "@/lib/env";

export function createStablecoinClient(wallet: Wallet | null): StablecoinClient {
  const connection = new Connection(env.rpcUrl, "confirmed");
  return new StablecoinClient({
    connection,
    wallet,
    transferHookProgramId: transferHook.TRANSFERHOOK_PROGRAM_ID,
  });
}

export { Presets };
