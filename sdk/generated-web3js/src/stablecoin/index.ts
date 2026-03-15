import { PublicKey } from "@solana/web3.js";

export const STABLECOIN_PROGRAM_ID = new PublicKey(
  "Gbq8ZoZ4fE2J8wywFDYgSREPWL5qhtaneAX9PwQuQyCC",
);

export * from "./accounts/blacklistEntry";
export * from "./accounts/minterQuota";
export * from "./accounts/roleConfig";
export * from "./accounts/stablecoinConfig";
export * from "./instructions/addToBlacklist";
export * from "./instructions/burn";
export * from "./instructions/freezeAccount";
export * from "./instructions/initialize";
export * from "./instructions/mint";
export * from "./instructions/pause";
export * from "./instructions/removeFromBlacklist";
export * from "./instructions/seize";
export * from "./instructions/thawAccount";
export * from "./instructions/transferAuthority";
export * from "./instructions/unpause";
export * from "./instructions/updateMinter";
export * from "./instructions/updateRoles";
export * from "./types/accountFrozen";
export * from "./types/accountThawed";
export * from "./types/addressBlacklisted";
export * from "./types/addressUnblacklisted";
export * from "./types/authorityTransferred";
export * from "./types/minterUpdated";
export * from "./types/pauseChanged";
export * from "./types/rolesUpdated";
export * from "./types/stablecoinInitialized";
export * from "./types/tokensBurned";
export * from "./types/tokensMinted";
export * from "./types/tokensSeized";
