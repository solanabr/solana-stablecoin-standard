import {
  ComputeBudgetProgram,
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  Transaction,
  type AccountMeta,
  type Connection
} from "@solana/web3.js";
import { getAccount } from "@solana/spl-token";

import { fetchStablecoinConfig } from "./accountState.js";
import { ComplianceClient, type ComplianceProofInput } from "./compliance.js";
import {
  BLACKLIST_ENTRY_SEED,
  FALLBACK_PROGRAM_ID,
  PROOF_RECEIPT_SEED,
  STABLECOIN_CONFIG_SEED,
  TOKEN_2022_PROGRAM_ID
} from "./constants.js";
import { normalizeCreateConfig, toConfigView } from "./config.js";
import { buildStablecoinRegistryEntry, computeStablecoinConfigHash } from "./registry.js";
import {
  buildInstruction,
  buildTransaction,
  coerceOptionalPubkey,
  encodeStablecoinInstruction,
  readonly,
  writable
} from "./instructions.js";
import { assertPositiveAmount, assertValidReason } from "./validation.js";
import type {
  BlacklistAddParams,
  BurnParams,
  RegistryMetadata,
  StablecoinRegistryEntry,
  StablecoinCreateParams,
  MintParams,
  SeizeParams,
  SubmitProofReceiptParams
} from "./types.js";
import type { StablecoinConfigView, TransactionAuthority, UpdateRoleParams } from "./types.js";
import {
  buildInitializeExtraAccountMetaListInstruction,
  findProofReceiptPda,
  findTransferHookMetaListPda
} from "./transferHook.js";
import { isKeypair, resolvePublicKey, signAndSendTransaction } from "./wallet.js";

export interface StablecoinConnectParams {
  connection: Connection;
  authority: TransactionAuthority;
  programId?: PublicKey;
  mint: PublicKey;
  registryMetadata?: RegistryMetadata;
}

function roleDiscriminator(role: UpdateRoleParams["role"]): number {
  switch (role) {
    case "minter":
      return 0;
    case "burner":
      return 1;
    case "blacklister":
      return 2;
    case "pauser":
      return 3;
    case "seizer":
      return 4;
    default:
      throw new Error(`UnsupportedRole:${String(role)}`);
  }
}

class InMemoryComplianceBackend {
  public readonly blacklist = new Map<string, string>();
  public readonly proofReceipts = new Map<string, ComplianceProofInput>();
  public compressedStateRoot: string | null = null;

  public async blacklistAdd(address: PublicKey, reason: string): Promise<string> {
    this.blacklist.set(address.toBase58(), reason);
    return "blacklist-added";
  }

  public async blacklistRemove(address: PublicKey): Promise<string> {
    this.blacklist.delete(address.toBase58());
    return "blacklist-removed";
  }

  public async seize(fromAccount: PublicKey, toAccount: PublicKey): Promise<string> {
    return `seize:${fromAccount.toBase58()}:${toAccount.toBase58()}`;
  }

  public async submitProofReceipt(input: ComplianceProofInput): Promise<string> {
    const key = `${input.subject.toBase58()}:${input.nullifier}`;
    this.proofReceipts.set(key, input);
    return `proof-receipt:${key}`;
  }

  public async setCompressedStateRoot(root: string): Promise<string> {
    this.compressedStateRoot = root;
    return `compressed-root:${root}`;
  }
}

export class SolanaStablecoin {
  public readonly compliance: ComplianceClient;
  private readonly config: StablecoinConfigView;
  private readonly programId: PublicKey;
  private readonly mintAddress: PublicKey;
  private readonly configPda: PublicKey;
  private readonly transferHookProgramId: PublicKey | null;
  private readonly registryMetadata: RegistryMetadata;
  private readonly authorityPublicKey: PublicKey;
  private totalSupply = 0n;
  private readonly balances = new Map<string, bigint>();
  private paused = false;

