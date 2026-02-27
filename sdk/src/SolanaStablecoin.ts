import { Connection, PublicKey, Keypair, Transaction } from "@solana/web3.js";
import { BN, Program, AnchorProvider, web3 } from "@coral-xyz/anchor";
import {
  SSS_TOKEN_PROGRAM_ID,
  SSS_TRANSFER_HOOK_PROGRAM_ID,
  StablecoinState,
  RoleAccount,
  MinterInfo,
  SDKResult,
  ROLE_MASTER,
  ROLE_MINTER,
  ROLE_BURNER,
  ROLE_PAUSER,
} from "./types";
import { SssToken } from "./types/idl/sss_token";
import { SssTransferHook } from "./types/idl/sss_transfer_hook";
import {
  ExtensionType,
  getMintLen,
  createInitializeMintInstruction,
  createInitializeTransferHookInstruction,
  createInitializePermanentDelegateInstruction,
  createInitializeMintCloseAuthorityInstruction,
  createInitializeDefaultAccountStateInstruction,
  TOKEN_2022_PROGRAM_ID,
} from "@solana/spl-token";
import * as anchor from "@coral-xyz/anchor";

// Token-2022 confidential transfer feature is still new in spl-token, manually build the init ix
const createInitializeConfidentialTransferMintInstruction = (
  mint: PublicKey,
  authority: PublicKey,
  autoApproveNewAccounts: PublicKey,
  programId: PublicKey
) => {
  // Instruction layout for InitializeConfidentialTransferMint
  // 0 : Instruction offset
  // 1 : 
  // [Pubkey]
  // [Pubkey]
  const data = Buffer.alloc(1 + 32 + 32);
  data.writeUInt8(27, 0); // InitializeConfidentialTransferMint = 27
  authority.toBuffer().copy(data, 1);
  autoApproveNewAccounts.toBuffer().copy(data, 33);

  return new TransactionInstruction({
    keys: [{ pubkey: mint, isSigner: false, isWritable: true }],
    programId,
    data,
  });
};

import { TransactionInstruction } from "@solana/web3.js";

/**
 * Core SDK for managing SSS-1 and SSS-2 stablecoins
 *
 * Usage:
 * ```typescript
 * const sdk = new SolanaStablecoin(connection, wallet);
 *
 * // Initialize SSS-1
 * const { mint, stablecoin } = await sdk.initialize({
 *   name: 'My USD',
 *   symbol: 'MUSD',
 *   decimals: 6,
 *   authority: keypair,
 * });
 *
 * // Mint tokens
 * await sdk.mint({
 *   stablecoin,
 *   minter: keypair,
 *   recipient: userPublicKey,
 *   amount: new BN(1000000),
 * });
 * ```
 */
export class SolanaStablecoin {
  private connection: Connection;
  private provider: AnchorProvider;
  private program: Program<SssToken>;
  private hookProgram: Program<SssTransferHook>;

  constructor(
    connection: Connection,
    wallet: anchor.Wallet,
    programId?: PublicKey,
    hookProgramId?: PublicKey
  ) {
    this.connection = connection;
    this.provider = new AnchorProvider(connection, wallet, {
      commitment: "confirmed",
    });

    // Initialize programs with IDs
    const tokenProgramId = programId || SSS_TOKEN_PROGRAM_ID;
    const transferHookId = hookProgramId || SSS_TRANSFER_HOOK_PROGRAM_ID;

    this.program = new Program(
      require("../target/idl/sss_token.json"),
      this.provider
    ) as unknown as Program<SssToken>;
    this.hookProgram = new Program(
      require("../target/idl/sss_transfer_hook.json"),
      this.provider
    ) as unknown as Program<SssTransferHook>;
  }

