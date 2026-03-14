import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

execSync('pnpm exec vitest run tests/integration', {
  cwd: repoRoot,
  env: {
    ...process.env,
    RUN_ANCHOR_TESTS: process.env.RUN_ANCHOR_TESTS ?? '1',
  },
  stdio: 'inherit',
});
