#![allow(unexpected_cfgs)]

use curve25519_dalek::scalar::Scalar;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use solana_curve25519::{
    ristretto::{multiscalar_multiply_ristretto, validate_ristretto, PodRistrettoPoint},
    scalar::PodScalar,
};
use thiserror::Error;

#[cfg(not(target_os = "solana"))]
use curve25519_dalek::{
    constants::RISTRETTO_BASEPOINT_POINT,
    ristretto::RistrettoPoint,
};
#[cfg(not(target_os = "solana"))]
use sha2::Sha512;

pub const CIRCUIT_ID: &str = "sss3-merkle-schnorr-v1";
const DOMAIN_CHALLENGE: &[u8] = b"sss3-zk-challenge-v1";
const DOMAIN_NULLIFIER: &[u8] = b"sss3-zk-nullifier-v1";
const DOMAIN_LEAF: &[u8] = b"sss3-zk-leaf-v1";
const RISTRETTO_BASEPOINT_BYTES: [u8; 32] = [
    0xe2, 0xf2, 0xae, 0x0a, 0x6a, 0xbc, 0x4e, 0x71, 0xa8, 0x84, 0xa9, 0x61, 0xc5, 0x00, 0x51,
    0x5f, 0x58, 0xe3, 0x0b, 0x6a, 0xa5, 0x82, 0xdd, 0x8d, 0xb6, 0xa6, 0x59, 0x45, 0xe0, 0x8d,
    0x2d, 0x76,
];
const DERIVED_H_BYTES: [u8; 32] = [
    0x0e, 0x00, 0x55, 0x1a, 0x05, 0x55, 0x5f, 0xc3, 0x87, 0x12, 0xd4, 0x4c, 0x2d, 0x4f, 0xe6,
    0xda, 0x7e, 0x8d, 0xf4, 0xa4, 0x55, 0x05, 0xa2, 0xfa, 0xe4, 0xef, 0x2f, 0x70, 0x35, 0x4a,
    0x48, 0x20,
];
const SCALAR_ONE_BYTES: [u8; 32] = [
    1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    0, 0,
];

