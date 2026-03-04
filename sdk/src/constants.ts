import { PublicKey } from '@solana/web3.js';

// Program IDs (deployed)
export const STABLECOIN_CORE_PROGRAM_ID = new PublicKey(
  'Dns9MwXRed9RQxaw3ED4PUn7FC9bm2CynPFpzx6eTCFh'
);

export const TRANSFER_HOOK_PROGRAM_ID = new PublicKey(
  'E2fEodf97kX61uMpt6tWXKLCPxkQRn4oHa26ig85GND1'
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
