import { Connection, PublicKey, Commitment } from "@solana/web3.js";
import { AnchorProvider, Program, BorshCoder } from "@coral-xyz/anchor";
import { dispatch } from "./webhook";

const RPC_WS = process.env.RPC_WS_URL ?? "ws://localhost:8900";
const RPC_HTTP = process.env.RPC_URL ?? "http://localhost:8899";
const SSS_PROGRAM_ID = new PublicKey(
  process.env.SSS_PROGRAM_ID ?? "AeCfxEUv75EWAGgjnhAZhViFbkfsP1imLsg4xb3xuntm"
);

let idl: unknown;
try {
  idl = require("../../sdk/core/src/idl/sss_token.json");
} catch {
  console.warn("IDL not found — event decoding disabled");
}

export async function startListener(): Promise<void> {
  const connection = new Connection(RPC_HTTP, {
    commitment: "confirmed" as Commitment,
    wsEndpoint: RPC_WS,
  });

  console.log(`Subscribing to SSS program: ${SSS_PROGRAM_ID.toBase58()}`);

  connection.onLogs(SSS_PROGRAM_ID, (logs, ctx) => {
    if (!idl) return;

    const coder = new BorshCoder(idl as ConstructorParameters<typeof BorshCoder>[0]);

    for (const log of logs.logs) {
      if (log.startsWith("Program data:")) {
        const base64 = log.slice("Program data:".length).trim();
        try {
          const event = coder.events.decode(base64);
          if (event) {
            console.log(
              `[event] ${event.name}`,
              JSON.stringify(event.data, null, 2)
            );
            dispatch(event).catch(console.error);
          }
        } catch {
          // Not an event we recognize
        }
      }
    }
  });
}
