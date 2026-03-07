export class SssError extends Error {
  constructor(
    message: string,
    public readonly code?: number
  ) {
    super(message);
    this.name = "SssError";
  }
}

export class NotCompliantPresetError extends SssError {
  constructor() {
    super(
      "This operation requires SSS-2 (Compliant) preset. " +
        "The current mint was initialized with SSS-1."
    );
    this.name = "NotCompliantPresetError";
  }
}

export class QuotaExceededError extends SssError {
  constructor() {
    super("Minter quota exceeded");
    this.name = "QuotaExceededError";
  }
}

export class AlreadyBlacklistedError extends SssError {
  constructor(address: string) {
    super(`Address ${address} is already blacklisted`);
    this.name = "AlreadyBlacklistedError";
  }
}

export class NotBlacklistedError extends SssError {
  constructor(address: string) {
    super(`Address ${address} is not blacklisted`);
    this.name = "NotBlacklistedError";
  }
}
