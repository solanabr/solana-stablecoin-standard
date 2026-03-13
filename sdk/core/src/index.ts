export { SolanaStablecoin } from "./stablecoin";
export { ComplianceModule } from "./compliance";
export { Preset, getPresetConfig, resolveConfig } from "./presets";
export {
  StablecoinCreateParams,
  StablecoinInfo,
  MintParams,
  BurnParams,
  FreezeParams,
  ThawParams,
  BlacklistParams,
  SeizeParams,
  MinterInfo,
  RoleInfo,
  SupplyInfo,
  AuditLogEntry,
  ROLE_FLAGS,
} from "./types";

export const Presets = {
  SSS_1: "sss-1" as const,
  SSS_2: "sss-2" as const,
};
