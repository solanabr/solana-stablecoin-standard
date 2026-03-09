import { Connection, clusterApiUrl } from '@solana/web3.js';

/**
 * Returns a configured Solana Connection instance based on the provided network flag.
 * Prioritizes the CLI flag first, then local environment override, defaulting to devnet.
 */
export function getConnection(networkFlag?: string): Connection {
  const network = networkFlag || process.env.SOLANA_NETWORK || 'devnet';
  
  // Quick resolution for standard aliases or explicit custom RPC URLs
  let endpoint = '';
  switch (network) {
    case 'devnet':
    case 'testnet':
    case 'mainnet-beta':
      endpoint = clusterApiUrl(network);
      break;
    case 'localnet':
    case 'localhost':
      endpoint = 'http://127.0.0.1:8899';
      break;
    default:
      // If none of the known aliases map, assume the flag itself is a custom full RPC URL
      endpoint = process.env.RPC_URL || network;
  }

  return new Connection(endpoint, 'confirmed');
}
