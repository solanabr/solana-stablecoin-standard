import { PublicKey } from '@solana/web3.js';

/** Program ID for the Solana Stablecoin Standard */
export const SSS_PROGRAM_ID = new PublicKey('Aaw7RSm8fXXAfvDy9wS1FimFEmnHkzYtDmZCRgZg9pVm');

/** PDA seeds — must match on-chain constants */
export const STABLECOIN_CONFIG_SEED = Buffer.from('stablecoin-config');
export const ROLES_CONFIG_SEED = Buffer.from('roles-config');
export const BLACKLIST_SEED = Buffer.from('blacklist');
export const AUDIT_LOG_SEED = Buffer.from('audit');

/** Default token decimals (matches USDC) */
export const DEFAULT_DECIMALS = 6;

/** Token-2022 program ID */
export const TOKEN_2022_PROGRAM_ID = new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPGA1WymbbVQnDBtzdeyz');