  private constructor(
    private readonly connection: Connection,
    private readonly authority: TransactionAuthority,
    programId: PublicKey,
    mint: PublicKey,
    transferHookProgramId: PublicKey | null,
    config: StablecoinConfigView,
    registryMetadata: RegistryMetadata
  ) {
    const backend = new InMemoryComplianceBackend();
    this.programId = programId;
    this.mintAddress = mint;
    this.transferHookProgramId = transferHookProgramId;
    this.authorityPublicKey = resolvePublicKey(authority);
    this.configPda = PublicKey.findProgramAddressSync(
      [new TextEncoder().encode(STABLECOIN_CONFIG_SEED), mint.toBytes()],
      programId
    )[0];
    this.config = config;
    this.registryMetadata = registryMetadata;
    this.compliance = new ComplianceClient(
      config.enableTransferHook
        || config.enableZkComplianceProofs
        || config.enableCompressedComplianceState,
      backend
    );
  }

  public static async create(params: StablecoinCreateParams): Promise<SolanaStablecoin> {
    const normalized = normalizeCreateConfig(params);
    const config: StablecoinConfigView = toConfigView(normalized);
    const mint = params.mint instanceof Keypair ? params.mint.publicKey : (params.mint ?? Keypair.generate().publicKey);

    return new SolanaStablecoin(
      params.connection,
      params.authority,
      params.programId ?? FALLBACK_PROGRAM_ID,
      mint,
      coerceOptionalPubkey(params.transferHookProgramId ?? null),
      config,
      normalized.registryMetadata
    );
  }

  public static async connect(params: StablecoinConnectParams): Promise<SolanaStablecoin> {
    const programId = params.programId ?? FALLBACK_PROGRAM_ID;
    const configPda = PublicKey.findProgramAddressSync(
      [new TextEncoder().encode(STABLECOIN_CONFIG_SEED), params.mint.toBytes()],
      programId
    )[0];
    const config = await fetchStablecoinConfig(params.connection, configPda);

    return new SolanaStablecoin(
      params.connection,
      params.authority,
      programId,
      params.mint,
      coerceOptionalPubkey(config.transferHookProgramId),
      config,
      params.registryMetadata ?? {}
    );
  }

  public static async createOnChain(
    params: StablecoinCreateParams
  ): Promise<{ stablecoin: SolanaStablecoin; signature: string }> {
    if (!isKeypair(params.authority)) {
      throw new Error("CreateOnChainRequiresAuthorityKeypair");
    }
    const mint = params.mint ?? Keypair.generate();
    if (!(mint instanceof Keypair)) {
      throw new Error("CreateOnChainRequiresMintKeypair");
    }
    const mintAddress = mint instanceof Keypair ? mint.publicKey : mint;
    const stablecoin = await SolanaStablecoin.create({
      ...params,
      mint: mintAddress
    });

    const transaction = await stablecoin.buildInitializeTransaction();
    const signature = await signAndSendTransaction({
      connection: params.connection,
      transaction,
      signer: params.authority,
      extraSigners: mint instanceof Keypair ? [mint] : []
    });

    return { stablecoin, signature };
  }

  public getConnection(): Connection {
    return this.connection;
  }

  public getAuthority(): TransactionAuthority {
    return this.authority;
  }

  public getAuthorityPublicKey(): PublicKey {
    return this.authorityPublicKey;
  }

  public getProgramId(): PublicKey {
    return this.programId;
  }

  public getMintAddress(): PublicKey {
    return this.mintAddress;
  }

  public getConfigAddress(): PublicKey {
    return this.configPda;
  }

  public async getConfig(): Promise<StablecoinConfigView> {
    return { ...this.config, isPaused: this.paused };
  }

  public async getRegistryEntry(): Promise<StablecoinRegistryEntry> {
    const view = await this.getConfig();
    return buildStablecoinRegistryEntry({
      mint: this.mintAddress,
      config: this.configPda,
      authority: new PublicKey(view.authority),
      view,
      metadata: this.registryMetadata
    });
  }

