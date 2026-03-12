/**
 * Error handling utilities for the SSS SDK.
 *
 * ## How Anchor errors work:
 *
 * Anchor programs return numeric error codes in the range 6000+.
 * Each code maps to an error variant in the `SssError` enum.
 * The SDK maps these codes to human-readable messages.
 */

/** Custom error codes from the sss_token program (starting at 6000) */
export enum SssErrorCode {
  UnauthorizedMasterAuthority = 6000,
  UnauthorizedMinter = 6001,
  UnauthorizedBurner = 6002,
  UnauthorizedPauser = 6003,
  UnauthorizedBlacklister = 6004,
  UnauthorizedSeizer = 6005,
  Paused = 6006,
  NotPaused = 6007,
  MinterQuotaExceeded = 6008,
  MinterNotFound = 6009,
  MinterAlreadyExists = 6010,
  MaxMintersReached = 6011,
  MaxBurnersReached = 6012,
  ComplianceNotEnabled = 6013,
  TransferHookNotEnabled = 6014,
  ConfidentialTransfersNotEnabled = 6015,
  AlreadyBlacklisted = 6016,
  NotBlacklisted = 6017,
  AccountNotFrozen = 6018,
  NameTooLong = 6019,
  SymbolTooLong = 6020,
  UriTooLong = 6021,
  ReasonTooLong = 6022,
  ZeroMintAmount = 6023,
  ZeroBurnAmount = 6024,
  InvalidDecimals = 6025,
  ArithmeticOverflow = 6026,
}

/** Human-readable error messages */
const ERROR_MESSAGES: Record<number, string> = {
  [SssErrorCode.UnauthorizedMasterAuthority]: "Caller is not the master authority",
  [SssErrorCode.UnauthorizedMinter]: "Caller is not an authorized minter",
  [SssErrorCode.UnauthorizedBurner]: "Caller is not an authorized burner",
  [SssErrorCode.UnauthorizedPauser]: "Caller is not the pauser",
  [SssErrorCode.UnauthorizedBlacklister]: "Caller is not the blacklister",
  [SssErrorCode.UnauthorizedSeizer]: "Caller is not the seizer",
  [SssErrorCode.Paused]: "Operations are paused",
  [SssErrorCode.NotPaused]: "Operations are not paused",
  [SssErrorCode.MinterQuotaExceeded]: "Minter quota exceeded",
  [SssErrorCode.MinterNotFound]: "Minter not found",
  [SssErrorCode.MinterAlreadyExists]: "Minter already exists",
  [SssErrorCode.MaxMintersReached]: "Maximum number of minters reached (16)",
  [SssErrorCode.MaxBurnersReached]: "Maximum number of burners reached (16)",
  [SssErrorCode.ComplianceNotEnabled]: "Compliance module not enabled (SSS-2 required)",
  [SssErrorCode.TransferHookNotEnabled]: "Transfer hook not enabled",
  [SssErrorCode.ConfidentialTransfersNotEnabled]: "Confidential transfers not enabled (SSS-3 required)",
  [SssErrorCode.AlreadyBlacklisted]: "Address is already blacklisted",
  [SssErrorCode.NotBlacklisted]: "Address is not blacklisted",
  [SssErrorCode.AccountNotFrozen]: "Account must be frozen before seizure",
  [SssErrorCode.NameTooLong]: "Name exceeds 32 characters",
  [SssErrorCode.SymbolTooLong]: "Symbol exceeds 10 characters",
  [SssErrorCode.UriTooLong]: "URI exceeds 200 characters",
  [SssErrorCode.ReasonTooLong]: "Reason exceeds 128 characters",
  [SssErrorCode.ZeroMintAmount]: "Mint amount must be > 0",
  [SssErrorCode.ZeroBurnAmount]: "Burn amount must be > 0",
  [SssErrorCode.InvalidDecimals]: "Invalid decimals value",
  [SssErrorCode.ArithmeticOverflow]: "Arithmetic overflow",
};

/**
 * Custom SDK error with human-readable messages.
 *
 * @example
 * ```typescript
 * try {
 *   await client.mint({ ... });
 * } catch (err) {
 *   const sssError = SssError.fromAnchorError(err);
 *   if (sssError) {
 *     console.log(sssError.code); // 6008
 *     console.log(sssError.message); // "Minter quota exceeded"
 *   }
 * }
 * ```
 */
export class SssError extends Error {
  constructor(
    public readonly code: SssErrorCode,
    message?: string
  ) {
    super(message ?? ERROR_MESSAGES[code] ?? `Unknown SSS error: ${code}`);
    this.name = "SssError";
  }

  /**
   * Try to parse an Anchor error into an SssError.
   * Returns null if the error is not an SSS program error.
   */
  static fromAnchorError(error: unknown): SssError | null {
    if (error && typeof error === "object") {
      // Anchor error format
      const err = error as Record<string, unknown>;
      if ("error" in err && typeof err.error === "object" && err.error !== null) {
        const errorObj = err.error as Record<string, unknown>;
        if ("errorCode" in errorObj && typeof errorObj.errorCode === "object") {
          const codeObj = errorObj.errorCode as Record<string, unknown>;
          if ("number" in codeObj && typeof codeObj.number === "number") {
            return new SssError(codeObj.number as SssErrorCode);
          }
        }
      }

      // Raw transaction error format
      if ("logs" in err && Array.isArray(err.logs)) {
        for (const log of err.logs) {
          if (typeof log === "string") {
            const match = log.match(/Error Code: (\w+)\. Error Number: (\d+)/);
            if (match) {
              return new SssError(parseInt(match[2]) as SssErrorCode);
            }
          }
        }
      }
    }

    return null;
  }

  /** Check if this is a specific error code */
  is(code: SssErrorCode): boolean {
    return this.code === code;
  }
}
