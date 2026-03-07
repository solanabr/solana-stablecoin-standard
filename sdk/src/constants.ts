import { PublicKey } from '@solana/web3.js';

// Program IDs (deployed to devnet)
export const STABLECOIN_CORE_PROGRAM_ID = new PublicKey(
  'Hx1FiL4UdbdqiFr9pseWnkDpLtYYm4KsevHSgvgBX4oh'
);

export const TRANSFER_HOOK_PROGRAM_ID = new PublicKey(
  'HT1Ut5v68JASHGtPs5v8PzeS4Sg6Y3RpFk6dFWCYX4EZ'
);

// Seeds for PDA derivation
export const STABLECOIN_SEED = Buffer.from('stablecoin');
export const MINTER_SEED = Buffer.from('minter');
export const ROLE_SEED = Buffer.from('role');
export const BLACKLIST_SEED = Buffer.from('blacklist');

// Role types
export enum RoleType {
  Burner = 0,
  Blacklister = 1,
  Pauser = 2,
  Seizer = 3,
}

// Role actions
export enum RoleAction {
  Add = 0,
  Remove = 1,
}
