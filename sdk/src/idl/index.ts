export type { SssCore } from "./sss_core";
export type { SssTransferHook } from "./sss_transfer_hook";

// Re-export IDL JSON for Anchor Program construction
import SssCoreIdl from "./sss_core.json";
import SssTransferHookIdl from "./sss_transfer_hook.json";

export { SssCoreIdl, SssTransferHookIdl };
