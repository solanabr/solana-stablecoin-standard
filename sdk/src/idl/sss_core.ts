/**
 * sss-core IDL shim.
 *
 * Exports the SssCore type from the local copy and loads the JSON IDL at
 * runtime via require so the SDK remains self-contained under sdk/src.
 *
 * To regenerate after an Anchor build, run:
 *   cp target/types/sss_core.ts sdk/src/idl/sss_core_types.ts
 */
export type { SssCore } from "./sss_core_types";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const idl = require("../../../target/idl/sss_core.json");
export default idl;
