import { Keypair } from '@solana/web3.js';
import * as fs from 'fs';

/**
 * Loads a Keypair from a local file path.
 * Used to interpret the --keypair flag or corresponding environment variable.
 */
export function loadKeypair(path?: string): Keypair {
  const targetPath = path || process.env.OPERATOR_KEYPAIR_PATH;
  
  if (!targetPath) {
    throw new Error('Keypair path not provided via flag or environment variable.');
  }

  if (!fs.existsSync(targetPath)) {
    throw new Error(`Keypair file not found at path: ${targetPath}`);
  }

  const fileData = fs.readFileSync(targetPath, 'utf-8');
  let secretKey: Uint8Array;
  try {
    const jsonParsed = JSON.parse(fileData);
    secretKey = Uint8Array.from(jsonParsed);
  } catch (err) {
    throw new Error('Invalid keypair file format. Must be a JSON array of bytes.');
  }

  return Keypair.fromSecretKey(secretKey);
}
