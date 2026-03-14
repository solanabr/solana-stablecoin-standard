export function shortAddress(value: string | null | undefined, chars = 4): string {
  if (!value) {
    return 'Not connected';
  }
  if (value.length <= chars * 2) {
    return value;
  }
  return `${value.slice(0, chars)}...${value.slice(-chars)}`;
}

export function formatBigint(value: bigint | number | null | undefined): string {
  if (value === null || value === undefined) {
    return '0';
  }
  const numeric = typeof value === 'bigint' ? Number(value) : value;
  return Number.isFinite(numeric) ? numeric.toLocaleString() : String(value);
}

export function formatDate(value: Date): string {
  return value.toLocaleString();
}

export function explorerUrl(
  value: string,
  type: 'address' | 'tx',
  environment: 'mainnet-beta' | 'devnet' | 'localnet',
  rpcUrl?: string,
): string {
  const path = type === 'tx' ? `tx/${value}` : `address/${value}`;
  const base = `https://explorer.solana.com/${path}`;

  if (environment === 'mainnet-beta') {
    return base;
  }

  if (environment === 'localnet' && rpcUrl) {
    return `${base}?cluster=custom&customUrl=${encodeURIComponent(rpcUrl)}`;
  }

  return `${base}?cluster=${environment}`;
}
