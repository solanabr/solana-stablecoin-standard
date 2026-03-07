import { Keypair, PublicKey } from "@solana/web3.js";
import { Program } from "@coral-xyz/anchor";
import BN from "bn.js";
import { findMinterPda } from "./pda";
import { MinterInfoData, UpdateMinterParams } from "./types";

export class MintersModule {
  constructor(
    private readonly program: Program,
    private readonly mint: PublicKey,
    private readonly configPda: PublicKey
  ) {}

  async add(
    params: UpdateMinterParams,
    authority: Keypair
  ): Promise<string> {
    const amount = new BN(params.quota.toString());
    const [minterInfoPda] = findMinterPda(
      this.mint,
      params.minter,
      this.program.programId
    );

    return this.program.methods
      .updateMinter({
        minter: params.minter,
        quota: amount,
        active: params.active,
      })
      .accounts({
        authority: authority.publicKey,
        config: this.configPda,
        minterInfo: minterInfoPda,
        systemProgram: PublicKey.default,
      })
      .signers([authority])
      .rpc();
  }

  async remove(minter: PublicKey, authority: Keypair): Promise<string> {
    return this.add(
      { minter, quota: 0, active: false },
      authority
    );
  }

  async list(): Promise<MinterInfoData[]> {
    const accounts = await (this.program.account as any).minterInfo.all([
      {
        memcmp: {
          offset: 8, // skip discriminator
          bytes: this.mint.toBase58(),
        },
      },
    ]);
    return accounts.map((a: any) => a.account as MinterInfoData);
  }

  async get(minter: PublicKey): Promise<MinterInfoData | null> {
    const [pda] = findMinterPda(this.mint, minter, this.program.programId);
    try {
      const account = await (this.program.account as any).minterInfo.fetch(pda);
      return account as unknown as MinterInfoData;
    } catch {
      return null;
    }
  }
}
