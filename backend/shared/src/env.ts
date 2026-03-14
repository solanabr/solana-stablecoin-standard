import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.string().default('development'),
  PORT: z.coerce.number().default(8080),
  DATABASE_URL: z.string().default('postgres://postgres:postgres@postgres:5432/sss'),
  RPC_URL: z.string().default('http://host.docker.internal:8899'),
  SSS_LOCKFILE_PATH: z.string().default('/app/sss.lock.json'),
  SSS_KEYPAIR_PATH: z.string().default('/app/secrets/id.json'),
  WEBHOOK_URL: z.string().optional(),
  WEBHOOK_MAX_RETRIES: z.coerce.number().default(3),
  POLL_INTERVAL_MS: z.coerce.number().default(4000),
});

export type ServiceEnv = z.infer<typeof EnvSchema>;

export function loadEnv(overrides: Partial<Record<keyof ServiceEnv, unknown>> = {}): ServiceEnv {
  return EnvSchema.parse({
    ...process.env,
    ...overrides,
  });
}
