import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  TransactionInstruction,
  VersionedTransaction,
} from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import {
  stablecoin,
  transferHook,
} from "@stbr/sss-generated-web3js";
import type { Wallet } from "./types";
import {
  DEFAULT_MINTER_QUOTA,
  PRESET_CONFIGS,
  Presets,
} from "./presets";
import {
  findConfigPda,
  findExtraAccountMetaListPda,
  findMinterQuotaPda,
  findRoleConfigPda,
} from "./pdas";
import { buildAndSignTransaction } from "./transaction";
import { Stablecoin } from "./stablecoin";

export interface CreateParams {
  preset?: Presets;
  name: string;
  symbol: string;
  uri: string;
  decimals: number;
  extensions?: {
    permanentDelegate?: boolean;
    transferHook?: boolean;
    defaultAccountFrozen?: boolean;
  };
}

export interface StablecoinClientOptions {
  connection: Connection;
  wallet?: Wallet | null;
  stablecoinProgramId?: PublicKey;
  transferHookProgramId?: PublicKey;
}

export class StablecoinClient {
  readonly connection: Connection;
  wallet: Wallet | null;
  readonly stablecoinProgramId: PublicKey;
  readonly transferHookProgramId: PublicKey | undefined;

  constructor(options: StablecoinClientOptions) {
    this.connection = options.connection;
    this.wallet = options.wallet ?? null;
    this.stablecoinProgramId =
      options.stablecoinProgramId ?? stablecoin.STABLECOIN_PROGRAM_ID;
    this.transferHookProgramId = options.transferHookProgramId;
  }

  updateWallet(wallet: Wallet | null): void {
    this.wallet = wallet;
  }

  getStablecoin(mint: PublicKey): Stablecoin {
    return new Stablecoin(this, mint);
  }

  getCreateInstructions(
    params: CreateParams & { mint: Keypair }
  ): TransactionInstruction[] {
    if (!this.wallet) {
      throw new Error("Wallet required");
    }
    const config = PRESET_CONFIGS[params.preset ?? Presets.SSS_1];
    const ext = params.extensions ?? {};
    const enablePermanentDelegate =
      ext.permanentDelegate ?? config.enablePermanentDelegate;
    const enableTransferHook =
      ext.transferHook ?? config.enableTransferHook;
    const defaultAccountFrozen =
      ext.defaultAccountFrozen ?? config.defaultAccountFrozen;

    const instructions: TransactionInstruction[] = [];

    if (enableTransferHook) {
      if (!this.transferHookProgramId) {
        throw new Error(
          "transferHookProgramId required when creating with transfer hook"
        );
      }
      instructions.push(
        transferHook.createInitializeExtraAccountMetaListInstruction(
          {
            payer: this.wallet!.publicKey,
            mint: params.mint.publicKey,
            systemProgram: SystemProgram.programId,
          },
          this.transferHookProgramId
        )
      );
    }

    const [configPda] = findConfigPda(
      params.mint.publicKey,
      this.stablecoinProgramId
    );
    const [roleConfigPda] = findRoleConfigPda(
      params.mint.publicKey,
      this.stablecoinProgramId
    );

    instructions.push(
      stablecoin.createInitializeInstruction(
        {
          authority: this.wallet!.publicKey,
          mint: params.mint.publicKey,
          config: configPda,
          roleConfig: roleConfigPda,
          ...(enableTransferHook && this.transferHookProgramId
            ? {
                extraAccountMetaList: findExtraAccountMetaListPda(
                  params.mint.publicKey,
                  this.transferHookProgramId
                )[0],
                transferHookProgram: this.transferHookProgramId,
              }
            : {}),
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: SYSVAR_RENT_PUBKEY,
          program: this.stablecoinProgramId,
        },
        {
          name: params.name,
          symbol: params.symbol,
          uri: params.uri,
          decimals: params.decimals,
          enablePermanentDelegate,
          enableTransferHook,
          defaultAccountFrozen,
        },
        this.stablecoinProgramId
      )
    );

    const [minterQuotaPda] = findMinterQuotaPda(
      params.mint.publicKey,
      this.wallet!.publicKey,
      this.stablecoinProgramId
    );

    instructions.push(
      stablecoin.createUpdateMinterInstruction(
        {
          authority: this.wallet!.publicKey,
          config: configPda,
          roleConfig: roleConfigPda,
          mint: params.mint.publicKey,
          minter: this.wallet!.publicKey,
          minterQuota: minterQuotaPda,
          systemProgram: SystemProgram.programId,
          program: this.stablecoinProgramId,
        },
        {
          minter: this.wallet!.publicKey,
          quota: DEFAULT_MINTER_QUOTA,
          active: true,
        },
        this.stablecoinProgramId
      )
    );

    return instructions;
  }

  async buildCreateTransaction(
    params: CreateParams & { mint: Keypair }
  ): Promise<VersionedTransaction> {
    const instructions = this.getCreateInstructions(params);
    const result = await buildAndSignTransaction(
      this.connection,
      this.wallet,
      instructions,
      false
    );
    return result as VersionedTransaction;
  }

  async create(params: CreateParams): Promise<PublicKey> {
    const { mint } = await this.createAndGetSignature(params);
    return mint;
  }

  async createAndGetSignature(
    params: CreateParams
  ): Promise<{ mint: PublicKey; signature: string }> {
    if (!this.wallet) {
      throw new Error("Wallet required");
    }
    const mint = Keypair.generate();
    const instructions = this.getCreateInstructions({ ...params, mint });
    const sig = await buildAndSignTransaction(
      this.connection,
      this.wallet,
      instructions,
      true,
      [mint]
    );
    if (typeof sig !== "string") {
      throw new Error("Expected signature from sendRawTransaction");
    }
    return { mint: mint.publicKey, signature: sig };
  }
}
