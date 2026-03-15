const BASE58_ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export function isMintAddress(value: string) {
  return BASE58_ADDRESS.test(value.trim());
}

export function normalizeMint(value: string) {
  return value.trim();
}
