import type { Buffer } from 'buffer';
import type process from 'process';

interface ImportMetaEnv {
  readonly VITE_RPC_URL?: string;
  readonly VITE_DEFAULT_ENVIRONMENT?: 'devnet' | 'mainnet-beta' | 'localnet';
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare global {
  interface Window {
    Buffer?: typeof Buffer;
    process?: typeof process;
  }

  // eslint-disable-next-line no-var
  var Buffer: typeof Buffer;
  // eslint-disable-next-line no-var
  var process: typeof process;
}
