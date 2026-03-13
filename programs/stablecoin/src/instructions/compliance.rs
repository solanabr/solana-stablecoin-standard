use anchor_lang::prelude::*;
use hex::FromHex;
use sss_zk_compliance::{verify_proof, CIRCUIT_ID, ZkComplianceProof};

use crate::errors::StablecoinError;
use crate::events::{ComplianceRootUpdated, ProofReceiptUpdated};
use crate::state::{ProofReceipt, StablecoinConfig};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct SubmitProofReceiptParams {
    pub subject: Pubkey,
    pub commitment: [u8; 32],
    pub proof_commitment: [u8; 32],
    pub response: [u8; 32],
    pub merkle_siblings: Vec<[u8; 32]>,
    pub merkle_directions: Vec<u8>,
    pub circuit: String,
    pub expires_at_slot: u64,
}

#[derive(Accounts)]
pub struct UpdateComplianceRoot<'info> {
    #[account(mut, has_one = authority)]
    pub config: Account<'info, StablecoinConfig>,
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(params: SubmitProofReceiptParams)]
pub struct SubmitProofReceipt<'info> {
    #[account(mut, has_one = authority)]
    pub config: Account<'info, StablecoinConfig>,
    #[account(mut)]
    pub authority: Signer<'info>,
    /// CHECK: Mint account key is used for PDA derivation and config matching.
    pub mint: UncheckedAccount<'info>,
    #[account(
        init_if_needed,
        payer = authority,
        space = ProofReceipt::LEN,
        seeds = [b"proof_receipt", mint.key().as_ref(), params.subject.as_ref()],
        bump
    )]
    pub proof_receipt: Account<'info, ProofReceipt>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RevokeProofReceipt<'info> {
    #[account(has_one = authority)]
    pub config: Account<'info, StablecoinConfig>,
    pub authority: Signer<'info>,
    /// CHECK: Mint account key is used for PDA derivation and config matching.
    pub mint: UncheckedAccount<'info>,
    #[account(
        mut,
        seeds = [b"proof_receipt", mint.key().as_ref(), proof_receipt.subject.as_ref()],
        bump = proof_receipt.bump,
        close = authority
    )]
    pub proof_receipt: Account<'info, ProofReceipt>,
}

pub fn update_compliance_root_handler(
    ctx: Context<UpdateComplianceRoot>,
    root: String,
) -> Result<()> {
    require!(
        ctx.accounts.config.enable_compressed_compliance_state,
        StablecoinError::CompressedComplianceStateNotEnabled
    );
    require!(
        root.len() <= StablecoinConfig::MAX_COMPLIANCE_ROOT_LEN,
        StablecoinError::CompressedComplianceRootTooLong
    );

    ctx.accounts.config.compressed_compliance_root = Some(root.clone());

    emit!(ComplianceRootUpdated {
        mint: ctx.accounts.config.mint,
        authority: ctx.accounts.authority.key(),
        root,
    });

    Ok(())
}

pub fn submit_proof_receipt_handler(
    ctx: Context<SubmitProofReceipt>,
    params: SubmitProofReceiptParams,
) -> Result<()> {
    require_keys_eq!(
        ctx.accounts.config.mint,
        ctx.accounts.mint.key(),
        StablecoinError::InvalidMint
    );
    require!(
        ctx.accounts.config.enable_zk_compliance_proofs,
        StablecoinError::ZkComplianceNotEnabled
    );
    require!(
        ctx.accounts.config.compressed_compliance_root.is_some(),
        StablecoinError::CompressedComplianceStateNotEnabled
    );
    let expected_root = ctx
        .accounts
        .config
        .compressed_compliance_root
        .as_ref()
        .expect("checked is_some");
    require!(
        expected_root.len() <= ProofReceipt::MAX_COMPLIANCE_ROOT_LEN,
        StablecoinError::CompressedComplianceRootTooLong
    );
    require!(
        params.circuit.len() <= ProofReceipt::MAX_COMPLIANCE_CIRCUIT_LEN,
        StablecoinError::ComplianceCircuitTooLong
    );

    let current_slot = Clock::get()?.slot;
    require!(
        params.expires_at_slot >= current_slot,
        StablecoinError::ProofReceiptExpired
    );

    require_eq!(params.circuit.as_str(), CIRCUIT_ID, StablecoinError::InvalidProofReceipt);
    if let Some(expected_circuit) = ctx.accounts.config.compliance_circuit.as_ref() {
        require_eq!(
            params.circuit.as_str(),
            expected_circuit.as_str(),
            StablecoinError::InvalidProofReceipt
        );
    }
    if let Some(verifier_program_id) = ctx.accounts.config.proof_verifier_program_id {
        require_keys_eq!(
            verifier_program_id,
            crate::ID,
            StablecoinError::InvalidProofVerifierProgram
        );
    }

    let expected_root_bytes = <[u8; 32]>::from_hex(expected_root)
        .map_err(|_| error!(StablecoinError::InvalidProofReceipt))?;
    let verified = verify_proof(
        &ZkComplianceProof {
            subject: params.subject.to_bytes(),
            commitment: params.commitment,
            proof_commitment: params.proof_commitment,
            response: params.response,
            merkle_siblings: params.merkle_siblings.clone(),
            merkle_directions: params.merkle_directions.clone(),
            expires_at_slot: params.expires_at_slot,
            circuit: params.circuit.clone(),
        },
        expected_root_bytes,
        current_slot,
    )
    .map_err(|_| error!(StablecoinError::InvalidProofReceipt))?;
    require!(
        verified.nullifier_hex.len() <= ProofReceipt::MAX_NULLIFIER_LEN,
        StablecoinError::ProofNullifierTooLong
    );
    require!(
        verified.proof_commitment_hex.len() <= ProofReceipt::MAX_PROOF_COMMITMENT_LEN,
        StablecoinError::ProofCommitmentTooLong
    );

    let receipt = &mut ctx.accounts.proof_receipt;
    receipt.mint = ctx.accounts.mint.key();
    receipt.subject = params.subject;
    receipt.nullifier = verified.nullifier_hex;
    receipt.proof_commitment = verified.proof_commitment_hex;
    receipt.compliance_root = verified.root_hex;
    receipt.circuit = params.circuit.clone();
    receipt.verified_by = ctx.accounts.authority.key();
    receipt.verified_at_slot = current_slot;
    receipt.expires_at_slot = params.expires_at_slot;
    receipt.bump = ctx.bumps.proof_receipt;

    emit!(ProofReceiptUpdated {
        mint: receipt.mint,
        subject: receipt.subject,
        authority: ctx.accounts.authority.key(),
        expires_at_slot: receipt.expires_at_slot,
        revoked: false,
    });

    Ok(())
}

pub fn revoke_proof_receipt_handler(ctx: Context<RevokeProofReceipt>) -> Result<()> {
    require_keys_eq!(
        ctx.accounts.config.mint,
        ctx.accounts.mint.key(),
        StablecoinError::InvalidMint
    );
    require!(
        ctx.accounts.config.enable_zk_compliance_proofs,
        StablecoinError::ZkComplianceNotEnabled
    );
    require_keys_eq!(
        ctx.accounts.proof_receipt.mint,
        ctx.accounts.mint.key(),
        StablecoinError::InvalidMint
    );

    emit!(ProofReceiptUpdated {
        mint: ctx.accounts.proof_receipt.mint,
        subject: ctx.accounts.proof_receipt.subject,
        authority: ctx.accounts.authority.key(),
        expires_at_slot: ctx.accounts.proof_receipt.expires_at_slot,
        revoked: true,
    });

    Ok(())
}
