import { randomBytes } from "crypto";

/**
 * Generate a random ElGamal-like keypair for testing/demo purposes.
 *
 * In production, ElGamal keypairs are derived deterministically from the
 * user's wallet using the twisted ElGamal scheme implemented in the
 * `solana-zk-sdk` Rust crate. This function generates random bytes as
 * a stand-in for integration testing and demo flows where actual
 * encryption is not exercised.
 */
export function generateTestElGamalKeypair(): {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
} {
  return {
    publicKey: new Uint8Array(randomBytes(32)),
    secretKey: new Uint8Array(randomBytes(32)),
  };
}

/**
 * Generate a random AES-128 key for testing/demo purposes.
 *
 * The confidential transfer extension uses AES encryption for the
 * account's decryptable available balance. In production, this key
 * is derived from the wallet signer via the Rust proof service.
 */
export function generateTestAesKey(): Uint8Array {
  return new Uint8Array(randomBytes(16));
}

/**
 * Derive an ElGamal keypair from a wallet signer for a specific token account.
 *
 * This requires the twisted ElGamal implementation from `solana-zk-sdk`,
 * which is only available in Rust. The derivation uses the signer's
 * secret key and the token account address as inputs to produce a
 * deterministic ElGamal keypair.
 *
 * @throws Always throws - requires Rust proof service
 */
export function deriveElGamalKeypair(
  _signer: unknown,
  _tokenAccount: unknown,
): { publicKey: Uint8Array; secretKey: Uint8Array } {
  throw new Error(
    "ElGamal keypair derivation requires the solana-zk-sdk Rust crate. " +
    "Use generateTestElGamalKeypair() for testing, or call the Rust proof " +
    "service for production deployments.",
  );
}