#[derive(Clone, Debug)]
pub struct ZkComplianceProof {
    pub subject: [u8; 32],
    pub commitment: [u8; 32],
    pub proof_commitment: [u8; 32],
    pub response: [u8; 32],
    pub merkle_siblings: Vec<[u8; 32]>,
    pub merkle_directions: Vec<u8>,
    pub expires_at_slot: u64,
    pub circuit: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct VerifiedProof {
    pub nullifier_hex: String,
    pub proof_commitment_hex: String,
    pub commitment_hex: String,
    pub root_hex: String,
    pub leaf_hex: String,
}

#[derive(Debug, Error)]
pub enum ZkComplianceError {
    #[error("invalid point encoding")]
    InvalidPoint,
    #[error("invalid scalar encoding")]
    InvalidScalar,
    #[error("merkle proof mismatch")]
    MerkleMismatch,
    #[error("proof verification failed")]
    InvalidProof,
    #[error("circuit id mismatch")]
    InvalidCircuit,
    #[error("proof expired")]
    ProofExpired,
    #[error("invalid merkle proof shape")]
    InvalidMerkleProof,
}

pub fn compute_address_scalar(subject: &[u8; 32]) -> [u8; 32] {
    hash_many(&[b"sss3-zk-address-v1", subject])
}

pub fn compute_leaf_hash(commitment: &[u8; 32]) -> [u8; 32] {
    hash_many(&[DOMAIN_LEAF, commitment])
}

pub fn compute_merkle_root(
    leaf: [u8; 32],
    siblings: &[[u8; 32]],
    directions: &[u8],
) -> Result<[u8; 32], ZkComplianceError> {
    if siblings.len() != directions.len() {
        return Err(ZkComplianceError::InvalidMerkleProof);
    }

    let mut current = leaf;
    for (sibling, direction) in siblings.iter().zip(directions.iter()) {
        current = if *direction == 0 {
            hash_many(&[current.as_slice(), sibling.as_slice()])
        } else if *direction == 1 {
            hash_many(&[sibling.as_slice(), current.as_slice()])
        } else {
            return Err(ZkComplianceError::InvalidMerkleProof);
        };
    }

    Ok(current)
}

pub fn compute_nullifier(
    subject: &[u8; 32],
    root: &[u8; 32],
    commitment: &[u8; 32],
    expires_at_slot: u64,
    circuit: &str,
) -> [u8; 32] {
    hash_many(&[
        DOMAIN_NULLIFIER,
        subject,
        root,
        commitment,
        &expires_at_slot.to_le_bytes(),
        circuit.as_bytes(),
    ])
}

pub fn compute_challenge(
    subject: &[u8; 32],
    root: &[u8; 32],
    commitment: &[u8; 32],
    proof_commitment: &[u8; 32],
    expires_at_slot: u64,
    circuit: &str,
) -> [u8; 32] {
    let nullifier = compute_nullifier(subject, root, commitment, expires_at_slot, circuit);
    hash_many(&[
        DOMAIN_CHALLENGE,
        subject,
        root,
        &nullifier,
        commitment,
        proof_commitment,
        &expires_at_slot.to_le_bytes(),
        circuit.as_bytes(),
    ])
}

pub fn verify_proof(
    proof: &ZkComplianceProof,
    expected_root: [u8; 32],
    current_slot: u64,
) -> Result<VerifiedProof, ZkComplianceError> {
    if proof.circuit != CIRCUIT_ID {
        return Err(ZkComplianceError::InvalidCircuit);
    }
    if proof.expires_at_slot < current_slot {
        return Err(ZkComplianceError::ProofExpired);
    }

    let leaf = compute_leaf_hash(&proof.commitment);
    let root = compute_merkle_root(leaf, &proof.merkle_siblings, &proof.merkle_directions)?;
    if root != expected_root {
        return Err(ZkComplianceError::MerkleMismatch);
    }

    let commitment_point = PodRistrettoPoint(proof.commitment);
    let proof_commitment_point = PodRistrettoPoint(proof.proof_commitment);
    if !validate_ristretto(&commitment_point) || !validate_ristretto(&proof_commitment_point) {
        return Err(ZkComplianceError::InvalidPoint);
    }

    let response = scalar_from_bytes(&proof.response);
    let challenge = scalar_from_bytes(&compute_challenge(
        &proof.subject,
        &root,
        &proof.commitment,
        &proof.proof_commitment,
        proof.expires_at_slot,
        &proof.circuit,
    ));
    let address_scalar = scalar_from_bytes(&compute_address_scalar(&proof.subject));

    let lhs = multiscalar_multiply_ristretto(
        &[
            pod_scalar_from_scalar(response),
            pod_scalar_from_scalar(challenge * address_scalar),
        ],
        &[derived_h_point(), ristretto_basepoint()],
    )
    .ok_or(ZkComplianceError::InvalidPoint)?;
    let rhs = multiscalar_multiply_ristretto(
        &[PodScalar(SCALAR_ONE_BYTES), pod_scalar_from_scalar(challenge)],
        &[proof_commitment_point, commitment_point],
    )
    .ok_or(ZkComplianceError::InvalidPoint)?;
    if lhs != rhs {
        return Err(ZkComplianceError::InvalidProof);
    }

    Ok(VerifiedProof {
        nullifier_hex: hex::encode(compute_nullifier(
            &proof.subject,
            &root,
            &proof.commitment,
            proof.expires_at_slot,
            &proof.circuit,
        )),
        proof_commitment_hex: hex::encode(proof.proof_commitment),
        commitment_hex: hex::encode(proof.commitment),
        root_hex: hex::encode(root),
        leaf_hex: hex::encode(leaf),
    })
}

#[cfg(not(target_os = "solana"))]
fn scalar_from_hash(hash: &[u8; 32]) -> Scalar {
    let mut wide = [0u8; 64];
    wide[..32].copy_from_slice(hash);
    wide[32..].copy_from_slice(hash);
    Scalar::from_bytes_mod_order_wide(&wide)
}

fn scalar_from_bytes(bytes: &[u8; 32]) -> Scalar {
    Scalar::from_bytes_mod_order(*bytes)
}

fn pod_scalar_from_scalar(value: Scalar) -> PodScalar {
    PodScalar(value.to_bytes())
}

fn ristretto_basepoint() -> PodRistrettoPoint {
    PodRistrettoPoint(RISTRETTO_BASEPOINT_BYTES)
}

fn derived_h_point() -> PodRistrettoPoint {
    PodRistrettoPoint(DERIVED_H_BYTES)
}

fn hash_many(parts: &[&[u8]]) -> [u8; 32] {
    let mut hasher = Sha256::new();
    for part in parts {
        hasher.update(part);
    }
    hasher.finalize().into()
}

#[cfg(not(target_os = "solana"))]
fn hash_wide(input: &[u8]) -> [u8; 64] {
    let mut hasher = Sha512::new();
    hasher.update(input);
    hasher.finalize().into()
}

#[cfg(not(target_os = "solana"))]
pub mod prover {
    use super::*;

