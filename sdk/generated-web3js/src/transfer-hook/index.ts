import { PublicKey } from "@solana/web3.js";

export const TRANSFERHOOK_PROGRAM_ID = new PublicKey(
  "6QNzPyTwg2MH778GL8idYiU3teFJiuQx6R5L7xdU17KC",
);

export * from "./instructions/initializeExtraAccountMetaList";
export * from "./instructions/transferHook";