  public async buildInitializeTransaction(): Promise<Transaction> {
    return buildTransaction(
      buildInstruction(this.programId, "initialize", encodeStablecoinInstruction("initialize", {
        name: this.config.name,
        symbol: this.config.symbol,
        uri: this.config.uri,
        decimals: this.config.decimals,
        standardVersion: this.config.standardVersion,
        enablePermanentDelegate: this.config.enablePermanentDelegate,
        enableTransferHook: this.config.enableTransferHook,
        defaultAccountFrozen: this.config.defaultAccountFrozen,
        enableConfidentialTransfers: this.config.enableConfidentialTransfers,
        enableZkComplianceProofs: this.config.enableZkComplianceProofs,
        enableCompressedComplianceState: this.config.enableCompressedComplianceState,
        transferHookProgramId: this.transferHookProgramId,
        proofVerifierProgramId: coerceOptionalPubkey(this.config.proofVerifierProgramId),
        compressedComplianceRoot: this.config.compressedComplianceRoot,
        complianceCircuit: this.config.complianceCircuit
      }), [
        writable(this.authorityPublicKey, true),
        writable(this.configPda),
        writable(this.mintAddress, true),
        readonly(TOKEN_2022_PROGRAM_ID),
        readonly(SystemProgram.programId),
        readonly(SYSVAR_RENT_PUBKEY)
      ])
    );
  }

  public async buildMintTransaction(params: MintParams): Promise<Transaction> {
    assertPositiveAmount(params.amount);
    const keys: AccountMeta[] = [
      writable(this.configPda),
      writable(this.mintAddress),
      writable(params.destination),
      readonly(resolvePublicKey(params.minter), true),
      readonly(TOKEN_2022_PROGRAM_ID),
      this.optionalRoleAssignmentMeta(resolvePublicKey(params.minter), "minter", true)
    ];
    return buildTransaction(
      buildInstruction(
        this.programId,
        "mint",
        encodeStablecoinInstruction("mint", { amount: params.amount }),
        keys
      )
    );
  }

  public async buildBurnTransaction(params: BurnParams): Promise<Transaction> {
    assertPositiveAmount(params.amount);
    const keys: AccountMeta[] = [
      writable(this.configPda),
      writable(this.mintAddress),
      writable(params.source),
      readonly(resolvePublicKey(params.burner), true),
      readonly(TOKEN_2022_PROGRAM_ID),
      this.optionalRoleAssignmentMeta(resolvePublicKey(params.burner), "burner")
    ];
    return buildTransaction(
      buildInstruction(
        this.programId,
        "burn",
        encodeStablecoinInstruction("burn", { amount: params.amount }),
        keys
      )
    );
  }

  public async buildPauseTransaction(nextPausedState: boolean): Promise<Transaction> {
    const keys: AccountMeta[] = [
      writable(this.configPda),
      readonly(this.authorityPublicKey, true),
      this.optionalRoleAssignmentMeta(this.authorityPublicKey, "pauser")
    ];
    return buildTransaction(
      buildInstruction(
        this.programId,
        nextPausedState ? "pause" : "unpause",
        encodeStablecoinInstruction(nextPausedState ? "pause" : "unpause", {}),
        keys
      )
    );
  }

  public async buildFreezeTransaction(address: PublicKey, thaw = false): Promise<Transaction> {
    const keys: AccountMeta[] = [
      writable(this.configPda),
      writable(this.mintAddress),
      writable(address),
      readonly(this.authorityPublicKey, true),
      readonly(TOKEN_2022_PROGRAM_ID),
      this.optionalRoleAssignmentMeta(this.authorityPublicKey, "pauser")
    ];
    return buildTransaction(
      buildInstruction(
        this.programId,
        thaw ? "thaw_account" : "freeze_account",
        encodeStablecoinInstruction(thaw ? "thaw_account" : "freeze_account", { address }),
        keys
      )
    );
  }

