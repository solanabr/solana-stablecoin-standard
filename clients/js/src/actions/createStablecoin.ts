import * as anchor from "@coral-xyz/anchor";
import { PublicKey, Keypair, SystemProgram, Connection } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import {
  Presets,
  CreateStablecoinParams,
  CreateStablecoinResult,
} from "../types";
import { deriveConfigPda, deriveMintAuthorityPda, STABLECOIN_PROGRAM_ID, TRANSFER_HOOK_PROGRAM_ID } from "../pda";
import { getPresetAnchorEnum } from "../presets";

export async function createStablecoin(
  program: anchor.Program,
  params: CreateStablecoinParams
): Promise<CreateStablecoinResult> {
  const mintKeypair = Keypair.generate();
  const [configPda] = deriveConfigPda(mintKeypair.publicKey);
  const [mintAuthority] = deriveMintAuthorityPda(mintKeypair.publicKey);

  const initParams = {
    preset: getPresetAnchorEnum(params.preset),
    name: params.name,
    symbol: params.symbol,
    uri: params.uri,
    decimals: params.decimals,
    enablePermanentDelegate: params.extensions?.permanentDelegate ?? null,
    enableTransferHook: params.extensions?.transferHook ?? null,
    enableConfidentialTransfers: params.extensions?.confidentialTransfers ?? null,
    defaultAccountFrozen: params.extensions?.defaultAccountFrozen ?? null,
    masterMinter: params.masterMinter,
    pauser: params.pauser,
    blacklister: params.blacklister ?? null,
    auditorElgamalPubkey: params.auditorElgamalPubkey ?? null,
  };

  const transferHookProgramId =
    params.transferHookProgramId ??
    (params.preset === Presets.SSS_2 ? TRANSFER_HOOK_PROGRAM_ID : undefined);

  const accounts: Record<string, any> = {
    authority: params.authority.publicKey,
    mint: mintKeypair.publicKey,
    config: configPda,
    mintAuthority,
    tokenProgram: TOKEN_2022_PROGRAM_ID,
    systemProgram: SystemProgram.programId,
    rent: anchor.web3.SYSVAR_RENT_PUBKEY,
  };
  if (transferHookProgramId) {
    accounts.transferHookProgram = transferHookProgramId;
  }

  const txSignature = await program.methods
    .initialize(initParams)
    .accounts(accounts)
    .signers([mintKeypair, params.authority])
    .rpc();

  return {
    mint: mintKeypair.publicKey,
    configPda,
    mintAuthority,
    txSignature,
  };
}
