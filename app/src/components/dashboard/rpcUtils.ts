"use client";

const RATE_LIMIT_PATTERN =
  /(?:429|too many requests|rate limit|rate-limited|request limit)/i;
const NETWORK_PATTERN =
  /(?:failed to fetch|fetch failed|network request failed|networkerror|socket hang up|timed out|timeout|econnreset|econnrefused|enotfound|503|504|stream was reset|connection closed)/i;
const ACCOUNT_NOT_FOUND_PATTERN =
  /(?:account(?:\s+.*)?(?:not found|does not exist|has no data)|AccountNotFound|could not find account|invalid param: could not find account|not initialized)/i;

export type RpcErrorKind =
  | "rate_limit"
  | "network"
  | "not_found"
  | "unknown";

export type NormalizedRpcError = {
  kind: RpcErrorKind;
  message: string;
  rawMessage: string;
  retryable: boolean;
};

type RpcWrappedError = Error & {
  normalizedRpcError?: NormalizedRpcError;
};

function extractMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof (error as { message?: unknown }).message === "string"
  ) {
    return (error as { message: string }).message;
  }

  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

export function getNormalizedRpcError(
  error: unknown,
  fallbackMessage = "Unable to load on-chain data."
): NormalizedRpcError {
  if (error instanceof Error) {
    const wrapped = error as RpcWrappedError;
    if (wrapped.normalizedRpcError) {
      return wrapped.normalizedRpcError;
    }
  }

  const rawMessage = extractMessage(error) || fallbackMessage;

  if (ACCOUNT_NOT_FOUND_PATTERN.test(rawMessage)) {
    return {
      kind: "not_found",
      message:
        "No on-chain stablecoin data was found for the selected mint on this RPC endpoint.",
      rawMessage,
      retryable: false,
    };
  }

  if (RATE_LIMIT_PATTERN.test(rawMessage)) {
    return {
      kind: "rate_limit",
      message:
        "The RPC endpoint is rate-limiting requests. Please wait a moment and retry.",
      rawMessage,
      retryable: true,
    };
  }

  if (NETWORK_PATTERN.test(rawMessage)) {
    return {
      kind: "network",
      message:
        "The app could not reach the Solana RPC endpoint. Check the connection and retry.",
      rawMessage,
      retryable: true,
    };
  }

  return {
    kind: "unknown",
    message: rawMessage || fallbackMessage,
    rawMessage,
    retryable: false,
  };
}

export function toRpcError(
  error: unknown,
  fallbackMessage?: string
): RpcWrappedError {
  const normalized = getNormalizedRpcError(error, fallbackMessage);
  const wrapped =
    error instanceof Error
      ? error
      : new Error(normalized.rawMessage || normalized.message);

  wrapped.message = normalized.message;
  (wrapped as RpcWrappedError).normalizedRpcError = normalized;
  return wrapped as RpcWrappedError;
}

export function getRpcErrorMessage(
  error: unknown,
  fallbackMessage?: string
): string {
  return getNormalizedRpcError(error, fallbackMessage).message;
}

export function isAccountNotFoundError(error: unknown): boolean {
  return getNormalizedRpcError(error).kind === "not_found";
}

export function buildRetryMessage(
  error: NormalizedRpcError,
  delayMs: number
): string {
  const seconds = Math.max(1, Math.ceil(delayMs / 1000));

  switch (error.kind) {
    case "rate_limit":
      return `RPC rate limit reached. Retrying in ${seconds}s.`;
    case "network":
      return `RPC connection interrupted. Retrying in ${seconds}s.`;
    default:
      return `Retrying on-chain request in ${seconds}s.`;
  }
}

export async function withRpcRetry<T>(
  operation: () => Promise<T>,
  options?: {
    fallbackMessage?: string;
    maxRetries?: number;
    baseDelayMs?: number;
    maxDelayMs?: number;
    onRetry?: (
      error: NormalizedRpcError,
      delayMs: number,
      attempt: number
    ) => void;
  }
): Promise<T> {
  const maxRetries = options?.maxRetries ?? 3;
  const baseDelayMs = options?.baseDelayMs ?? 500;
  const maxDelayMs = options?.maxDelayMs ?? 4_000;

  for (let attempt = 0; ; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      const wrapped = toRpcError(error, options?.fallbackMessage);
      const normalized = getNormalizedRpcError(wrapped, options?.fallbackMessage);

      if (!normalized.retryable || attempt >= maxRetries) {
        throw wrapped;
      }

      const delayMs = Math.min(
        baseDelayMs * 2 ** attempt + Math.floor(Math.random() * 250),
        maxDelayMs
      );

      options?.onRetry?.(normalized, delayMs, attempt + 1);

      await new Promise((resolve) => {
        window.setTimeout(resolve, delayMs);
      });
    }
  }
}