  public async buildSeizeTransaction(params: SeizeParams): Promise<Transaction> {
    const keys: AccountMeta[] = [
      writable(this.configPda),
      readonly(resolvePublicKey(params.seizer), true),
      writable(this.mintAddress),
      writable(params.fromAccount),
      writable(params.toAccount),
      readonly(TOKEN_2022_PROGRAM_ID),
      this.optionalRoleAssignmentMeta(resolvePublicKey(params.seizer), "seizer")
    ];
    keys.push(...await this.buildSeizeTransferHookMetas(params));
    return buildTransaction(
      buildInstruction(
        this.programId,
        "seize",
        encodeStablecoinInstruction("seize", {}),
        keys
      )
    );
  }

  public async buildBlacklistAddTransaction(params: BlacklistAddParams): Promise<Transaction> {
    assertValidReason(params.reason);
    const blacklistEntry = PublicKey.findProgramAddressSync(
      [
        new TextEncoder().encode(BLACKLIST_ENTRY_SEED),
        this.mintAddress.toBytes(),
        params.address.toBytes()
      ],
      this.programId
    )[0];
    const keys: AccountMeta[] = [
      writable(this.configPda),
      readonly(this.authorityPublicKey, true),
      readonly(this.mintAddress),
      writable(blacklistEntry),
      readonly(SystemProgram.programId),
      this.optionalRoleAssignmentMeta(this.authorityPublicKey, "blacklister")
    ];
    return buildTransaction(
      buildInstruction(
        this.programId,
        "add_to_blacklist",
        encodeStablecoinInstruction("add_to_blacklist", {
          address: params.address,
          reason: params.reason
        }),
        keys
      )
    );
  }

  public async buildBlacklistRemoveTransaction(address: PublicKey): Promise<Transaction> {
    const blacklistEntry = PublicKey.findProgramAddressSync(
      [
        new TextEncoder().encode(BLACKLIST_ENTRY_SEED),
        this.mintAddress.toBytes(),
        address.toBytes()
      ],
      this.programId
    )[0];
    const keys: AccountMeta[] = [
      writable(this.configPda),
      readonly(this.authorityPublicKey, true),
      readonly(this.mintAddress),
      writable(blacklistEntry),
      this.optionalRoleAssignmentMeta(this.authorityPublicKey, "blacklister")
    ];
    return buildTransaction(
      buildInstruction(
        this.programId,
        "remove_from_blacklist",
        encodeStablecoinInstruction("remove_from_blacklist", {}),
        keys
      )
    );
  }

  public async buildUpdateRoleTransaction(params: UpdateRoleParams): Promise<Transaction> {
    const roleAssignment = this.roleAssignmentPda(params.holder, params.role);
    return buildTransaction(
      buildInstruction(
        this.programId,
        "update_roles",
        encodeStablecoinInstruction("update_roles", {
          holder: params.holder,
          role: params.role,
          isActive: params.isActive,
          mintQuota: params.mintQuota ?? null
        }),
        [
          writable(this.configPda),
          readonly(this.authorityPublicKey, true),
          readonly(this.mintAddress),
          writable(roleAssignment),
          readonly(SystemProgram.programId)
        ]
      )
    );
  }

  public async buildUpdateComplianceRootTransaction(root: string): Promise<Transaction> {
    return buildTransaction(
      buildInstruction(
        this.programId,
        "update_compliance_root",
        encodeStablecoinInstruction("update_compliance_root", { root }),
        [writable(this.configPda), readonly(this.authorityPublicKey, true)]
      )
    );
  }

