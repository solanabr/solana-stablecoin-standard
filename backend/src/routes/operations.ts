import path from 'node:path';
import { spawn } from 'node:child_process';
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';

export const operationsRoutes = Router();

const executeSchema = z.object({
  argv: z.array(z.string().min(1)).min(1),
  timeoutMs: z.number().int().min(1000).max(120000).optional(),
});

const allowedCommands: Record<string, string[]> = {
  token: ['create', 'mint', 'burn', 'info', 'list'],
  compliance: ['freeze', 'thaw', 'blacklist-add', 'blacklist-remove', 'seize', 'pause', 'unpause'],
  banking: ['mint-request', 'confirm-mint', 'redeem', 'attestation'],
  wallet: ['balance', 'airdrop'],
  config: ['show', 'set'],
  presets: [],
};

const isAllowedCommand = (argv: string[]) => {
  const [group, subcommand] = argv;
  if (!group) {
    return false;
  }

  if (!(group in allowedCommands)) {
    return false;
  }

  if (group === 'presets') {
    return argv.length === 1;
  }

  const allowedSubcommands = allowedCommands[group];
  return Boolean(subcommand && allowedSubcommands.includes(subcommand));
};

const runCliCommand = (argv: string[], timeoutMs: number) => {
  return new Promise<{ stdout: string; stderr: string; exitCode: number | null }>((resolve, reject) => {
    const repoRoot = path.resolve(process.cwd(), '..');
    const child = spawn('npm', ['run', 'cli', '--', ...argv], {
      cwd: repoRoot,
      shell: false,
      env: process.env,
    });

    let stdout = '';
    let stderr = '';

    const timeout = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new ApiError(`Command timed out after ${timeoutMs}ms`, 408));
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => {
      clearTimeout(timeout);
      reject(new ApiError(`Failed to start CLI command: ${error.message}`, 500));
    });

    child.on('close', (exitCode) => {
      clearTimeout(timeout);
      resolve({ stdout, stderr, exitCode });
    });
  });
};

operationsRoutes.get('/capabilities', asyncHandler(async (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      cliExecutionEnabled: process.env.DASHBOARD_CLI_EXECUTION_ENABLED === 'true',
      allowedCommands,
      note: 'Set DASHBOARD_CLI_EXECUTION_ENABLED=true on backend to allow dashboard-triggered CLI execution.',
    },
  });
}));

operationsRoutes.post('/execute', asyncHandler(async (req: Request, res: Response) => {
  if (process.env.DASHBOARD_CLI_EXECUTION_ENABLED !== 'true') {
    throw new ApiError('Dashboard CLI execution is disabled. Set DASHBOARD_CLI_EXECUTION_ENABLED=true to enable.', 503);
  }

  const parsed = executeSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ApiError(`Invalid request payload: ${parsed.error.issues[0]?.message || 'unknown error'}`, 400);
  }

  const { argv, timeoutMs = 60000 } = parsed.data;

  if (!isAllowedCommand(argv)) {
    throw new ApiError('Command is not allowed by dashboard execution policy.', 403);
  }

  const startedAt = Date.now();
  const result = await runCliCommand(argv, timeoutMs);
  const durationMs = Date.now() - startedAt;

  res.json({
    success: result.exitCode === 0,
    data: {
      argv,
      command: `npm run cli -- ${argv.join(' ')}`,
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
      durationMs,
      startedAt: new Date(startedAt).toISOString(),
      finishedAt: new Date().toISOString(),
    },
  });
}));
