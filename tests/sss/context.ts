import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Sss } from "../../target/types/sss";

/**
 * Shared test context for SSS test suite.
 * Injected into each part so they share provider, program, and pre-initialized mints.
 */
export interface SssContext {
  provider: anchor.AnchorProvider;
  program: Program<Sss>;
  programId: anchor.web3.PublicKey;
  admin: anchor.Wallet;
  otherUser: anchor.web3.Keypair;
  newMasterKeypair: anchor.web3.Keypair;
  mintTs1Pk: anchor.web3.PublicKey;
  mintTs2Pk: anchor.web3.PublicKey;
}

export const MASTER_ROLE = Buffer.from("master");
export const BURNER_ROLE = Buffer.from("burner");
export const PAUSER_ROLE = Buffer.from("pauser");
export const SEIZER_ROLE = Buffer.from("seizer");
