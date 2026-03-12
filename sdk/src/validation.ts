import { z } from "zod";

import {
  PRESET_MINIMAL,
  PRESET_COMPLIANT,
  PRESET_CONFIDENTIAL,
} from "./constants";

// ---------------------------------------------------------------------------
// Constants (mirroring on-chain limits)
// ---------------------------------------------------------------------------

const MAX_NAME_LEN = 32;
const MAX_SYMBOL_LEN = 10;
const MAX_URI_LEN = 200;
const MAX_DECIMALS = 9;
const VALID_PRESETS = [PRESET_MINIMAL, PRESET_COMPLIANT, PRESET_CONFIDENTIAL] as const;

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

/**
 * Zod schema for `CreateStablecoinOptions`.
 *
 * Only validates the plain-data fields that can be checked without Solana
 * runtime objects (PublicKey, Wallet). The caller is still responsible for
 * supplying valid `authority`, `hookProgram`, etc.
 */
export const CreateStablecoinOptionsSchema = z.object({
  preset: z
    .number({ message: "preset must be a number" })
    .int("preset must be an integer")
    .refine((v) => (VALID_PRESETS as readonly number[]).includes(v), {
      message: `preset must be one of: ${VALID_PRESETS.join(", ")}`,
    }),
  name: z
    .string({ message: "name must be a string" })
    .min(1, "name must not be empty")
    .max(MAX_NAME_LEN, `name must be at most ${MAX_NAME_LEN} characters`),
  symbol: z
    .string({ message: "symbol must be a string" })
    .min(1, "symbol must not be empty")
    .max(MAX_SYMBOL_LEN, `symbol must be at most ${MAX_SYMBOL_LEN} characters`),
  uri: z
    .string({ message: "uri must be a string" })
    .max(MAX_URI_LEN, `uri must be at most ${MAX_URI_LEN} characters`)
    .optional(),
  decimals: z
    .number({ message: "decimals must be a number" })
    .int("decimals must be an integer")
    .min(0, "decimals must be >= 0")
    .max(MAX_DECIMALS, `decimals must be <= ${MAX_DECIMALS}`)
    .optional(),
});

/**
 * Zod schema for `InitializeParams`.
 *
 * All fields are required (no optionals) since this is the low-level
 * client interface where defaults have already been resolved.
 */
export const InitializeParamsSchema = z.object({
  preset: z
    .number({ message: "preset must be a number" })
    .int("preset must be an integer")
    .refine((v) => (VALID_PRESETS as readonly number[]).includes(v), {
      message: `preset must be one of: ${VALID_PRESETS.join(", ")}`,
    }),
  name: z
    .string({ message: "name must be a string" })
    .min(1, "name must not be empty")
    .max(MAX_NAME_LEN, `name must be at most ${MAX_NAME_LEN} characters`),
  symbol: z
    .string({ message: "symbol must be a string" })
    .min(1, "symbol must not be empty")
    .max(MAX_SYMBOL_LEN, `symbol must be at most ${MAX_SYMBOL_LEN} characters`),
  uri: z
    .string({ message: "uri must be a string" })
    .max(MAX_URI_LEN, `uri must be at most ${MAX_URI_LEN} characters`),
  decimals: z
    .number({ message: "decimals must be a number" })
    .int("decimals must be an integer")
    .min(0, "decimals must be >= 0")
    .max(MAX_DECIMALS, `decimals must be <= ${MAX_DECIMALS}`),
});

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

/**
 * Formats a ZodError into a human-readable string.
 */
function formatZodError(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? `${issue.path.join(".")}: ` : "";
      return `${path}${issue.message}`;
    })
    .join("; ");
}

/**
 * Validate options passed to `SolanaStablecoin.create()`.
 *
 * Parses the plain-data subset of `CreateStablecoinOptions` against the
 * schema and throws a descriptive `Error` on validation failure.
 *
 * @param opts  The options object to validate.
 * @throws      Error with a human-readable message listing all violations.
 */
export function validateCreateOptions(opts: Record<string, unknown>): void {
  const result = CreateStablecoinOptionsSchema.safeParse(opts);
  if (!result.success) {
    throw new Error(
      `Invalid CreateStablecoinOptions: ${formatZodError(result.error)}`
    );
  }
}

/**
 * Validate parameters passed to `StablecoinClient.initialize()`.
 *
 * Parses against `InitializeParamsSchema` and throws a descriptive `Error`
 * on validation failure.
 *
 * @param params  The params object to validate.
 * @throws        Error with a human-readable message listing all violations.
 */
export function validateInitializeParams(params: Record<string, unknown>): void {
  const result = InitializeParamsSchema.safeParse(params);
  if (!result.success) {
    throw new Error(
      `Invalid InitializeParams: ${formatZodError(result.error)}`
    );
  }
}