  public async buildSubmitProofReceiptTransaction(
    params: SubmitProofReceiptParams
  ): Promise<Transaction> {
    const proofReceipt = findProofReceiptPda(this.mintAddress, params.subject, this.programId);
    const transaction = new Transaction().add(
      ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 }),
      buildInstruction(
        this.programId,
        "submit_proof_receipt",
        encodeStablecoinInstruction("submit_proof_receipt", {
          subject: params.subject,
          commitment: params.commitment,
          proofCommitment: params.proofCommitment,
          response: params.response,
          merkleSiblings: params.merkleSiblings,
          merkleDirections: params.merkleDirections,
          circuit: params.circuit,
          expiresAtSlot: params.expiresAtSlot
        }),
        [
          writable(this.configPda),
          writable(this.authorityPublicKey, true),
          readonly(this.mintAddress),
          writable(proofReceipt),
          readonly(SystemProgram.programId)
        ]
      )
    );
    return transaction;
  }

  public async buildRevokeProofReceiptTransaction(subject: PublicKey): Promise<Transaction> {
    const proofReceipt = findProofReceiptPda(this.mintAddress, subject, this.programId);
    return buildTransaction(
      buildInstruction(
        this.programId,
        "revoke_proof_receipt",
        encodeStablecoinInstruction("revoke_proof_receipt", {}),
        [
          writable(this.configPda),
          readonly(this.authorityPublicKey, true),
          readonly(this.mintAddress),
          writable(proofReceipt)
        ]
      )
    );
  }

  public async buildInitializeTransferHookMetaListTransaction(
    transferHookProgramId = this.transferHookProgramId
  ): Promise<Transaction> {
    if (!transferHookProgramId) {
      throw new Error("MissingTransferHookProgramId");
    }
    return buildTransaction(
      buildInitializeExtraAccountMetaListInstruction({
        payer: this.authorityPublicKey,
        mint: this.mintAddress,
        transferHookProgramId
      })
    );
  }

  public async buildAuthorityTransferTransaction(nextAuthority: PublicKey): Promise<Transaction> {
    return buildTransaction(
      buildInstruction(
        this.programId,
        "propose_authority",
        encodeStablecoinInstruction("propose_authority", { pending: nextAuthority }),
        [
          writable(this.configPda),
          readonly(this.authorityPublicKey, true)
        ]
      )
    );
  }

  public async mint(params: MintParams): Promise<string> {
    this.assertNotPaused();
    await this.buildMintTransaction(params);
    const key = params.destination.toBase58();
    const current = this.balances.get(key) ?? 0n;
    this.balances.set(key, current + params.amount);
    this.totalSupply += params.amount;
    return `mint:${key}:${params.amount.toString()}`;
  }

  public async burn(params: BurnParams): Promise<string> {
    this.assertNotPaused();
    await this.buildBurnTransaction(params);
    this.totalSupply = this.totalSupply >= params.amount ? this.totalSupply - params.amount : 0n;
    return `burn:${params.amount.toString()}`;
  }

  public async freeze(address: PublicKey): Promise<string> {
    this.assertNotPaused();
    await this.buildFreezeTransaction(address, false);
    return "freeze";
  }

  public async thaw(address: PublicKey): Promise<string> {
    this.assertNotPaused();
    await this.buildFreezeTransaction(address, true);
    return "thaw";
  }

  public async pause(): Promise<string> {
    await this.buildPauseTransaction(true);
    this.paused = true;
    return "pause";
  }

  public async unpause(): Promise<string> {
    await this.buildPauseTransaction(false);
    this.paused = false;
    return "unpause";
  }

  public async seize(params: SeizeParams): Promise<string> {
    await this.buildSeizeTransaction(params);
    return this.compliance.seize(params.fromAccount, params.toAccount);
  }

  public async blacklistAdd(params: BlacklistAddParams): Promise<string> {
    await this.buildBlacklistAddTransaction(params);
    return this.compliance.blacklistAdd(params.address, params.reason);
  }

  public async blacklistRemove(address: PublicKey): Promise<string> {
    await this.buildBlacklistRemoveTransaction(address);
    return this.compliance.blacklistRemove(address);
  }

  public async getTotalSupply(): Promise<bigint> {
    return this.totalSupply;
  }

  public async mintOnChain(params: MintParams): Promise<string> {
    if (!isKeypair(params.minter)) {
      throw new Error("MintOnChainRequiresSignerKeypair");
    }
    const transaction = await this.buildMintTransaction(params);
    return this.sendTransaction(transaction, [params.minter]);
  }

  public async burnOnChain(params: BurnParams): Promise<string> {
    if (!isKeypair(params.burner)) {
      throw new Error("BurnOnChainRequiresSignerKeypair");
    }
    const transaction = await this.buildBurnTransaction(params);
    return this.sendTransaction(transaction, [params.burner]);
  }

  public async pauseOnChain(nextPausedState: boolean): Promise<string> {
    if (!isKeypair(this.authority)) {
      throw new Error("PauseOnChainRequiresAuthorityKeypair");
    }
    const transaction = await this.buildPauseTransaction(nextPausedState);
    return this.sendTransaction(transaction, [this.authority]);
  }

  public async freezeOnChain(address: PublicKey, thaw = false): Promise<string> {
    if (!isKeypair(this.authority)) {
      throw new Error("FreezeOnChainRequiresAuthorityKeypair");
    }
    const transaction = await this.buildFreezeTransaction(address, thaw);
    return this.sendTransaction(transaction, [this.authority]);
  }

  public async seizeOnChain(params: SeizeParams): Promise<string> {
    if (!isKeypair(params.seizer)) {
      throw new Error("SeizeOnChainRequiresSignerKeypair");
    }
    const transaction = await this.buildSeizeTransaction(params);
    return this.sendTransaction(transaction, [params.seizer]);
  }

  public async blacklistAddOnChain(params: BlacklistAddParams): Promise<string> {
    if (!isKeypair(this.authority)) {
      throw new Error("BlacklistAddOnChainRequiresAuthorityKeypair");
    }
    const transaction = await this.buildBlacklistAddTransaction(params);
    return this.sendTransaction(transaction, [this.authority]);
  }

  public async blacklistRemoveOnChain(address: PublicKey): Promise<string> {
    if (!isKeypair(this.authority)) {
      throw new Error("BlacklistRemoveOnChainRequiresAuthorityKeypair");
    }
    const transaction = await this.buildBlacklistRemoveTransaction(address);
    return this.sendTransaction(transaction, [this.authority]);
  }

  public async updateRoleOnChain(params: UpdateRoleParams): Promise<string> {
    if (!isKeypair(this.authority)) {
      throw new Error("UpdateRoleOnChainRequiresAuthorityKeypair");
    }
    const transaction = await this.buildUpdateRoleTransaction(params);
    return this.sendTransaction(transaction, [this.authority]);
  }

  public async updateComplianceRootOnChain(root: string): Promise<string> {
    if (!isKeypair(this.authority)) {
      throw new Error("UpdateComplianceRootOnChainRequiresAuthorityKeypair");
    }
    const transaction = await this.buildUpdateComplianceRootTransaction(root);
    const signature = await this.sendTransaction(transaction, [this.authority]);
    this.config.compressedComplianceRoot = root;
    this.config.configHash = computeStablecoinConfigHash(this.config);
    return signature;
  }

  public async submitProofReceiptOnChain(params: SubmitProofReceiptParams): Promise<string> {
    if (!isKeypair(this.authority)) {
      throw new Error("SubmitProofReceiptOnChainRequiresAuthorityKeypair");
    }
    const transaction = await this.buildSubmitProofReceiptTransaction(params);
    return this.sendTransaction(transaction, [this.authority]);
  }

  public async revokeProofReceiptOnChain(subject: PublicKey): Promise<string> {
    if (!isKeypair(this.authority)) {
      throw new Error("RevokeProofReceiptOnChainRequiresAuthorityKeypair");
    }
    const transaction = await this.buildRevokeProofReceiptTransaction(subject);
    return this.sendTransaction(transaction, [this.authority]);
  }

  public async initializeTransferHookMetaListOnChain(
    transferHookProgramId = this.transferHookProgramId
  ): Promise<string> {
    if (!isKeypair(this.authority)) {
      throw new Error("InitializeTransferHookMetaListOnChainRequiresAuthorityKeypair");
    }
    const transaction = await this.buildInitializeTransferHookMetaListTransaction(
      transferHookProgramId
    );
    return this.sendTransaction(transaction, [this.authority]);
  }

  private assertNotPaused(): void {
    if (this.paused) {
      throw new Error("Paused");
    }
  }

  private roleAssignmentPda(holder: PublicKey, role: UpdateRoleParams["role"]): PublicKey {
    return PublicKey.findProgramAddressSync(
      [
        new TextEncoder().encode("role"),
        this.mintAddress.toBytes(),
        Uint8Array.from([roleDiscriminator(role)]),
        holder.toBytes()
      ],
      this.programId
    )[0];
  }

  private roleAssignmentMeta(
    holder: PublicKey,
    role: UpdateRoleParams["role"],
    isWritable = false
  ): AccountMeta[] {
    if (holder.toBase58() === this.config.authority) {
      return [];
    }

    const account = this.roleAssignmentPda(holder, role);
    return [isWritable ? writable(account) : readonly(account)];
  }

  private optionalRoleAssignmentMeta(
    holder: PublicKey,
    role: UpdateRoleParams["role"],
    isWritable = false
  ): AccountMeta {
    const meta = this.roleAssignmentMeta(holder, role, isWritable)[0];
    return meta ?? readonly(this.programId);
  }

  private async buildSeizeTransferHookMetas(params: SeizeParams): Promise<AccountMeta[]> {
    if (!this.transferHookProgramId) {
      return [];
    }

    try {
      const [fromAccount, toAccount] = await Promise.all([
        getAccount(this.connection, params.fromAccount, "confirmed", TOKEN_2022_PROGRAM_ID),
        getAccount(this.connection, params.toAccount, "confirmed", TOKEN_2022_PROGRAM_ID)
      ]);
      const metaList = findTransferHookMetaListPda(this.mintAddress, this.transferHookProgramId);
      const sourceBlacklist = PublicKey.findProgramAddressSync(
        [
          new TextEncoder().encode(BLACKLIST_ENTRY_SEED),
          this.mintAddress.toBytes(),
          fromAccount.owner.toBytes()
        ],
        this.programId
      )[0];
      const sourceProofReceipt = findProofReceiptPda(
        this.mintAddress,
        fromAccount.owner,
        this.programId
      );
      const destinationBlacklist = PublicKey.findProgramAddressSync(
        [
          new TextEncoder().encode(BLACKLIST_ENTRY_SEED),
          this.mintAddress.toBytes(),
          toAccount.owner.toBytes()
        ],
        this.programId
      )[0];
      const destinationProofReceipt = findProofReceiptPda(
        this.mintAddress,
        toAccount.owner,
        this.programId
      );

      return [
        readonly(this.programId),
        readonly(this.configPda),
        readonly(sourceBlacklist),
        readonly(sourceProofReceipt),
        readonly(destinationBlacklist),
        readonly(destinationProofReceipt),
        readonly(this.transferHookProgramId),
        readonly(metaList)
      ];
    } catch {
      return [];
    }
  }

  private async sendTransaction(transaction: Transaction, signers: Keypair[]): Promise<string> {
    return signAndSendTransaction({
      connection: this.connection,
      transaction,
      signer: signers[0],
      extraSigners: signers.slice(1),
      commitment: "confirmed"
    });
  }
}
