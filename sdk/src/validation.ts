const MAX_NAME_LENGTH = 32;
const MAX_SYMBOL_LENGTH = 8;
const MAX_URI_LENGTH = 200;
const MAX_REASON_LENGTH = 100;

export function assertValidMetadata(name: string, symbol: string, uri: string, decimals: number): void {
  if (!name || name.length > MAX_NAME_LENGTH) {
    throw new Error("InvalidName");
  }
  if (!symbol || symbol.length > MAX_SYMBOL_LENGTH) {
    throw new Error("InvalidSymbol");
  }
  if (uri.length > MAX_URI_LENGTH) {
    throw new Error("InvalidUri");
  }
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 9) {
    throw new Error("InvalidDecimals");
  }
}

export function assertPositiveAmount(amount: bigint): void {
  if (amount <= 0n) {
    throw new Error("InvalidAmount");
  }
}

export function assertValidReason(reason: string): void {
  if (!reason || reason.length > MAX_REASON_LENGTH) {
    throw new Error("InvalidReason");
  }
}
