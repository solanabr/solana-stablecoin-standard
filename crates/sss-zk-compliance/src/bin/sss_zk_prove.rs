use std::io::{Read, Write};

use serde::{Deserialize, Serialize};
use sha2::Digest;
use sss_zk_compliance::{prover::build_proof, CIRCUIT_ID};

#[derive(Deserialize)]
struct ProofInput {
    subject: String,
    expires_at_slot: u64,
    secret_hex: Option<String>,
    merkle_siblings: Option<Vec<String>>,
    merkle_directions: Option<Vec<u8>>,
    circuit: Option<String>,
}

#[derive(Serialize)]
struct ProofOutput {
    commitment: String,
    proof_commitment: String,
    response: String,
    nullifier: String,
    compliance_root: String,
    leaf_hash: String,
    circuit: String,
    expires_at_slot: u64,
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut raw = String::new();
    std::io::stdin().read_to_string(&mut raw)?;
    let input: ProofInput = serde_json::from_str(&raw)?;

    let subject_bytes = bs58::decode(&input.subject).into_vec()?;
    if subject_bytes.len() != 32 {
        return Err(format!("invalid subject length: expected 32 bytes, got {}", subject_bytes.len()).into());
    }
    let mut subject = [0u8; 32];
    subject.copy_from_slice(&subject_bytes);
    let secret = input
        .secret_hex
        .as_deref()
        .map(hex::decode)
        .transpose()?
        .unwrap_or_else(|| {
            sha2::Sha256::digest(
                [
                    b"sss3-zk-default-secret-v1".as_slice(),
                    subject.as_slice(),
                    &input.expires_at_slot.to_le_bytes(),
                ]
                .concat(),
            )
            .to_vec()
        });
    if secret.len() != 32 {
        return Err(format!("invalid secret length: expected 32 bytes, got {}", secret.len()).into());
    }
    let mut secret_bytes = [0u8; 32];
    secret_bytes.copy_from_slice(&secret);

    let siblings = input
        .merkle_siblings
        .unwrap_or_default()
        .into_iter()
        .map(|value| {
            let bytes = hex::decode(value)?;
            if bytes.len() != 32 {
                return Err(format!("invalid sibling length: expected 32 bytes, got {}", bytes.len()).into());
            }
            let mut sibling = [0u8; 32];
            sibling.copy_from_slice(&bytes);
            Ok::<[u8; 32], Box<dyn std::error::Error>>(sibling)
        })
        .collect::<Result<Vec<_>, _>>()?;
    let directions = input.merkle_directions.unwrap_or_default();
    let circuit = input.circuit.unwrap_or_else(|| CIRCUIT_ID.to_string());

    let (proof, verified) = build_proof(
        subject,
        secret_bytes,
        siblings,
        directions,
        input.expires_at_slot,
        circuit.clone(),
    )?;

    let output = ProofOutput {
        commitment: hex::encode(proof.commitment),
        proof_commitment: hex::encode(proof.proof_commitment),
        response: hex::encode(proof.response),
        nullifier: verified.nullifier_hex,
        compliance_root: verified.root_hex,
        leaf_hash: verified.leaf_hex,
        circuit,
        expires_at_slot: input.expires_at_slot,
    };

    std::io::stdout().write_all(serde_json::to_string(&output)?.as_bytes())?;
    Ok(())
}
