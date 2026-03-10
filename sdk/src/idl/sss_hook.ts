/**
 * sss-hook IDL shim.
 *
 * Exports the SssHook type from the local copy and loads the JSON IDL at
 * runtime via require so the SDK remains self-contained under sdk/src.
 *
 * To regenerate after an Anchor build, run:
 *   cp target/types/sss_hook.ts sdk/src/idl/sss_hook_types.ts
 */
export type { SssHook } from "./sss_hook_types";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const idl = require("../../../target/idl/sss_hook.json");
export default idl;
