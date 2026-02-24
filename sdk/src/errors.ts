export class SssError extends Error {
  constructor(
    message: string,
    public code: string,
  ) {
    super(message);
    this.name = "SssError";
  }
}

export class PausedError extends SssError {
  constructor() {
    super("Operations are paused", "Paused");
  }
}

export class NotPausedError extends SssError {
  constructor() {
    super("Operations are not paused", "NotPaused");
  }
}

export class SupplyCapExceededError extends SssError {
  constructor() {
    super("Supply cap exceeded", "SupplyCapExceeded");
  }
}

export class UnauthorizedError extends SssError {
  constructor() {
    super("Missing required role", "Unauthorized");
  }
}

export class InvalidPresetError extends SssError {
  constructor() {
    super("Invalid preset value", "InvalidPreset");
  }
}

export class LastAdminError extends SssError {
  constructor() {
    super("Cannot remove the last admin", "LastAdmin");
  }
}

export class ArithmeticOverflowError extends SssError {
  constructor() {
    super("Overflow in arithmetic operation", "ArithmeticOverflow");
  }
}

export class MintMismatchError extends SssError {
  constructor() {
    super("Mint mismatch", "MintMismatch");
  }
}

export class InvalidSupplyCapError extends SssError {
  constructor() {
    super("Invalid supply cap: must be >= current supply", "InvalidSupplyCap");
  }
}

export class ZeroAmountError extends SssError {
  constructor() {
    super("Amount must be greater than zero", "ZeroAmount");
  }
}

export class InvalidRoleError extends SssError {
  constructor() {
    super("Invalid role value", "InvalidRole");
  }
}

export class SenderBlacklistedError extends SssError {
  constructor() {
    super("Sender is blacklisted", "SenderBlacklisted");
  }
}

export class ReceiverBlacklistedError extends SssError {
  constructor() {
    super("Receiver is blacklisted", "ReceiverBlacklisted");
  }
}

export class ReasonTooLongError extends SssError {
  constructor() {
    super("Reason exceeds maximum length", "ReasonTooLong");
  }
}

const CORE_ERROR_MAP: Record<string, () => SssError> = {
  Paused: () => new PausedError(),
  NotPaused: () => new NotPausedError(),
  SupplyCapExceeded: () => new SupplyCapExceededError(),
  Unauthorized: () => new UnauthorizedError(),
  InvalidPreset: () => new InvalidPresetError(),
  LastAdmin: () => new LastAdminError(),
  ArithmeticOverflow: () => new ArithmeticOverflowError(),
  MintMismatch: () => new MintMismatchError(),
  InvalidSupplyCap: () => new InvalidSupplyCapError(),
  ZeroAmount: () => new ZeroAmountError(),
  InvalidRole: () => new InvalidRoleError(),
};

const HOOK_ERROR_MAP: Record<string, () => SssError> = {
  SenderBlacklisted: () => new SenderBlacklistedError(),
  ReceiverBlacklisted: () => new ReceiverBlacklistedError(),
  ReasonTooLong: () => new ReasonTooLongError(),
  Unauthorized: () => new UnauthorizedError(),
};

/**
 * Map Anchor error codes to typed SDK errors.
 * Falls through gracefully if the error is not an Anchor program error.
 */
export function mapAnchorError(err: unknown): Error {
  if (err && typeof err === "object" && "error" in err) {
    const anchorErr = err as { error: { errorCode?: { code: string } } };
    const code = anchorErr.error?.errorCode?.code;
    if (code) {
      const coreFactory = CORE_ERROR_MAP[code];
      if (coreFactory) return coreFactory();
      const hookFactory = HOOK_ERROR_MAP[code];
      if (hookFactory) return hookFactory();
    }
  }
  return err instanceof Error ? err : new Error(String(err));
}