  /**
   * Get stablecoin state PDA
   */
  getStablecoinPDA(mint: PublicKey): PublicKey {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("stablecoin"), mint.toBuffer()],
      this.program.programId
    )[0];
  }

  /**
   * Get role account PDA
   */
  getRolePDA(owner: PublicKey, mint: PublicKey): PublicKey {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("role"), owner.toBuffer(), mint.toBuffer()],
      this.program.programId
    )[0];
  }

  /**
   * Get minter info PDA
   */
  getMinterPDA(minter: PublicKey, mint: PublicKey): PublicKey {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("minter"), minter.toBuffer(), mint.toBuffer()],
      this.program.programId
    )[0];
  }

  /**
   * Get mint authority PDA
   */
  getMintAuthorityPDA(stablecoinPDA: PublicKey): PublicKey {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("mint_authority"), stablecoinPDA.toBuffer()],
      this.program.programId
    )[0];
  }

  /**
   * Get burn authority PDA
   */
  getBurnAuthorityPDA(stablecoinPDA: PublicKey): PublicKey {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("burn_authority"), stablecoinPDA.toBuffer()],
      this.program.programId
    )[0];
  }

  /**
   * Get freeze authority PDA
   */
  getFreezeAuthorityPDA(stablecoinPDA: PublicKey): PublicKey {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("freeze_authority"), stablecoinPDA.toBuffer()],
      this.program.programId
    )[0];
  }

  /**
   * Initialize a new stablecoin (SSS-1 or SSS-2)
   */
  async initialize(params: {
    name: string;
    symbol: string;
    decimals: number;
    authority: Keypair;
    enableTransferHook?: boolean;
    enablePermanentDelegate?: boolean;
    enableConfidentialTransfers?: boolean;
    enableMintCloseAuthority?: boolean;
    enableDefaultAccountState?: boolean;
  }): Promise<
    SDKResult<{ mint: PublicKey; stablecoin: PublicKey; signature: string }>
  > {
    try {
      const {
        name,
        symbol,
        decimals,
        authority,
        enableTransferHook = false,
        enablePermanentDelegate = false,
        enableConfidentialTransfers = false,
        enableMintCloseAuthority = false,
        enableDefaultAccountState = false,
      } = params;

      if (name.length > 32)
        throw new Error("Name must be 32 characters or less");
      if (symbol.length > 10)
        throw new Error("Symbol must be 10 characters or less");
      if (decimals > 9) throw new Error("Decimals must be 9 or less");

      const mintKeypair = Keypair.generate();
      const stablecoin = this.getStablecoinPDA(mintKeypair.publicKey);
      const masterRole = this.getRolePDA(
        authority.publicKey,
        mintKeypair.publicKey
      );

      const extensions: ExtensionType[] = [];
      if (enableConfidentialTransfers)
        extensions.push(ExtensionType.ConfidentialTransferMint);
      if (enableTransferHook) extensions.push(ExtensionType.TransferHook);
      if (enablePermanentDelegate)
        extensions.push(ExtensionType.PermanentDelegate);
      if (enableMintCloseAuthority)
        extensions.push(ExtensionType.MintCloseAuthority);
      if (enableDefaultAccountState)
        extensions.push(ExtensionType.DefaultAccountState);

      const mintLen = getMintLen(extensions);
      const lamports = await this.connection.getMinimumBalanceForRentExemption(
        mintLen
      );

      // SSS-2 Config PDA is the transfer hook program ID
      const [configPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("config"), authority.publicKey.toBuffer()],
        this.hookProgram.programId
      );

      const mintAuthorityPDA = this.getMintAuthorityPDA(stablecoin);

      const tx = new Transaction();

      tx.add(
        web3.SystemProgram.createAccount({
          fromPubkey: authority.publicKey,
          newAccountPubkey: mintKeypair.publicKey,
          space: mintLen,
          lamports,
          programId: TOKEN_2022_PROGRAM_ID,
        })
      );

      if (enableConfidentialTransfers) {
        tx.add(
          createInitializeConfidentialTransferMintInstruction(
            mintKeypair.publicKey,
            authority.publicKey,
            mintKeypair.publicKey, // Auto-approve new accounts? Usually self
            TOKEN_2022_PROGRAM_ID
          )
        );
      }

      if (enableTransferHook) {
        tx.add(
          createInitializeTransferHookInstruction(
            mintKeypair.publicKey,
            authority.publicKey,
            this.hookProgram.programId,
            TOKEN_2022_PROGRAM_ID
          )
        );
      }

      if (enablePermanentDelegate) {
        tx.add(
          createInitializePermanentDelegateInstruction(
            mintKeypair.publicKey,
            authority.publicKey,
            TOKEN_2022_PROGRAM_ID
          )
        );
      }

      if (enableMintCloseAuthority) {
        tx.add(
          createInitializeMintCloseAuthorityInstruction(
            mintKeypair.publicKey,
            authority.publicKey,
            TOKEN_2022_PROGRAM_ID
          )
        );
      }

      if (enableDefaultAccountState) {
        // 1 = Frozen, 0 = Initialized. SSS-3 typically requires accounts to be initialized frozen
        tx.add(
          createInitializeDefaultAccountStateInstruction(
            mintKeypair.publicKey,
            1, // Frozen state requires transfer hook or manual thaw
            TOKEN_2022_PROGRAM_ID
          )
        );
      }

      tx.add(
        createInitializeMintInstruction(
          mintKeypair.publicKey,
          decimals,
          mintAuthorityPDA,
          this.getFreezeAuthorityPDA(stablecoin),
          TOKEN_2022_PROGRAM_ID
        )
      );

      // Now call the anchor program to initialize state
      // @ts-ignore
      const initIx = await this.program.methods
        .initialize(
          name,
          symbol,
          decimals,
          enableTransferHook,
          enablePermanentDelegate
        )
        .accounts({
          authority: authority.publicKey,
          stablecoinState: stablecoin,
          masterRole: masterRole,
          mint: mintKeypair.publicKey,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          systemProgram: web3.SystemProgram.programId,
          rent: web3.SYSVAR_RENT_PUBKEY,
        })
        .instruction();

      tx.add(initIx);

      tx.feePayer = authority.publicKey;
      tx.recentBlockhash = (
        await this.connection.getLatestBlockhash()
      ).blockhash;
      tx.sign(authority, mintKeypair);

      const signature = await this.connection.sendRawTransaction(
        tx.serialize()
      );
      await this.connection.confirmTransaction(signature, "confirmed");

      return {
        success: true,
        signature,
        data: {
          signature,
          mint: mintKeypair.publicKey,
          stablecoin,
        },
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || error.toString(),
      };
    }
  }

  /**
   * async mint(params: {
    stablecoin: PublicKey;
    minter: Keypair;
    recipient: PublicKey;
    amount: BN;
  }): Promise<SDKResult<{ signature: string }>> {
    try {
      const { stablecoin, minter, recipient, amount } = params;

      // Fetch state to get mint
      const state = await this.program.account.stablecoinState.fetch(stablecoin);
      const mint = state.mint;

      // Derive accounts
      const minterRole = this.getRolePDA(minter.publicKey, mint);
      const minterInfo = this.getMinterPDA(minter.publicKey, mint);
      const mintAuthority = this.getMintAuthorityPDA(stablecoin);

      // Get recipient ATA for Token-2022
      const recipientAccount = await anchor.utils.token.associatedAddress({
        mint,
        owner: recipient,
      });

      // Build transaction
      const tx = await this.program.methods
        .mint(amount)
        .accounts({
          minter: minter.publicKey,
          stablecoinState: stablecoin,
          minterRole: minterRole,
          minterInfo: minterInfo,
          mint: mint,
          recipientAccount: recipientAccount,
          mintAuthority: mintAuthority,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([minter])
        .rpc();

      return {
        success: true,
        signature: tx,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || error.toString(),
      };
    }
  }

  /**
   * Burn tokens
   */
  async burn(params: {
    stablecoin: PublicKey;
    burner: Keypair;
    tokenAccount: PublicKey;
    amount: BN;
  }): Promise<SDKResult<{ signature: string }>> {
    try {
      const { stablecoin, burner, tokenAccount, amount } = params;

      // Fetch state
      // @ts-ignore
      const state = await this.program.account.stablecoinState.fetch(
        stablecoin
      );
      const mint = state.mint;

      // Derive accounts
      const burnerRole = this.getRolePDA(burner.publicKey, mint);
      const burnAuthority = this.getBurnAuthorityPDA(stablecoin);

      // Build transaction
      const tx = await this.program.methods
        .burn(amount)
        .accounts({
          burner: burner.publicKey,
          stablecoinState: stablecoin,
          burnerRole: burnerRole,
          mint: mint,
          tokenAccount: tokenAccount,
          burnAuthority: burnAuthority,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([burner])
        .rpc();

      return {
        success: true,
        signature: tx,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || error.toString(),
      };
    }
  }

  /**
   * Freeze a token account
   */
  async freeze(params: {
    stablecoin: PublicKey;
    pauser: Keypair;
    tokenAccount: PublicKey;
  }): Promise<SDKResult<{ signature: string }>> {
    try {
      const { stablecoin, pauser, tokenAccount } = params;

      // @ts-ignore
      const state = await this.program.account.stablecoinState.fetch(
        stablecoin
      );
      const mint = state.mint;

      const pauserRole = this.getRolePDA(pauser.publicKey, mint);
      const freezeAuthority = this.getFreezeAuthorityPDA(stablecoin);

      const tx = await this.program.methods
        .freezeAccount()
        .accounts({
          pauser: pauser.publicKey,
          stablecoinState: stablecoin,
          pauserRole: pauserRole,
          mint: mint,
          tokenAccount: tokenAccount,
          freezeAuthority: freezeAuthority,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([pauser])
        .rpc();

      return {
        success: true,
        signature: tx,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || error.toString(),
      };
    }
  }

  /**
   * Thaw (unfreeze) a token account
   */
  async thaw(params: {
    stablecoin: PublicKey;
    pauser: Keypair;
    tokenAccount: PublicKey;
  }): Promise<SDKResult<{ signature: string }>> {
    try {
      const { stablecoin, pauser, tokenAccount } = params;

      // @ts-ignore
      const state = await this.program.account.stablecoinState.fetch(
        stablecoin
      );
      const mint = state.mint;

      const pauserRole = this.getRolePDA(pauser.publicKey, mint);
      const freezeAuthority = this.getFreezeAuthorityPDA(stablecoin);

      const tx = await this.program.methods
        .thawAccount()
        .accounts({
          pauser: pauser.publicKey,
          stablecoinState: stablecoin,
          pauserRole: pauserRole,
          mint: mint,
          tokenAccount: tokenAccount,
          freezeAuthority: freezeAuthority,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([pauser])
        .rpc();

      return {
        success: true,
        signature: tx,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || error.toString(),
      };
    }
  }

  /**
   * Pause all operations
   */
  async pause(params: {
    stablecoin: PublicKey;
    pauser: Keypair;
  }): Promise<SDKResult<{ signature: string }>> {
    try {
      const { stablecoin, pauser } = params;

      // @ts-ignore
      const state = await this.program.account.stablecoinState.fetch(
        stablecoin
      );
      const mint = state.mint;

      const pauserRole = this.getRolePDA(pauser.publicKey, mint);

      const tx = await this.program.methods
        .setPaused(true)
        .accounts({
          pauser: pauser.publicKey,
          stablecoinState: stablecoin,
          pauserRole: pauserRole,
        })
        .signers([pauser])
        .rpc();

      return {
        success: true,
        signature: tx,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || error.toString(),
      };
    }
  }

  /**
   * Unpause operations
   */
  async unpause(params: {
    stablecoin: PublicKey;
    pauser: Keypair;
  }): Promise<SDKResult<{ signature: string }>> {
    try {
      const { stablecoin, pauser } = params;

      // @ts-ignore
      const state = await this.program.account.stablecoinState.fetch(
        stablecoin
      );
      const mint = state.mint;

      const pauserRole = this.getRolePDA(pauser.publicKey, mint);

      const tx = await this.program.methods
        .setPaused(false)
        .accounts({
          pauser: pauser.publicKey,
          stablecoinState: stablecoin,
          pauserRole: pauserRole,
        })
        .signers([pauser])
        .rpc();

      return {
        success: true,
        signature: tx,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || error.toString(),
      };
    }
  }

  /**
   * Assign roles to an address
   */
  async updateRoles(params: {
    stablecoin: PublicKey;
    authority: Keypair;
    target: PublicKey;
    roles: number;
  }): Promise<SDKResult<{ signature: string }>> {
    try {
      const { stablecoin, authority, target, roles } = params;

      // @ts-ignore
      const state = await this.program.account.stablecoinState.fetch(
        stablecoin
      );
      const mint = state.mint;

      const authorityRole = this.getRolePDA(authority.publicKey, mint);
      const targetRole = this.getRolePDA(target, mint);

      const tx = await this.program.methods
        .updateRoles(roles)
        .accounts({
          authority: authority.publicKey,
          stablecoinState: stablecoin,
          authorityRole: authorityRole,
          target: target,
          targetRole: targetRole,
          systemProgram: web3.SystemProgram.programId,
        })
        .signers([authority])
        .rpc();

      return {
        success: true,
        signature: tx,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || error.toString(),
      };
    }
  }

  /**
   * Fetch stablecoin state
   */
  async getState(stablecoin: PublicKey): Promise<SDKResult<StablecoinState>> {
    try {
      // @ts-ignore
      const state = await this.program.account.stablecoinState.fetch(
        stablecoin
      );

      return {
        success: true,
        data: state as unknown as StablecoinState,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || error.toString(),
      };
    }
  }

  /**
   * Fetch role account
   */
  async getRole(rolePDA: PublicKey): Promise<SDKResult<RoleAccount>> {
    try {
      // @ts-ignore
      const role = await this.program.account.roleAccount.fetch(rolePDA);

      return {
        success: true,
        data: role as unknown as RoleAccount,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || error.toString(),
      };
    }
  }

  /**
   * Batch mint tokens to multiple recipients
   */
  async batchMint(
    minter: Keypair,
    mint: PublicKey,
    recipients: PublicKey[],
    amounts: BN[]
  ): Promise<
    SDKResult<{ signature: string; recipients: number; totalAmount: string }>
  > {
    try {
      if (recipients.length !== amounts.length) {
        throw new Error("Recipients and amounts length mismatch");
      }
      if (recipients.length > 10) {
        throw new Error("Maximum 10 recipients per batch");
      }

      const stablecoin = this.getStablecoinPDA(mint);
      const minterRole = this.getRolePDA(minter.publicKey, mint);
      const minterInfo = this.getMinterPDA(minter.publicKey, mint);
      const mintAuthority = this.getMintAuthorityPDA(stablecoin);

      const tx = await this.program.methods
        .batchMint(recipients, amounts)
        .accounts({
          minter: minter.publicKey,
          stablecoinState: stablecoin,
          minterRole: minterRole,
          minterInfo: minterInfo,
          mint: mint,
          mintAuthority: mintAuthority,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([minter])
        .rpc();

      const totalAmount = amounts.reduce((a, b) => a.add(b), new BN(0));

      return {
        success: true,
        signature: tx,
        data: {
          signature: tx,
          recipients: recipients.length,
          totalAmount: totalAmount.toString(),
        },
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || error.toString(),
      };
    }
  }

  /**
   * Get supported features
   */
  getFeatures(): { sss1: string[]; sss2: string[] } {
    return {
      sss1: [
        "Token-2022 support",
        "RBAC roles (Master/Minter/Burner/Pauser)",
        "Mint/Burn with quotas",
        "Freeze/Thaw accounts",
        "Pause/Unpause contract",
        "Minter epoch limits",
        "Supply cap",
        "Batch operations",
      ],
      sss2: [
        "Transfer hook enforcement",
        "Blacklist/Whitelist",
        "Configurable transfer fees",
        "Token seizure (permanent delegate)",
        "Compliance roles (Blacklister, Seizer)",
        "Multisig support",
      ],
    };
  }

  /**
   * Check if stablecoin has SSS-2 features
   */
  hasSSS2Features(stablecoinState: StablecoinState): boolean {
    return (
      (stablecoinState.features & 1) !== 0 ||
      (stablecoinState.features & 2) !== 0
    );
  }

  /**
   * Decode roles bitmask to human-readable array
   */
  decodeRoles(roles: number): string[] {
    const roleNames: string[] = [];
    if (roles & ROLE_MASTER) roleNames.push("MASTER");
    if (roles & ROLE_MINTER) roleNames.push("MINTER");
    if (roles & ROLE_BURNER) roleNames.push("BURNER");
    if (roles & ROLE_PAUSER) roleNames.push("PAUSER");
    if (roles & 16) roleNames.push("BLACKLISTER");
    if (roles & 32) roleNames.push("SEIZER");
    return roleNames;
  }
}
