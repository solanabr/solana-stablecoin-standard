/** Custom error class for SSS SDK operations */
export class SssError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
    public readonly txSignature?: string,
  ) {
    super(message);
    this.name = "SssError";
  }
}

/** Parse Anchor program errors into SssError */
export function parseAnchorError(error: unknown): SssError {
  if (error instanceof SssError) return error;

  const message = error instanceof Error ? error.message : String(error);

  // Try to extract Anchor error code
  const anchorMatch = message.match(/Error Code: (\w+)\. Error Message: (.+)/);
  if (anchorMatch) {
    return new SssError(anchorMatch[2], anchorMatch[1]);
  }

  return new SssError(message);
}
