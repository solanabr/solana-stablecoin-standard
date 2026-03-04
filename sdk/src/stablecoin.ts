import {
  Connection,
  PublicKey,
  Keypair,
  Transaction,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
} from '@solana/web3.js';
import { Program, AnchorProvider, BN } from '@coral-xyz/anchor';
import { TOKEN_2022_PROGRAM_ID, getAssociatedTokenAddress } from '@solana/spl-token';

import {
  CreateStablecoinParams,
  MintParams,
  BurnParams,
  FreezeParams,
  UpdateMinterParams,
  UpdateRoleParams,
  StablecoinState,
  StablecoinInfo,
  MinterInfo,
  Preset,
} from './types';
import { ComplianceModule } from './modules/compliance';
import { mergePresetConfig } from './presets';
import {
  STABLECOIN_CORE_PROGRAM_ID,
  STABLECOIN_SEED,
  MINTER_SEED,
  ROLE_SEED,
} from './constants';

/**
 * Main SDK class for interacting with Solana Stablecoin Standard
 */
export class SolanaStablecoin {
  public readonly connection: Connection;
  public readonly mintAddress: PublicKey;
  public readonly stablecoinStatePDA: PublicKey;
  public readonly compliance: ComplianceModule;
  
  private constructor(
    connection: Connection,
    mint: PublicKey,
    stablecoinStatePDA: PublicKey
  ) {
    this.connection = connection;
    this.mintAddress = mint;
    this.stablecoinStatePDA = stablecoinStatePDA;
    this.compliance = new ComplianceModule(connection, mint, stablecoinStatePDA);
  }