    pub fn build_proof(
        subject: [u8; 32],
        secret: [u8; 32],
        merkle_siblings: Vec<[u8; 32]>,
        merkle_directions: Vec<u8>,
        expires_at_slot: u64,
        circuit: String,
    ) -> Result<(ZkComplianceProof, VerifiedProof), ZkComplianceError> {
        if circuit != CIRCUIT_ID {
            return Err(ZkComplianceError::InvalidCircuit);
        }

        let address_scalar = scalar_from_bytes(&compute_address_scalar(&subject));
        let secret_scalar = scalar_from_bytes(&secret);
        let h = derive_h_point();
        let commitment_point = address_scalar * RISTRETTO_BASEPOINT_POINT + secret_scalar * h;
        let commitment = commitment_point.compress().to_bytes();

        let leaf = compute_leaf_hash(&commitment);
        let root = compute_merkle_root(leaf, &merkle_siblings, &merkle_directions)?;

        let nonce = scalar_from_hash(&hash_many(&[
            b"sss3-zk-nonce-v1",
            &subject,
            &secret,
            &root,
            &expires_at_slot.to_le_bytes(),
            circuit.as_bytes(),
        ]));
        let proof_commitment_point = nonce * h;
        let proof_commitment = proof_commitment_point.compress().to_bytes();

        let challenge = scalar_from_bytes(&compute_challenge(
            &subject,
            &root,
            &commitment,
            &proof_commitment,
            expires_at_slot,
            &circuit,
        ));
        let response = (nonce + challenge * secret_scalar).to_bytes();

        let proof = ZkComplianceProof {
            subject,
            commitment,
            proof_commitment,
            response,
            merkle_siblings,
            merkle_directions,
            expires_at_slot,
            circuit,
        };
        let verified = verify_proof(&proof, root, 0)?;
        Ok((proof, verified))
    }

    fn derive_h_point() -> RistrettoPoint {
        let mut wide = [0u8; 64];
        wide.copy_from_slice(&hash_wide(b"sss3-zk-h-generator-v1"));
        RistrettoPoint::from_uniform_bytes(&wide)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn subject(byte: u8) -> [u8; 32] {
        [byte; 32]
    }

    fn secret(byte: u8) -> [u8; 32] {
        [byte; 32]
    }

    #[test]
    fn verifies_valid_proof_without_merkle_path() {
        let (proof, verified) = prover::build_proof(
            subject(7),
            secret(9),
            vec![],
            vec![],
            500,
            CIRCUIT_ID.to_string(),
        )
        .expect("proof should build");

        let root = compute_merkle_root(
            compute_leaf_hash(&proof.commitment),
            &proof.merkle_siblings,
            &proof.merkle_directions,
        )
        .expect("root should compute");

        let checked = verify_proof(&proof, root, 100).expect("proof should verify");
        assert_eq!(checked.root_hex, verified.root_hex);
        assert_eq!(checked.nullifier_hex, verified.nullifier_hex);
    }

    #[test]
    fn verifies_valid_proof_with_merkle_path() {
        let sibling = hash_many(&[b"sibling"]);
        let (proof, verified) = prover::build_proof(
            subject(3),
            secret(5),
            vec![sibling],
            vec![0],
            900,
            CIRCUIT_ID.to_string(),
        )
        .expect("proof should build");

        let root = compute_merkle_root(
            compute_leaf_hash(&proof.commitment),
            &proof.merkle_siblings,
            &proof.merkle_directions,
        )
        .expect("root should compute");

        let checked = verify_proof(&proof, root, 0).expect("proof should verify");
        assert_eq!(checked.leaf_hex, verified.leaf_hex);
        assert_eq!(checked.root_hex, verified.root_hex);
    }

    #[test]
    fn rejects_tampered_response() {
        let (mut proof, _) = prover::build_proof(
            subject(1),
            secret(2),
            vec![],
            vec![],
            700,
            CIRCUIT_ID.to_string(),
        )
        .expect("proof should build");
        let root = compute_merkle_root(
            compute_leaf_hash(&proof.commitment),
            &proof.merkle_siblings,
            &proof.merkle_directions,
        )
        .expect("root should compute");
        proof.response[0] ^= 1;

        let err = verify_proof(&proof, root, 0).expect_err("tampered proof must fail");
        assert!(matches!(err, ZkComplianceError::InvalidProof));
    }

    #[test]
    fn rejects_wrong_root() {
        let (proof, _) = prover::build_proof(
            subject(11),
            secret(12),
            vec![],
            vec![],
            1000,
            CIRCUIT_ID.to_string(),
        )
        .expect("proof should build");
        let err = verify_proof(&proof, [0u8; 32], 0).expect_err("wrong root must fail");
        assert!(matches!(err, ZkComplianceError::MerkleMismatch));
    }

    #[test]
    fn rejects_expired_proof() {
        let (proof, _) = prover::build_proof(
            subject(21),
            secret(22),
            vec![],
            vec![],
            50,
            CIRCUIT_ID.to_string(),
        )
        .expect("proof should build");
        let root = compute_merkle_root(
            compute_leaf_hash(&proof.commitment),
            &proof.merkle_siblings,
            &proof.merkle_directions,
        )
        .expect("root should compute");

        let err = verify_proof(&proof, root, 51).expect_err("expired proof must fail");
        assert!(matches!(err, ZkComplianceError::ProofExpired));
    }

    #[test]
    fn rejects_invalid_merkle_shape() {
        let err = compute_merkle_root([0u8; 32], &[[1u8; 32]], &[]).expect_err("shape must fail");
        assert!(matches!(err, ZkComplianceError::InvalidMerkleProof));
    }
}
