import { PublicKey } from '@solana/web3.js';

// All program IDs and RPC are env-configurable via Vite
export const RPC_URL = import.meta.env.VITE_RPC_URL || 'https://api.devnet.solana.com';
export const STABLECOIN_PROGRAM_ID = new PublicKey(
  import.meta.env.VITE_STABLECOIN_PROGRAM_ID || 'GPXDvDTpDnCxWrkKXYkfFedKWhsvbmLj2FpXNQM3EV7y'
);
export const TRANSFER_HOOK_PROGRAM_ID = new PublicKey(
  import.meta.env.VITE_TRANSFER_HOOK_PROGRAM_ID || 'C76nk4L27JJbXiVHR72mWdcq9jX8NETHekECAxw72ZpM'
);
export const ORACLE_PROGRAM_ID = new PublicKey(
  import.meta.env.VITE_ORACLE_PROGRAM_ID || '11111111111111111111111111111111'
);
export const TOKEN_2022_PROGRAM_ID = new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb');

// Role bitmask values
export const ROLES = {
  Minter: 1,
  Burner: 2,
  Pauser: 4,
  Blacklister: 8,
  Seizer: 16,
};

export const ROLE_NAMES = Object.entries(ROLES).reduce((acc, [name, val]) => {
  acc[val] = name;
  return acc;
}, {});

// PDA derivation helpers
export function findConfigPDA(mint) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('stablecoin-config'), mint.toBuffer()],
    STABLECOIN_PROGRAM_ID
  );
}

export function findRolePDA(config, user) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('role'), config.toBuffer(), user.toBuffer()],
    STABLECOIN_PROGRAM_ID
  );
}

export function findBlacklistPDA(mint, user) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('blacklist'), mint.toBuffer(), user.toBuffer()],
    STABLECOIN_PROGRAM_ID
  );
}

export function findExtraMetasPDA(mint) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('extra-account-metas'), mint.toBuffer()],
    TRANSFER_HOOK_PROGRAM_ID
  );
}

// Preset labels
export const PRESETS = {
  0: { name: 'SSS-1', label: 'Minimal Stablecoin', color: 'blue' },
  1: { name: 'SSS-2', label: 'Compliant Stablecoin', color: 'green' },
  2: { name: 'Custom', label: 'Custom Config', color: 'yellow' },
};

// Explorer link
export function explorerUrl(address, type = 'address') {
  const cluster = RPC_URL.includes('devnet') ? 'devnet' :
                  RPC_URL.includes('mainnet') ? 'mainnet-beta' : 'custom';
  const clusterParam = cluster === 'custom'
    ? `cluster=custom&customUrl=${encodeURIComponent(RPC_URL)}`
    : `cluster=${cluster}`;
  return `https://explorer.solana.com/${type}/${address}?${clusterParam}`;
}
