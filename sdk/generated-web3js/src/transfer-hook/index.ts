import { PublicKey } from "@solana/web3.js";

export const TRANSFERHOOK_PROGRAM_ID = new PublicKey(
  "YYTBExpcbtVYTGNmbgcAr7SzEGWfLtByYUrcfzvUz8p",
);

export * from "./accounts/hookConfig";
export * from "./instructions/initializeExtraAccountMetaList";
export * from "./instructions/initializeHookConfig";
export * from "./instructions/transferHook";