  /**
   * Create a new stablecoin
   */
  static async create(
    connection: Connection,
    params: CreateStablecoinParams
  ): Promise<SolanaStablecoin> {
    const mintKeypair = Keypair.generate();
    const mint = mintKeypair.publicKey;
    
    // Derive stablecoin state PDA
    const [stablecoinStatePDA] = PublicKey.findProgramAddressSync(
      [STABLECOIN_SEED, mint.toBuffer()],
      STABLECOIN_CORE_PROGRAM_ID
    );
    
    // Merge preset config if provided
    let config;
    if (params.preset) {
      config = mergePresetConfig(params.preset, {
        name: params.name,
        symbol: params.symbol,
        uri: params.uri || '',
        decimals: params.decimals,
        ...params.extensions,
      });
    } else {
      config = {
        name: params.name,
        symbol: params.symbol,
        uri: params.uri || '',
        decimals: params.decimals,
        enablePermanentDelegate: params.extensions?.permanentDelegate ?? false,
        enableTransferHook: params.extensions?.transferHook ?? false,
        defaultAccountFrozen: params.extensions?.defaultAccountFrozen ?? false,
      };
    }
    
    // Build initialize instruction
    // Note: This is a simplified version. In production, use Anchor's IDL
    const instruction = {
      keys: [
        { pubkey: stablecoinStatePDA, isSigner: false, isWritable: true },
        { pubkey: mint, isSigner: true, isWritable: true },
        { pubkey: params.authority.publicKey, isSigner: true, isWritable: true },
        { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
      ],
      programId: STABLECOIN_CORE_PROGRAM_ID,
      data: Buffer.from([]), // Serialize config data here
    };
    
    const transaction = new Transaction().add(instruction);
    
    // Send transaction
    const signature = await connection.sendTransaction(
      transaction,
      [params.authority, mintKeypair]
    );
    
    await connection.confirmTransaction(signature);
    
    console.log(`Stablecoin created: ${mint.toBase58()}`);
    console.log(`Transaction: ${signature}`);
    
    // Initialize roles if provided
    const stablecoin = new SolanaStablecoin(connection, mint, stablecoinStatePDA);
    
    if (params.roles) {
      // Add minters
      if (params.roles.minters) {
        for (const minter of params.roles.minters) {
          await stablecoin.updateMinter({
            minter: minter.address,
            dailyQuota: minter.dailyQuota,
            action: 'add',
            authority: params.authority,
          });
        }
      }
      
      // Add other roles
      if (params.roles.burners) {
        for (const burner of params.roles.burners) {
          await stablecoin.updateRole({
            roleType: 'burner',
            account: burner,
            action: 'add',
            authority: params.authority,
          });
        }
      }
      
      if (params.roles.blacklisters) {
        for (const blacklister of params.roles.blacklisters) {
          await stablecoin.updateRole({
            roleType: 'blacklister',
            account: blacklister,
            action: 'add',
            authority: params.authority,
          });
        }
      }
      
      if (params.roles.pausers) {
        for (const pauser of params.roles.pausers) {
          await stablecoin.updateRole({
            roleType: 'pauser',
            account: pauser,
            action: 'add',
            authority: params.authority,
          });
        }
      }
      
      if (params.roles.seizers) {
        for (const seizer of params.roles.seizers) {
          await stablecoin.updateRole({
            roleType: 'seizer',
            account: seizer,
            action: 'add',
            authority: params.authority,
          });
        }
      }
    }
    
    return stablecoin;
  }

  /**
   * Load an existing stablecoin
   */
  static async load(
    connection: Connection,
    mint: PublicKey
  ): Promise<SolanaStablecoin> {
    const [stablecoinStatePDA] = PublicKey.findProgramAddressSync(
      [STABLECOIN_SEED, mint.toBuffer()],
      STABLECOIN_CORE_PROGRAM_ID
    );
    
    // Verify stablecoin exists
    const accountInfo = await connection.getAccountInfo(stablecoinStatePDA);
    if (!accountInfo) {
      throw new Error(`Stablecoin not found for mint: ${mint.toBase58()}`);
    }
    
    return new SolanaStablecoin(connection, mint, stablecoinStatePDA);
  }

  /**
   * Mint tokens
   */
  async mint(params: MintParams): Promise<string> {
    // Derive minter account PDA
    const [minterAccountPDA] = PublicKey.findProgramAddressSync(
      [MINTER_SEED, this.stablecoinStatePDA.toBuffer(), params.minter.publicKey.toBuffer()],
      STABLECOIN_CORE_PROGRAM_ID
    );
    
    // Get recipient token account
    const recipientTokenAccount = await getAssociatedTokenAddress(
      this.mintAddress,
      params.recipient,
      false,
      TOKEN_2022_PROGRAM_ID
    );
    
    // Build mint instruction
    const instruction = {
      keys: [
        { pubkey: this.stablecoinStatePDA, isSigner: false, isWritable: true },
        { pubkey: minterAccountPDA, isSigner: false, isWritable: true },
        { pubkey: this.mintAddress, isSigner: false, isWritable: true },
        { pubkey: recipientTokenAccount, isSigner: false, isWritable: true },
        { pubkey: params.minter.publicKey, isSigner: true, isWritable: false },
        { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      programId: STABLECOIN_CORE_PROGRAM_ID,
      data: Buffer.from([]), // Serialize amount here
    };
    
    const transaction = new Transaction().add(instruction);
    const signature = await this.connection.sendTransaction(
      transaction,
      [params.minter]
    );
    
    await this.connection.confirmTransaction(signature);
    
    console.log(`Minted ${params.amount.toString()} tokens to ${params.recipient.toBase58()}`);
    
    return signature;
  }

  /**
   * Burn tokens
   */
  async burn(params: BurnParams): Promise<string> {
    // Derive role account PDA
    const [roleAccountPDA] = PublicKey.findProgramAddressSync(
      [ROLE_SEED, this.stablecoinStatePDA.toBuffer(), Buffer.from([0]), params.burner.publicKey.toBuffer()],
      STABLECOIN_CORE_PROGRAM_ID
    );
    
    // Build burn instruction
    const instruction = {
      keys: [
        { pubkey: this.stablecoinStatePDA, isSigner: false, isWritable: true },
        { pubkey: roleAccountPDA, isSigner: false, isWritable: false },
        { pubkey: this.mintAddress, isSigner: false, isWritable: true },
        { pubkey: params.tokenAccount, isSigner: false, isWritable: true },
        { pubkey: params.burner.publicKey, isSigner: true, isWritable: false },
        { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      programId: STABLECOIN_CORE_PROGRAM_ID,
      data: Buffer.from([]), // Serialize amount here
    };
    
    const transaction = new Transaction().add(instruction);
    const signature = await this.connection.sendTransaction(
      transaction,
      [params.burner]
    );
    
    await this.connection.confirmTransaction(signature);
    
    console.log(`Burned ${params.amount.toString()} tokens`);
    
    return signature;
  }

  /**
   * Freeze account
   */
  async freezeAccount(params: FreezeParams): Promise<string> {
    const instruction = {
      keys: [
        { pubkey: this.stablecoinStatePDA, isSigner: false, isWritable: false },
        { pubkey: this.mintAddress, isSigner: false, isWritable: true },
        { pubkey: params.tokenAccount, isSigner: false, isWritable: true },
        { pubkey: params.authority.publicKey, isSigner: true, isWritable: false },
        { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      programId: STABLECOIN_CORE_PROGRAM_ID,
      data: Buffer.from([]),
    };
    
    const transaction = new Transaction().add(instruction);
    const signature = await this.connection.sendTransaction(
      transaction,
      [params.authority]
    );
    
    await this.connection.confirmTransaction(signature);
    
    console.log(`Frozen account: ${params.tokenAccount.toBase58()}`);
    
    return signature;
  }

  /**
   * Thaw account
   */
  async thawAccount(params: FreezeParams): Promise<string> {
    const instruction = {
      keys: [
        { pubkey: this.stablecoinStatePDA, isSigner: false, isWritable: false },
        { pubkey: this.mintAddress, isSigner: false, isWritable: true },
        { pubkey: params.tokenAccount, isSigner: false, isWritable: true },
        { pubkey: params.authority.publicKey, isSigner: true, isWritable: false },
        { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      programId: STABLECOIN_CORE_PROGRAM_ID,
      data: Buffer.from([]),
    };
    
    const transaction = new Transaction().add(instruction);
    const signature = await this.connection.sendTransaction(
      transaction,
      [params.authority]
    );
    
    await this.connection.confirmTransaction(signature);
    
    console.log(`Thawed account: ${params.tokenAccount.toBase58()}`);
    
    return signature;
  }

  /**
   * Pause operations
   */
  async pause(pauser: Keypair): Promise<string> {
    const [roleAccountPDA] = PublicKey.findProgramAddressSync(
      [ROLE_SEED, this.stablecoinStatePDA.toBuffer(), Buffer.from([2]), pauser.publicKey.toBuffer()],
      STABLECOIN_CORE_PROGRAM_ID
    );
    
    const instruction = {
      keys: [
        { pubkey: this.stablecoinStatePDA, isSigner: false, isWritable: true },
        { pubkey: roleAccountPDA, isSigner: false, isWritable: false },
        { pubkey: pauser.publicKey, isSigner: true, isWritable: false },
      ],
      programId: STABLECOIN_CORE_PROGRAM_ID,
      data: Buffer.from([]),
    };
    
    const transaction = new Transaction().add(instruction);
    const signature = await this.connection.sendTransaction(transaction, [pauser]);
    
    await this.connection.confirmTransaction(signature);
    
    console.log('Operations paused');
    
    return signature;
  }

  /**
   * Unpause operations
   */
  async unpause(pauser: Keypair): Promise<string> {
    const [roleAccountPDA] = PublicKey.findProgramAddressSync(
      [ROLE_SEED, this.stablecoinStatePDA.toBuffer(), Buffer.from([2]), pauser.publicKey.toBuffer()],
      STABLECOIN_CORE_PROGRAM_ID
    );
    
    const instruction = {
      keys: [
        { pubkey: this.stablecoinStatePDA, isSigner: false, isWritable: true },
        { pubkey: roleAccountPDA, isSigner: false, isWritable: false },
        { pubkey: pauser.publicKey, isSigner: true, isWritable: false },
      ],
      programId: STABLECOIN_CORE_PROGRAM_ID,
      data: Buffer.from([]),
    };
    
    const transaction = new Transaction().add(instruction);
    const signature = await this.connection.sendTransaction(transaction, [pauser]);
    
    await this.connection.confirmTransaction(signature);
    
    console.log('Operations resumed');
    
    return signature;
  }

  /**
   * Update minter
   */
  async updateMinter(params: UpdateMinterParams): Promise<string> {
    const [minterAccountPDA] = PublicKey.findProgramAddressSync(
      [MINTER_SEED, this.stablecoinStatePDA.toBuffer(), params.minter.toBuffer()],
      STABLECOIN_CORE_PROGRAM_ID
    );
    
    const instruction = {
      keys: [
        { pubkey: this.stablecoinStatePDA, isSigner: false, isWritable: false },
        { pubkey: minterAccountPDA, isSigner: false, isWritable: true },
        { pubkey: params.authority.publicKey, isSigner: true, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      programId: STABLECOIN_CORE_PROGRAM_ID,
      data: Buffer.from([]), // Serialize minter, quota, action
    };
    
    const transaction = new Transaction().add(instruction);
    const signature = await this.connection.sendTransaction(
      transaction,
      [params.authority]
    );
    
    await this.connection.confirmTransaction(signature);
    
    console.log(`${params.action === 'add' ? 'Added' : 'Removed'} minter: ${params.minter.toBase58()}`);
    
    return signature;
  }

  /**
   * Update role
   */
  async updateRole(params: UpdateRoleParams): Promise<string> {
    const roleTypeMap = { burner: 0, blacklister: 1, pauser: 2, seizer: 3 };
    const roleType = roleTypeMap[params.roleType];
    
    const [roleAccountPDA] = PublicKey.findProgramAddressSync(
      [ROLE_SEED, this.stablecoinStatePDA.toBuffer(), Buffer.from([roleType]), params.account.toBuffer()],
      STABLECOIN_CORE_PROGRAM_ID
    );
    
    const instruction = {
      keys: [
        { pubkey: this.stablecoinStatePDA, isSigner: false, isWritable: false },
        { pubkey: roleAccountPDA, isSigner: false, isWritable: true },
        { pubkey: params.authority.publicKey, isSigner: true, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      programId: STABLECOIN_CORE_PROGRAM_ID,
      data: Buffer.from([]), // Serialize role type, account, action
    };
    
    const transaction = new Transaction().add(instruction);
    const signature = await this.connection.sendTransaction(
      transaction,
      [params.authority]
    );
    
    await this.connection.confirmTransaction(signature);
    
    console.log(`${params.action === 'add' ? 'Added' : 'Removed'} ${params.roleType}: ${params.account.toBase58()}`);
    
    return signature;
  }

  /**
   * Transfer authority
   */
  async transferAuthority(newAuthority: PublicKey, currentAuthority: Keypair): Promise<string> {
    const instruction = {
      keys: [
        { pubkey: this.stablecoinStatePDA, isSigner: false, isWritable: true },
        { pubkey: currentAuthority.publicKey, isSigner: true, isWritable: false },
      ],
      programId: STABLECOIN_CORE_PROGRAM_ID,
      data: Buffer.from([]), // Serialize new authority
    };
    
    const transaction = new Transaction().add(instruction);
    const signature = await this.connection.sendTransaction(
      transaction,
      [currentAuthority]
    );
    
    await this.connection.confirmTransaction(signature);
    
    console.log(`Authority transferred to: ${newAuthority.toBase58()}`);
    
    return signature;
  }

  /**
   * Get stablecoin info
   */
  async getInfo(): Promise<StablecoinInfo> {
    const accountInfo = await this.connection.getAccountInfo(this.stablecoinStatePDA);
    if (!accountInfo) {
      throw new Error('Stablecoin not found');
    }
    
    // Deserialize account data
    // Note: In production, use Anchor's account deserialization
    const state: StablecoinState = {} as any; // Parse from accountInfo.data
    
    const mintInfo = await this.connection.getTokenSupply(this.mintAddress);
    
    return {
      mint: this.mintAddress,
      name: state.name,
      symbol: state.symbol,
      decimals: state.decimals,
      totalSupply: new BN(mintInfo.value.amount),
      totalMinted: state.totalMinted,
      totalBurned: state.totalBurned,
      isPaused: state.isPaused,
      complianceEnabled: state.complianceEnabled,
      authority: state.masterAuthority,
    };
  }

  /**
   * Get total supply
   */
  async getTotalSupply(): Promise<BN> {
    const supply = await this.connection.getTokenSupply(this.mintAddress);
    return new BN(supply.value.amount);
  }

  /**
   * Get balance of an address
   */
  async getBalance(address: PublicKey): Promise<BN> {
    const tokenAccount = await getAssociatedTokenAddress(
      this.mintAddress,
      address,
      false,
      TOKEN_2022_PROGRAM_ID
    );
    
    const balance = await this.connection.getTokenAccountBalance(tokenAccount);
    return new BN(balance.value.amount);
  }

  /**
   * Get minter info
   */
  async getMinterInfo(minter: PublicKey): Promise<MinterInfo> {
    const [minterAccountPDA] = PublicKey.findProgramAddressSync(
      [MINTER_SEED, this.stablecoinStatePDA.toBuffer(), minter.toBuffer()],
      STABLECOIN_CORE_PROGRAM_ID
    );
    
    const accountInfo = await this.connection.getAccountInfo(minterAccountPDA);
    if (!accountInfo) {
      throw new Error('Minter not found');
    }
    
    // Deserialize account data
    const minterAccount: any = {}; // Parse from accountInfo.data
    
    const remainingQuota = minterAccount.dailyQuota.sub(minterAccount.mintedToday);
    
    return {
      address: minter,
      dailyQuota: minterAccount.dailyQuota,
      mintedToday: minterAccount.mintedToday,
      remainingQuota: remainingQuota.gt(new BN(0)) ? remainingQuota : new BN(0),
      totalMinted: minterAccount.totalMinted,
      isActive: minterAccount.isActive,
    };
  }
}
