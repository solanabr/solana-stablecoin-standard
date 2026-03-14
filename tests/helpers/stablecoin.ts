import * as anchor from '@coral-xyz/anchor';
import { TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import { Keypair, PublicKey } from '@solana/web3.js';

export function providerPayer(provider: anchor.AnchorProvider): Keypair {
  const walletWithPayer = provider.wallet as anchor.Wallet & { payer?: Keypair };
  if (!walletWithPayer.payer) {
    throw new Error('Provider wallet does not expose payer keypair');
  }
  return walletWithPayer.payer;
}

export async function finalizeCreation(params: {
  provider: anchor.AnchorProvider;
  stablecoin: anchor.Program;
  authority: Keypair;
  mint: Keypair;
  config: PublicKey;
}): Promise<void> {
  const finalizeSignature = await params.stablecoin.methods
    .finalizeCreation()
    .accounts({
      authority: params.authority.publicKey,
      config: params.config,
      mint: params.mint.publicKey,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
    })
    .rpc();

  await params.provider.connection.confirmTransaction(finalizeSignature, 'confirmed');
}
