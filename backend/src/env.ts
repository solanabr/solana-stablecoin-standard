/**
 * Centralized env validation. Fail fast at startup with clear messages.
 */

import * as fs from "fs";
import * as path from "path";
import { z } from "zod";

const envSchema = z.object({
  RPC_URL: z
    .string()
    .url()
    .optional()
    .default("https://api.devnet.solana.com"),
  KEYPAIR_PATH: z
    .string()
    .min(1)
    .optional()
    .default(
      path.join(
        process.env.HOME || process.env.USERPROFILE || "",
        ".config",
        "solana",
        "id.json"
      )
    ),
  MINT_ADDRESS: z.string().optional(),
  API_KEY: z.string().optional(),
  PORT: z.coerce.number().int().min(1).max(65535).optional().default(3000),
  CORS_ORIGIN: z.string().optional(),
  LOG_LEVEL: z.string().optional(),
  COMPLIANCE_SCREENING_URL: z.string().url().optional().or(z.literal("")),
  WEBHOOK_URL: z.string().url().optional().or(z.literal("")),
  WEBHOOK_MAX_RETRIES: z.coerce.number().optional(),
  WEBHOOK_TIMEOUT_MS: z.coerce.number().optional(),
  RUN_EVENT_LISTENER: z
    .string()
    .optional()
    .transform((v) => v === "true" || v === "1"),
  AUDIT_FROM_CHAIN: z
    .string()
    .optional()
    .transform((v) => v === "true" || v === "1"),
  SSS_TOKEN_PROGRAM_ID: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Load and validate env. Throws with a clear message if validation fails or keypair file is missing.
 */
export function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.flatten().fieldErrors;
    const msg = Object.entries(issues)
      .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`)
      .join("; ");
    throw new Error(`Invalid env: ${msg}`);
  }
  const env = parsed.data;
  if (!fs.existsSync(env.KEYPAIR_PATH)) {
    throw new Error(
      `KEYPAIR_PATH not found: ${env.KEYPAIR_PATH}. Set KEYPAIR_PATH or place keypair at default path.`
    );
  }
  return env;
}
