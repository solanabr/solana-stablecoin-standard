export { SSSClient } from "./client";
export type { SSSClientOptions } from "./client";

export {
  SSS_TOKEN_PROGRAM_ID,
  SSS_TRANSFER_HOOK_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  SEEDS,
} from "./constants";

export {
  getConfigPda,
  getRoleRegistryPda,
  getMinterInfoPda,
  getBlacklistPda,
  getReserveAttestationPda,
  getExtraAccountMetaListPda,
} from "./pda";

export {
  StablecoinPreset,
  Role,
} from "./types";
export type {
  StablecoinConfig,
  RoleRegistry,
  MinterInfo,
  BlacklistEntry,
  ReserveAttestation,
  InitializeParams,
  UpdateRoleParams,
  UpdateMinterParams,
  BlacklistAddParams,
  AttestReserveParams,
} from "./types";

export { SSSError, SSS_TOKEN_ERRORS, TRANSFER_HOOK_ERRORS } from "./errors";
export type { SSSErrorInfo } from "./errors";

export {
  createEventParser,
  parseTransactionEvents,
} from "./events";
export type {
  SSSEvent,
  StablecoinInitializedEvent,
  TokensMintedEvent,
  TokensBurnedEvent,
  AccountFrozenEvent,
  AccountThawedEvent,
  ProgramPausedEvent,
  ProgramUnpausedEvent,
  RoleUpdatedEvent,
  MinterUpdatedEvent,
  AuthorityTransferredEvent,
  BlacklistAddedEvent,
  BlacklistRemovedEvent,
  TokensSeizedEvent,
  AuditLogRecordedEvent,
} from "./events";

export { PRESET_CONFIGS, getPresetAnchorEnum } from "./presets";
export type { PresetConfig } from "./presets";

export { OracleModule, KNOWN_FEEDS, DEFAULT_CPI_CONFIG, BRAZIL_IPCA_CONFIG } from "./oracle";
export type { OraclePrice, ReserveData, OracleConfig, FeedInfo, FeedRegistry, CpiConfig } from "./oracle";
