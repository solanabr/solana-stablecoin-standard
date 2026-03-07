import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import { Program, AnchorProvider, BN, Idl } from '@coral-xyz/anchor';
import { TOKEN_2022_PROGRAM_ID, getAssociatedTokenAddressSync } from '@solana/spl-token';
import idlJson from '../../../target/idl/sss_token.json';

export const SSS_TOKEN_PROGRAM_ID = new PublicKey('6NMdvUa2n4WSLPx9yz7V9edFx9VQqWr5KUDZQGPK3GDL');
export const TRANSFER_HOOK_PROGRAM_ID = new PublicKey('C6psRvWLQ4PyiRcx7KZw5giAhNFtTMLn2foBaToJ36V');

export function getIDL(): Idl {
  return idlJson as unknown as Idl;
}

export function findStatePDA(mint: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('stablecoin'), mint.toBuffer()],
    SSS_TOKEN_PROGRAM_ID
  );
}

export function findMintAuthorityPDA(state: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('mint_authority'), state.toBuffer()],
    SSS_TOKEN_PROGRAM_ID
  );
}

export function findFreezeAuthorityPDA(state: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('freeze_authority'), state.toBuffer()],
    SSS_TOKEN_PROGRAM_ID
  );
}

export function findPermanentDelegatePDA(state: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('permanent_delegate'), state.toBuffer()],
    SSS_TOKEN_PROGRAM_ID
  );
}

export function findMinterInfoPDA(state: PublicKey, minter: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('minter'), state.toBuffer(), minter.toBuffer()],
    SSS_TOKEN_PROGRAM_ID
  );
}

export function findBlacklistEntryPDA(state: PublicKey, address: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('blacklist'), state.toBuffer(), address.toBuffer()],
    SSS_TOKEN_PROGRAM_ID
  );
}

export function getProgram(connection: Connection, wallet: any): Program {
  const provider = new AnchorProvider(connection, wallet, { commitment: 'confirmed' });
  return new Program(getIDL(), provider);
}

export function formatAmount(raw: string | bigint | BN, decimals: number = 6): string {
  const str = raw.toString().padStart(decimals + 1, '0');
  const intPart = str.slice(0, str.length - decimals) || '0';
  const decPart = str.slice(str.length - decimals);
  const formatted = parseFloat(`${intPart}.${decPart}`);
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: decimals,
  }).format(formatted);
}

export function parseAmount(amount: string, decimals: number = 6): BN {
  const [int, dec = ''] = amount.split('.');
  const padded = dec.padEnd(decimals, '0').slice(0, decimals);
  return new BN(`${int}${padded}`);
}

export function shortenAddress(addr: string, chars = 4): string {
  return `${addr.slice(0, chars)}...${addr.slice(-chars)}`;
}

export function explorerUrl(sig: string, type: 'tx' | 'address' = 'tx'): string {
  const network = localStorage.getItem('sss-network') || 'devnet';
  const cluster = network === 'mainnet' ? '' : `?cluster=${network}`;
  return `https://explorer.solana.com/${type}/${sig}${cluster}`;
}

export async function fetchStablecoinState(connection: Connection, wallet: any, mint: PublicKey) {
  const program = getProgram(connection, wallet);
  const [statePDA] = findStatePDA(mint);
  const state = await (program.account as any).stablecoinState.fetch(statePDA);
  return state;
}

export async function fetchHolders(connection: Connection, mint: PublicKey) {
  const accounts = await connection.getParsedProgramAccounts(TOKEN_2022_PROGRAM_ID, {
    filters: [{ memcmp: { offset: 0, bytes: mint.toBase58() } }],
  });
  return accounts
    .map((a) => {
      const parsed = (a.account.data as any)?.parsed?.info;
      if (!parsed) return null;
      return {
        address: a.pubkey.toBase58(),
        owner: parsed.owner as string,
        balance: parsed.tokenAmount?.amount || '0',
        uiBalance: parsed.tokenAmount?.uiAmountString || '0',
      };
    })
    .filter(Boolean)
    .sort((a: any, b: any) => parseFloat(b.uiBalance) - parseFloat(a.uiBalance));
}

export async function fetchMinters(connection: Connection, wallet: any, statePDA: PublicKey) {
  const program = getProgram(connection, wallet);
  const accounts = await (program.account as any).minterInfo.all([
    { memcmp: { offset: 8, bytes: statePDA.toBase58() } },
  ]);
  return accounts.map((a: any) => ({
    publicKey: a.publicKey.toBase58(),
    minter: a.account.minter.toBase58(),
    quota: a.account.quota.toString(),
    mintedThisEpoch: a.account.mintedThisEpoch.toString(),
    active: a.account.active,
  }));
}
