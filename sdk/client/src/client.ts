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
  findHookConfigPda,
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
      const [hookConfigPda] = findHookConfigPda(this.transferHookProgramId);
      instructions.push(
        transferHook.createInitializeExtraAccountMetaListInstruction(
          {
            payer: this.wallet!.publicKey,
            hookConfig: hookConfigPda,
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

    const optionalExtraAccountMetaList =
      enableTransferHook && this.transferHookProgramId
        ? findExtraAccountMetaListPda(
            params.mint.publicKey,
            this.transferHookProgramId
          )[0]
        : undefined;
    const optionalHookConfig =
      enableTransferHook && this.transferHookProgramId
        ? findHookConfigPda(this.transferHookProgramId)[0]
        : undefined;
    const optionalTransferHookProgram =
      enableTransferHook && this.transferHookProgramId
        ? this.transferHookProgramId
        : undefined;

    const initializeIx = stablecoin.createInitializeInstruction(
        {
          authority: this.wallet!.publicKey,
          mint: params.mint.publicKey,
          config: configPda,
          roleConfig: roleConfigPda,
          extraAccountMetaList: optionalExtraAccountMetaList,
          hookConfig: optionalHookConfig,
          transferHookProgram: optionalTransferHookProgram,
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
      );
    instructions.push(
      ensureInitializeAccountOrder(initializeIx)
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

function ensureInitializeAccountOrder(
  instruction: TransactionInstruction
): TransactionInstruction {
  // Anchor expects: authority, mint, config, role_config, extra_meta_list,
  // hook_config?, transfer_hook_program?, token_program, system_program, rent,
  // event_authority, program. Generated order puts token_program at 4 then optional at 9+.
  const keys = instruction.keys;
  if (keys.length < 11) {
    return instruction;
  }
  if (!keys[4].pubkey.equals(TOKEN_2022_PROGRAM_ID)) {
    return instruction;
  }

  const reordered =
    keys.length >= 12
      ? [
          keys[0],
          keys[1],
          keys[2],
          keys[3],
          keys[9],
          keys[10],
          keys[11],
          keys[4],
          keys[5],
          keys[6],
          keys[7],
          keys[8],
        ]
      : [
          keys[0],
          keys[1],
          keys[2],
          keys[3],
          keys[9],
          keys[10],
          keys[4],
          keys[5],
          keys[6],
          keys[7],
          keys[8],
        ];

  return new TransactionInstruction({
    programId: instruction.programId,
    keys: reordered,
    data: instruction.data,
  });
}
