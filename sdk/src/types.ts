import type { Commitment, Connection, Keypair, PublicKey, SendOptions, Transaction } from "@solana/web3.js";

export type TransactionAuthority = Keypair | PublicKey;

export interface WalletSigner {
  publicKey: PublicKey;
  signTransaction(transaction: Transaction): Promise<Transaction>;
  signAllTransactions?(transactions: Transaction[]): Promise<Transaction[]>;
}

export type StablecoinPreset = "sss-1" | "sss-2" | "sss-3";

export interface ExtensionConfig {
  permanentDelegate?: boolean;
  transferHook?: boolean;
  defaultAccountFrozen?: boolean;
  confidentialTransfers?: boolean;
  zkComplianceProofs?: boolean;
  compressedComplianceState?: boolean;
}

export interface RegistryMetadata {
  homepage?: string;
  jurisdiction?: string;
}

export interface ExperimentalComplianceConfig {
  proofVerifierProgramId?: PublicKey;
  compressedComplianceRoot?: string;
  complianceCircuit?: string;
}

export interface StablecoinCreateParams {
  connection: Connection;
  authority: TransactionAuthority;
  programId?: PublicKey;
  preset?: StablecoinPreset;
  name: string;
  symbol: string;
  uri?: string;
  decimals: number;
  mint?: PublicKey | Keypair;
  transferHookProgramId?: PublicKey;
  standardVersion?: string;
  registryMetadata?: RegistryMetadata;
  extensions?: ExtensionConfig;
  compliance?: ExperimentalComplianceConfig;
}

export interface StablecoinConfigView {
  authority: string;
  preset: StablecoinPreset;
  name: string;
  symbol: string;
  uri: string;
  decimals: number;
  enablePermanentDelegate: boolean;
  enableTransferHook: boolean;
  defaultAccountFrozen: boolean;
  enableConfidentialTransfers: boolean;
  enableZkComplianceProofs: boolean;
  enableCompressedComplianceState: boolean;
  transferHookProgramId: string | null;
  proofVerifierProgramId: string | null;
  compressedComplianceRoot: string | null;
  complianceCircuit: string | null;
  standardVersion: string;
  configHash: string;
  isPaused: boolean;
}

export interface StablecoinRegistryEntry {
  mint: string;
  config: string;
  authority: string;
  preset: StablecoinPreset;
  standardVersion: string;
  configHash: string;
  name: string;
  symbol: string;
  uri: string;
  decimals: number;
  enablePermanentDelegate: boolean;
  enableTransferHook: boolean;
  defaultAccountFrozen: boolean;
  enableConfidentialTransfers: boolean;
  enableZkComplianceProofs: boolean;
  enableCompressedComplianceState: boolean;
  transferHookProgramId: string | null;
  proofVerifierProgramId: string | null;
  compressedComplianceRoot: string | null;
  complianceCircuit: string | null;
  metadata: RegistryMetadata;
}

export interface MintParams {
  destination: PublicKey;
  amount: bigint;
  minter: TransactionAuthority;
}

export interface BurnParams {
  source: PublicKey;
  amount: bigint;
  burner: TransactionAuthority;
}

export interface SeizeParams {
  fromAccount: PublicKey;
  toAccount: PublicKey;
  seizer: TransactionAuthority;
}

export interface BlacklistAddParams {
  address: PublicKey;
  reason: string;
}

export type RoleType = "minter" | "burner" | "blacklister" | "pauser" | "seizer";

export interface UpdateRoleParams {
  holder: PublicKey;
  role: RoleType;
  isActive: boolean;
  mintQuota?: bigint | null;
}

export interface ComplianceProofReceipt {
  mint: string;
  subject: string;
  nullifier: string;
  proofCommitment: string;
  complianceRoot: string;
  circuit: string;
  verifier: string | null;
  expiresAtSlot: number;
}

export interface SubmitProofReceiptParams {
  subject: PublicKey;
  commitment: Uint8Array;
  proofCommitment: Uint8Array;
  response: Uint8Array;
  merkleSiblings: Uint8Array[];
  merkleDirections: number[];
  circuit: string;
  expiresAtSlot: bigint;
}

export interface CompressedComplianceState {
  mint: string;
  root: string;
  leafCount: number;
}

export interface RegistryRelease {
  standardVersion: string;
  preset: StablecoinPreset;
  schemaHash: string;
  deprecated: boolean;
  replacementVersion: string | null;
  notesUri: string;
}

export interface BrowserSendTransactionParams {
  connection: Connection;
  transaction: Transaction;
  signer: Keypair | WalletSigner;
  extraSigners?: Keypair[];
  commitment?: Commitment;
  sendOptions?: SendOptions;
}
