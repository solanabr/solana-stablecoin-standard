import {
  Connection,
  Keypair,
  PublicKey,
  Signer,
  SystemProgram,
  Transaction,
} from '@solana/web3.js';
import {
  ExtensionType,
  TOKEN_2022_PROGRAM_ID as SPL_TOKEN_2022_PROGRAM_ID,
  createInitializeMintInstruction,
  createInitializeMintCloseAuthorityInstruction,
  createInitializePermanentDelegateInstruction,
  createInitializeTransferHookInstruction,
  getMintLen,
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddressSync,
  createMintToInstruction,
  createBurnInstruction,
  createFreezeAccountInstruction,
  createThawAccountInstruction,
} from '@solana/spl-token';
import { AnchorProvider, Program, BN, Idl } from '@coral-xyz/anchor';
import { SSS_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from './constants';
import {
  findStablecoinConfigPda,
  findRolesConfigPda,
  findBlacklistEntryPda,
} from './pda';
import {
  StablecoinPreset,
  InitializeParams,
  UpdateRolesParams,
  StablecoinConfig,
  RolesConfig,
  BlacklistEntry,
  InitializeResult,
} from './types';

/**
 * SssClient — main entry point for interacting with the Solana Stablecoin Standard.
 *
 * @example
 * ```ts
 * const client = new SssClient(provider);
 *
 * // Initialize SSS-1 (minimal stablecoin)
 * const result = await client.initialize({
 *   name: 'My Stablecoin',
 *   symbol: 'MYUSD',
 *   uri: 'https://example.com/metadata.json',
 *   preset: StablecoinPreset.SSS1,
 * });
 *
 * // Mint tokens
 * await client.mint(result.mint, recipientAta, new BN(1_000_000));
 * ```
 */
export class SssClient {
  private program: Program;
  private connection: Connection;
  private provider: AnchorProvider;

  constructor(provider: AnchorProvider, programId = SSS_PROGRAM_ID) {
    this.provider = provider;
    this.connection = provider.connection;
    // Program initialized lazily with IDL
    this.program = new Program(require('../idl/solana_stablecoin_standard.json') as Idl, provider);
  }

  // ─── Initialization ──────────────────────────────────────────────────────

  /**
   * Create a new Token-2022 mint with SSS configuration.
   * This handles:
   * 1. Allocating the mint account with the right extensions
   * 2. Initializing all required Token-2022 extensions
   * 3. Calling the SSS `initialize` instruction to set up PDAs
   */
  async initialize(params: InitializeParams): Promise<InitializeResult> {
    const authority = this.provider.wallet.publicKey;
    const mintKeypair = Keypair.generate();
    const mint = mintKeypair.publicKey;

    // Determine required extensions based on preset
    const extensions: ExtensionType[] = [
      ExtensionType.MintCloseAuthority,
      ExtensionType.MetadataPointer,
    ];
    if (params.preset === StablecoinPreset.SSS2) {
      extensions.push(ExtensionType.PermanentDelegate);
      extensions.push(ExtensionType.TransferHook);
    }

    const mintLen = getMintLen(extensions);
    const lamports = await this.connection.getMinimumBalanceForRentExemption(mintLen);
    const decimals = params.decimals ?? 6;

    // Build mint creation transaction
    const createMintTx = new Transaction();

    // 1. Create mint account
    createMintTx.add(
      SystemProgram.createAccount({
        fromPubkey: authority,
        newAccountPubkey: mint,
        space: mintLen,
        lamports,
        programId: SPL_TOKEN_2022_PROGRAM_ID,
      }),
    );

    // 2. Initialize extensions BEFORE the mint
    createMintTx.add(
      createInitializeMintCloseAuthorityInstruction(mint, authority, SPL_TOKEN_2022_PROGRAM_ID),
    );

    if (params.preset === StablecoinPreset.SSS2) {
      // Permanent delegate = seizer (or authority by default)
      const seizer = params.seizer ?? authority;
      createMintTx.add(
        createInitializePermanentDelegateInstruction(mint, seizer, SPL_TOKEN_2022_PROGRAM_ID),
      );
      // Transfer hook: set to system program as placeholder (override with actual hook program)
      createMintTx.add(
        createInitializeTransferHookInstruction(
          mint,
          authority,
          SystemProgram.programId, // placeholder — replace with actual hook program
          SPL_TOKEN_2022_PROGRAM_ID,
        ),
      );
    }

    // 3. Initialize the mint itself
    createMintTx.add(
      createInitializeMintInstruction(
        mint,
        decimals,
        authority, // mint authority
        authority, // freeze authority
        SPL_TOKEN_2022_PROGRAM_ID,
      ),
    );

    // Send mint creation tx
    const mintSig = await this.provider.sendAndConfirm(createMintTx, [mintKeypair]);

    // 4. Call SSS initialize instruction
    const [stablecoinConfig] = findStablecoinConfigPda(mint);
    const [rolesConfig] = findRolesConfigPda(mint);

    const initSig = await this.program.methods
      .initialize({
        name: params.name,
        symbol: params.symbol,
        uri: params.uri,
        decimals,
        maxSupply: params.maxSupply ?? new BN(0),
        preset: params.preset,
        minter: params.minter ?? null,
        minterQuota: params.minterQuota ?? new BN(0),
        burner: params.burner ?? null,
        blacklister: params.blacklister ?? null,
        pauser: params.pauser ?? null,
        seizer: params.seizer ?? null,
      })
      .accounts({
        authority,
        mint,
        stablecoinConfig,
        rolesConfig,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    return { mint, stablecoinConfig, rolesConfig, signature: initSig };
  }

  // ─── Token Operations ────────────────────────────────────────────────────

  /**
   * Mint tokens to a recipient's associated token account.
   * Caller must be the authorized minter.
   */
  async mint(mint: PublicKey, destination: PublicKey, amount: BN): Promise<string> {
    const minter = this.provider.wallet.publicKey;
    const [stablecoinConfig] = findStablecoinConfigPda(mint);
    const [rolesConfig] = findRolesConfigPda(mint);

    return this.program.methods
      .mintTokens(amount)
      .accounts({
        minter,
        mint,
        stablecoinConfig,
        rolesConfig,
        destination,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();
  }

  /**
   * Burn tokens from a source account.
   * Caller must be the authorized burner.
   */
  async burn(mint: PublicKey, source: PublicKey, amount: BN): Promise<string> {
    const burner = this.provider.wallet.publicKey;
    const [stablecoinConfig] = findStablecoinConfigPda(mint);
    const [rolesConfig] = findRolesConfigPda(mint);

    return this.program.methods
      .burnTokens(amount)
      .accounts({
        burner,
        mint,
        stablecoinConfig,
        rolesConfig,
        source,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();
  }

  /**
   * Freeze a token account.
   * Caller must be master_authority or pauser.
   */
  async freeze(mint: PublicKey, tokenAccount: PublicKey): Promise<string> {
    const authority = this.provider.wallet.publicKey;
    const [stablecoinConfig] = findStablecoinConfigPda(mint);
    const [rolesConfig] = findRolesConfigPda(mint);

    return this.program.methods
      .freezeAccount()
      .accounts({
        authority,
        mint,
        stablecoinConfig,
        rolesConfig,
        tokenAccount,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();
  }

  /**
   * Unfreeze a token account.
   * Caller must be master_authority or pauser.
   */
  async thaw(mint: PublicKey, tokenAccount: PublicKey): Promise<string> {
    const authority = this.provider.wallet.publicKey;
    const [stablecoinConfig] = findStablecoinConfigPda(mint);
    const [rolesConfig] = findRolesConfigPda(mint);

    return this.program.methods
      .thawAccount()
      .accounts({
        authority,
        mint,
        stablecoinConfig,
        rolesConfig,
        tokenAccount,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();
  }

  /**
   * Pause all transfers globally.
   * Caller must be pauser or master_authority.
   */
  async pause(mint: PublicKey): Promise<string> {
    const authority = this.provider.wallet.publicKey;
    const [stablecoinConfig] = findStablecoinConfigPda(mint);
    const [rolesConfig] = findRolesConfigPda(mint);

    return this.program.methods
      .pause()
      .accounts({ authority, mint, stablecoinConfig, rolesConfig })
      .rpc();
  }

  /**
   * Unpause transfers.
   * Caller must be pauser or master_authority.
   */
  async unpause(mint: PublicKey): Promise<string> {
    const authority = this.provider.wallet.publicKey;
    const [stablecoinConfig] = findStablecoinConfigPda(mint);
    const [rolesConfig] = findRolesConfigPda(mint);

    return this.program.methods
      .unpause()
      .accounts({ authority, mint, stablecoinConfig, rolesConfig })
      .rpc();
  }

  // ─── SSS-2 Compliance ────────────────────────────────────────────────────

  /**
   * Add an address to the blacklist (SSS-2 only).
   * Caller must be blacklister or master_authority.
   */
  async addToBlacklist(mint: PublicKey, target: PublicKey, reason = 0): Promise<string> {
    const authority = this.provider.wallet.publicKey;
    const [stablecoinConfig] = findStablecoinConfigPda(mint);
    const [rolesConfig] = findRolesConfigPda(mint);
    const [blacklistEntry] = findBlacklistEntryPda(mint, target);

    return this.program.methods
      .addToBlacklist(target, reason)
      .accounts({
        authority,
        mint,
        stablecoinConfig,
        rolesConfig,
        blacklistEntry,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
  }

  /**
   * Remove an address from the blacklist (SSS-2 only).
   * Caller must be blacklister or master_authority.
   */
  async removeFromBlacklist(mint: PublicKey, target: PublicKey): Promise<string> {
    const authority = this.provider.wallet.publicKey;
    const [stablecoinConfig] = findStablecoinConfigPda(mint);
    const [rolesConfig] = findRolesConfigPda(mint);
    const [blacklistEntry] = findBlacklistEntryPda(mint, target);

    return this.program.methods
      .removeFromBlacklist(target)
      .accounts({
        authority,
        mint,
        stablecoinConfig,
        rolesConfig,
        blacklistEntry,
      })
      .rpc();
  }

  /**
   * Check if an address is blacklisted.
   */
  async isBlacklisted(mint: PublicKey, address: PublicKey): Promise<boolean> {
    const [pda] = findBlacklistEntryPda(mint, address);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const entry = await (this.program.account as any).blacklistEntry.fetch(pda);
      return entry !== null;
    } catch {
      return false;
    }
  }

  /**
   * Seize tokens from a holder using permanent delegate (SSS-2 only).
   * Caller must be seizer or master_authority.
   */
  async seize(mint: PublicKey, source: PublicKey, destination: PublicKey, amount: BN): Promise<string> {
    const seizer = this.provider.wallet.publicKey;
    const [stablecoinConfig] = findStablecoinConfigPda(mint);
    const [rolesConfig] = findRolesConfigPda(mint);

    return this.program.methods
      .seize(amount)
      .accounts({
        seizer,
        mint,
        stablecoinConfig,
        rolesConfig,
        source,
        destination,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();
  }

  // ─── Administration ──────────────────────────────────────────────────────

  /**
   * Update one or more roles.
   * Caller must be master_authority.
   */
  async updateRoles(mint: PublicKey, params: UpdateRolesParams): Promise<string> {
    const authority = this.provider.wallet.publicKey;
    const [stablecoinConfig] = findStablecoinConfigPda(mint);
    const [rolesConfig] = findRolesConfigPda(mint);

    return this.program.methods
      .updateRoles({
        newMinter: params.newMinter ?? null,
        newBurner: params.newBurner ?? null,
        newBlacklister: params.newBlacklister ?? null,
        newPauser: params.newPauser ?? null,
        newSeizer: params.newSeizer ?? null,
        newMinterQuota: params.newMinterQuota ?? null,
      })
      .accounts({
        authority,
        mint,
        stablecoinConfig,
        rolesConfig,
      })
      .rpc();
  }

  /**
   * Transfer master authority to a new address.
   * This is irreversible — the current authority loses all control.
   */
  async transferAuthority(mint: PublicKey, newAuthority: PublicKey): Promise<string> {
    const currentAuthority = this.provider.wallet.publicKey;
    const [stablecoinConfig] = findStablecoinConfigPda(mint);
    const [rolesConfig] = findRolesConfigPda(mint);

    return this.program.methods
      .transferAuthority(newAuthority)
      .accounts({
        currentAuthority,
        mint,
        stablecoinConfig,
        rolesConfig,
      })
      .rpc();
  }

  // ─── Read Methods ────────────────────────────────────────────────────────

  /** Fetch the StablecoinConfig account for a given mint */
  async getConfig(mint: PublicKey): Promise<StablecoinConfig> {
    const [pda] = findStablecoinConfigPda(mint);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (this.program.account as any).stablecoinConfig.fetch(pda) as Promise<StablecoinConfig>;
  }

  /** Fetch the RolesConfig account for a given mint */
  async getRoles(mint: PublicKey): Promise<RolesConfig> {
    const [pda] = findRolesConfigPda(mint);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (this.program.account as any).rolesConfig.fetch(pda) as Promise<RolesConfig>;
  }

  /** Get the total supply of a Token-2022 mint */
  async getTotalSupply(mint: PublicKey): Promise<bigint> {
    const mintInfo = await this.connection.getTokenSupply(mint);
    return BigInt(mintInfo.value.amount);
  }

  /** Get or create the associated token account for an owner */
  async getOrCreateAta(mint: PublicKey, owner: PublicKey): Promise<PublicKey> {
    const ata = getAssociatedTokenAddressSync(mint, owner, false, SPL_TOKEN_2022_PROGRAM_ID);
    const info = await this.connection.getAccountInfo(ata);
    if (!info) {
      const tx = new Transaction().add(
        createAssociatedTokenAccountInstruction(
          this.provider.wallet.publicKey,
          ata,
          owner,
          mint,
          SPL_TOKEN_2022_PROGRAM_ID,
        ),
      );
      await this.provider.sendAndConfirm(tx);
    }
    return ata;
  }
}
