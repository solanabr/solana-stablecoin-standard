import { z } from "zod";

const booleanString = z
  .string()
  .transform((v) => v === "true" || v === "1")
  .optional();

export const baseConfigSchema = z.object({
  RPC_URL: z.string().url(),
  MINT_PUBKEY: z.string().min(32),
  DATABASE_URL: z.string().min(1),
  PORT: z.coerce.number().default(3000),
  LOG_LEVEL: z
    .enum(["trace", "debug", "info", "warn", "error", "fatal"])
    .default("info"),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
});

export const redisConfigSchema = baseConfigSchema.extend({
  REDIS_URL: z.string().min(1).default("redis://localhost:6379"),
});

export const mintBurnConfigSchema = baseConfigSchema.extend({
  MINTER_PRIVATE_KEY: z.string().min(1),
  BURNER_PRIVATE_KEY: z.string().min(1),
  COMPLIANCE_SERVICE_URL: z.string().url().optional(),
  SCREEN_BEFORE_MINT: booleanString,
});

/** Optional URL: empty or missing → undefined (use stub); non-empty → must be valid URL. */
const optionalUrl = z
  .string()
  .optional()
  .transform((v) => (v == null || String(v).trim() === "" ? undefined : v))
  .pipe(z.union([z.string().url(), z.undefined()]));

export const complianceConfigSchema = redisConfigSchema.extend({
  BLACKLISTER_PRIVATE_KEY: z.string().min(1),
  SEIZER_PRIVATE_KEY: z.string().min(1).optional(),
  SANCTIONS_API_URL: optionalUrl,
  SANCTIONS_API_KEY: z
    .string()
    .optional()
    .transform((v) => (v == null || String(v).trim() === "" ? undefined : v)),
  LARGE_MINT_THRESHOLD: z.coerce.bigint().default(BigInt(1_000_000_000_000)),
  LARGE_BURN_THRESHOLD: z.coerce.bigint().default(BigInt(1_000_000_000_000)),
});

export type BaseConfig = z.infer<typeof baseConfigSchema>;
export type RedisConfig = z.infer<typeof redisConfigSchema>;
export type MintBurnConfig = z.infer<typeof mintBurnConfigSchema>;
export type ComplianceConfig = z.infer<typeof complianceConfigSchema>;

export function parseConfig<T extends z.ZodTypeAny>(
  schema: T,
  env: NodeJS.ProcessEnv = process.env,
): z.infer<T> {
  const result = schema.safeParse(env);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid configuration:\n${issues}`);
  }
  return result.data as z.infer<T>;
}
