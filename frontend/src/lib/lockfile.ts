import type { Lockfile } from '../app/types';

export function parseLockfile(raw: string): Lockfile {
  const parsed = JSON.parse(raw) as Partial<Lockfile>;
  const required = [
    'version',
    'rpcUrl',
    'stablecoinProgramId',
    'transferHookProgramId',
    'mint',
    'config',
    'masterMinterRole',
    'createdAt',
  ] satisfies Array<keyof Lockfile>;

  for (const field of required) {
    if (parsed[field] === undefined || parsed[field] === null || parsed[field] === '') {
      throw new Error(`Invalid lockfile: missing ${field}`);
    }
  }

  return parsed as Lockfile;
}

export function downloadLockfile(lockfile: Lockfile): void {
  const blob = new Blob([`${JSON.stringify(lockfile, null, 2)}\n`], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'sss.lock.json';
  link.click();
  URL.revokeObjectURL(url);
}
