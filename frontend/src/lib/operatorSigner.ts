import { Keypair } from '@solana/web3.js';
import type { OperatorSigner } from '../app/types';

export function parseOperatorSigner(raw: string, label = 'Imported operator'): OperatorSigner {
  const data = JSON.parse(raw) as unknown;
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error('Expected a JSON array secret key.');
  }
  if (!data.every((value) => Number.isInteger(value) && value >= 0 && value <= 255)) {
    throw new Error('Secret key array must contain byte values.');
  }
  return {
    label,
    secretKey: Uint8Array.from(data),
  };
}

export function toKeypair(operator: OperatorSigner): Keypair {
  return Keypair.fromSecretKey(operator.secretKey);
}
