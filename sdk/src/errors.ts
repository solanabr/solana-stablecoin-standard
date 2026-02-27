export interface SSSErrorInfo {
  code: number;
  name: string;
  msg: string;
}

const SSS_TOKEN_ERRORS: SSSErrorInfo[] = [
  { code: 6000, name: "Unauthorized", msg: "Unauthorized: caller does not have the required role" },
  { code: 6001, name: "InvalidAuthority", msg: "Invalid authority for this operation" },
  { code: 6002, name: "ProgramPaused", msg: "Program is currently paused" },
  { code: 6003, name: "ProgramNotPaused", msg: "Program is not paused" },
  { code: 6004, name: "MinterNotActive", msg: "Minter is not active" },
  { code: 6005, name: "MintQuotaExceeded", msg: "Mint amount exceeds minter quota" },
  { code: 6006, name: "MintAmountZero", msg: "Mint amount must be greater than zero" },
  { code: 6007, name: "BurnAmountZero", msg: "Burn amount must be greater than zero" },
  { code: 6008, name: "InsufficientBalance", msg: "Insufficient balance for burn" },
  { code: 6009, name: "FeatureNotEnabled", msg: "Feature not enabled for this stablecoin preset" },
  { code: 6010, name: "BlacklistNotEnabled", msg: "Blacklist feature requires SSS-2 or higher preset" },
  { code: 6011, name: "TransferHookNotEnabled", msg: "Transfer hook feature requires SSS-2 or higher preset" },
  { code: 6012, name: "ConfidentialTransfersNotEnabled", msg: "Confidential transfers require SSS-3 preset" },
  { code: 6013, name: "AlreadyBlacklisted", msg: "Address is already blacklisted" },
  { code: 6014, name: "NotBlacklisted", msg: "Address is not blacklisted" },
  { code: 6015, name: "CannotBlacklistAuthority", msg: "Cannot blacklist the master authority" },
  { code: 6016, name: "NameTooLong", msg: "Name exceeds maximum length of 32 characters" },
  { code: 6017, name: "SymbolTooLong", msg: "Symbol exceeds maximum length of 10 characters" },
  { code: 6018, name: "UriTooLong", msg: "URI exceeds maximum length of 200 characters" },
  { code: 6019, name: "ReasonTooLong", msg: "Reason exceeds maximum length of 128 characters" },
  { code: 6020, name: "DetailsTooLong", msg: "Details exceeds maximum length of 256 characters" },
  { code: 6021, name: "InvalidDecimals", msg: "Invalid decimals value" },
  { code: 6022, name: "SameAuthority", msg: "Cannot transfer authority to the same address" },
  { code: 6023, name: "ZeroAuthority", msg: "New authority cannot be the zero address" },
  { code: 6024, name: "SeizeAmountZero", msg: "Seize amount must be greater than zero" },
  { code: 6025, name: "SeizeSameAccount", msg: "Source and destination accounts must be different" },
  { code: 6026, name: "Overflow", msg: "Arithmetic overflow" },
];

const TRANSFER_HOOK_ERRORS: SSSErrorInfo[] = [
  { code: 6000, name: "SourceBlacklisted", msg: "Source address is blacklisted" },
  { code: 6001, name: "DestinationBlacklisted", msg: "Destination address is blacklisted" },
  { code: 6002, name: "Unauthorized", msg: "Unauthorized: caller is not the master authority" },
  { code: 6003, name: "InvalidConfig", msg: "Invalid config account" },
];

const errorByCode = new Map<number, SSSErrorInfo>();
for (const err of SSS_TOKEN_ERRORS) {
  errorByCode.set(err.code, err);
}

export class SSSError extends Error {
  code: number;
  errorName: string;

  constructor(code: number, name: string, msg: string) {
    super(`${name} (${code}): ${msg}`);
    this.code = code;
    this.errorName = name;
    this.name = "SSSError";
  }

  static fromCode(code: number): SSSError | null {
    const info = errorByCode.get(code);
    if (!info) return null;
    return new SSSError(info.code, info.name, info.msg);
  }

  static fromAnchorError(err: any): SSSError | null {
    // Standard AnchorError shape: err.error.errorCode.number
    const code = err?.error?.errorCode?.number ?? err?.code;
    if (typeof code === "number") {
      const result = SSSError.fromCode(code);
      if (result) return result;
    }
    // Parse from transaction logs (SendTransactionError shape)
    const logs = err?.logs ?? err?.transactionLogs;
    if (Array.isArray(logs)) {
      for (const log of logs) {
        const match = String(log).match(/Error Number: (\d+)/);
        if (match) {
          const num = parseInt(match[1], 10);
          const result = SSSError.fromCode(num);
          if (result) return result;
        }
      }
    }
    // Parse from message (custom program error format)
    const msg = err?.message ?? "";
    const hexMatch = String(msg).match(/custom program error: 0x([0-9a-fA-F]+)/);
    if (hexMatch) {
      const num = parseInt(hexMatch[1], 16);
      const result = SSSError.fromCode(num);
      if (result) return result;
    }
    return null;
  }
}

export { SSS_TOKEN_ERRORS, TRANSFER_HOOK_ERRORS };
