#![allow(unexpected_cfgs)]

use anchor_lang::prelude::*;
use spl_tlv_account_resolution::{account::ExtraAccountMeta, seeds::Seed, state::ExtraAccountMetaList};
use spl_transfer_hook_interface::{
    get_extra_account_metas_address,
    instruction::{ExecuteInstruction, TransferHookInstruction},
};
use stablecoin::state::{ProofReceipt, StablecoinConfig};

declare_id!("E24UT9RMiw9zBh51ZMzXRdmoiLQ2PkVZ1sYhBKqazYy8");

const EXTRA_ACCOUNT_META_LIST_SPACE: usize = 512;
const STABLECOIN_CONFIG_SEED: &[u8] = b"stablecoin_config";
const BLACKLIST_SEED: &[u8] = b"blacklist";
const PROOF_RECEIPT_SEED: &[u8] = b"proof_receipt";
const TOKEN_ACCOUNT_MINT_OFFSET: usize = 0;
const TOKEN_ACCOUNT_OWNER_OFFSET: usize = 32;
const PUBKEY_BYTES: usize = 32;

#[program]
pub mod transfer_hook {
    use super::*;

    pub fn initialize_extra_account_meta_list(
        ctx: Context<InitializeExtraAccountMetaList>,
    ) -> Result<()> {
        let account_metas = vec![
            ExtraAccountMeta::new_with_pubkey(&stablecoin::ID, false, false)?,
            ExtraAccountMeta::new_external_pda_with_seeds(
                5,
                &[
                    Seed::Literal {
                        bytes: STABLECOIN_CONFIG_SEED.to_vec(),
                    },
                    Seed::AccountKey { index: 1 },
                ],
                false,
                false,
            )?,
            ExtraAccountMeta::new_external_pda_with_seeds(
                5,
                &[
                    Seed::Literal {
                        bytes: BLACKLIST_SEED.to_vec(),
                    },
                    Seed::AccountKey { index: 1 },
                    Seed::AccountData {
                        account_index: 0,
                        data_index: TOKEN_ACCOUNT_OWNER_OFFSET as u8,
                        length: PUBKEY_BYTES as u8,
                    },
                ],
                false,
                false,
            )?,
            ExtraAccountMeta::new_external_pda_with_seeds(
                5,
                &[
                    Seed::Literal {
                        bytes: PROOF_RECEIPT_SEED.to_vec(),
                    },
                    Seed::AccountKey { index: 1 },
                    Seed::AccountData {
                        account_index: 0,
                        data_index: TOKEN_ACCOUNT_OWNER_OFFSET as u8,
                        length: PUBKEY_BYTES as u8,
                    },
                ],
                false,
                false,
            )?,
            ExtraAccountMeta::new_external_pda_with_seeds(
                5,
                &[
                    Seed::Literal {
                        bytes: BLACKLIST_SEED.to_vec(),
                    },
                    Seed::AccountKey { index: 1 },
                    Seed::AccountData {
                        account_index: 2,
                        data_index: TOKEN_ACCOUNT_OWNER_OFFSET as u8,
                        length: PUBKEY_BYTES as u8,
                    },
                ],
                false,
                false,
            )?,
            ExtraAccountMeta::new_external_pda_with_seeds(
                5,
                &[
                    Seed::Literal {
                        bytes: PROOF_RECEIPT_SEED.to_vec(),
                    },
                    Seed::AccountKey { index: 1 },
                    Seed::AccountData {
                        account_index: 2,
                        data_index: TOKEN_ACCOUNT_OWNER_OFFSET as u8,
                        length: PUBKEY_BYTES as u8,
                    },
                ],
                false,
                false,
            )?,
        ];

        let mut data = ctx.accounts.meta_list.try_borrow_mut_data()?;
        ExtraAccountMetaList::init::<ExecuteInstruction>(&mut data, &account_metas)?;
        Ok(())
    }

    #[interface(spl_transfer_hook_interface::execute)]
    pub fn execute(ctx: Context<ExecuteTransferHook>, amount: u64) -> Result<()> {
        require_keys_eq!(
            ctx.accounts.meta_list.key(),
            get_extra_account_metas_address(&ctx.accounts.mint.key(), &crate::ID),
            TransferHookError::InvalidConfig
        );
        let meta_list_data = ctx.accounts.meta_list.try_borrow_data()?;
        ExtraAccountMetaList::check_account_infos::<ExecuteInstruction>(
            &ctx.accounts.to_account_infos(),
            &TransferHookInstruction::Execute { amount }.pack(),
            &crate::ID,
            &meta_list_data,
        )?;

        require_keys_eq!(
            ctx.accounts.config.mint,
            ctx.accounts.mint.key(),
            TransferHookError::InvalidConfig
        );

        let source_token_account = load_token_account_view(&ctx.accounts.source_token_account)?;
        let destination_token_account =
            load_token_account_view(&ctx.accounts.destination_token_account)?;
        require_keys_eq!(
            source_token_account.mint,
            ctx.accounts.mint.key(),
            TransferHookError::InvalidConfig
        );
        require_keys_eq!(
            destination_token_account.mint,
            ctx.accounts.mint.key(),
            TransferHookError::InvalidConfig
        );
        if !ctx.accounts.source_blacklist_entry.data_is_empty()
            || !ctx.accounts.destination_blacklist_entry.data_is_empty()
        {
            return err!(TransferHookError::Blacklisted);
        }

        if ctx.accounts.config.enable_zk_compliance_proofs {
            validate_proof_receipt(
                &ctx.accounts.source_proof_receipt,
                &ctx.accounts.config,
                &ctx.accounts.mint.key(),
                &source_token_account.owner,
            )?;
            validate_proof_receipt(
                &ctx.accounts.destination_proof_receipt,
                &ctx.accounts.config,
                &ctx.accounts.mint.key(),
                &destination_token_account.owner,
            )?;
        }

        Ok(())
    }
}

#[derive(Accounts)]
pub struct InitializeExtraAccountMetaList<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    /// CHECK: Mint account key is only used to derive the validation PDA.
    pub mint: UncheckedAccount<'info>,
    #[account(
        init,
        payer = payer,
        space = EXTRA_ACCOUNT_META_LIST_SPACE,
        seeds = [b"extra-account-metas", mint.key().as_ref()],
        bump
    )]
    /// CHECK: This is the SPL transfer-hook validation account storing TLV extra-account metadata.
    pub meta_list: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ExecuteTransferHook<'info> {
    /// CHECK: The transfer-hook interface supplies the source account.
    pub source_token_account: UncheckedAccount<'info>,
    /// CHECK: The transfer-hook interface supplies the mint account.
    pub mint: UncheckedAccount<'info>,
    /// CHECK: The transfer-hook interface supplies the destination account.
    pub destination_token_account: UncheckedAccount<'info>,
    /// CHECK: Source owner or delegate supplied by the interface.
    pub source_owner: UncheckedAccount<'info>,
    /// CHECK: Validation state PDA defined by the transfer-hook interface.
    pub meta_list: UncheckedAccount<'info>,
    pub stablecoin_program: Program<'info, stablecoin::program::Stablecoin>,
    pub config: Account<'info, StablecoinConfig>,
    /// CHECK: Optional stablecoin blacklist PDA for the source owner.
    pub source_blacklist_entry: UncheckedAccount<'info>,
    /// CHECK: Optional stablecoin proof receipt PDA for the source owner.
    pub source_proof_receipt: UncheckedAccount<'info>,
    /// CHECK: Optional stablecoin blacklist PDA for the destination owner.
    pub destination_blacklist_entry: UncheckedAccount<'info>,
    /// CHECK: Optional stablecoin proof receipt PDA for the destination owner.
    pub destination_proof_receipt: UncheckedAccount<'info>,
}

fn load_proof_receipt(account: &UncheckedAccount<'_>) -> Result<ProofReceipt> {
    let data = account.try_borrow_data()?;
    let mut slice: &[u8] = &data;
    ProofReceipt::try_deserialize(&mut slice)
        .map_err(|_| error!(TransferHookError::InvalidProofReceipt))
}

struct TokenAccountView {
    mint: Pubkey,
    owner: Pubkey,
}

fn load_token_account_view(account: &UncheckedAccount<'_>) -> Result<TokenAccountView> {
    let data = account.try_borrow_data()?;
    if data.len() < TOKEN_ACCOUNT_OWNER_OFFSET + PUBKEY_BYTES {
        return err!(TransferHookError::InvalidConfig);
    }

    let mint =
        Pubkey::try_from(&data[TOKEN_ACCOUNT_MINT_OFFSET..TOKEN_ACCOUNT_MINT_OFFSET + PUBKEY_BYTES])
            .map_err(|_| error!(TransferHookError::InvalidConfig))?;
    let owner =
        Pubkey::try_from(&data[TOKEN_ACCOUNT_OWNER_OFFSET..TOKEN_ACCOUNT_OWNER_OFFSET + PUBKEY_BYTES])
            .map_err(|_| error!(TransferHookError::InvalidConfig))?;

    Ok(TokenAccountView { mint, owner })
}

fn validate_proof_receipt(
    account: &UncheckedAccount<'_>,
    config: &StablecoinConfig,
    mint: &Pubkey,
    subject: &Pubkey,
) -> Result<()> {
    require!(
        !account.data_is_empty(),
        TransferHookError::MissingProofReceipt
    );

    let proof_receipt = load_proof_receipt(account)?;
    require_keys_eq!(
        proof_receipt.mint,
        *mint,
        TransferHookError::InvalidProofReceipt
    );
    require_keys_eq!(
        proof_receipt.subject,
        *subject,
        TransferHookError::InvalidProofReceipt
    );
    if let Some(expected_root) = config.compressed_compliance_root.as_ref() {
        require_eq!(
            proof_receipt.compliance_root.as_str(),
            expected_root.as_str(),
            TransferHookError::InvalidProofReceipt
        );
    }
    if let Some(expected_circuit) = config.compliance_circuit.as_ref() {
        require_eq!(
            proof_receipt.circuit.as_str(),
            expected_circuit.as_str(),
            TransferHookError::InvalidProofReceipt
        );
    }
    require!(
        proof_receipt.expires_at_slot >= Clock::get()?.slot,
        TransferHookError::ProofReceiptExpired
    );

    Ok(())
}

#[error_code]
pub enum TransferHookError {
    #[msg("Transfer blocked: account is blacklisted")]
    Blacklisted,
    #[msg("Transfer blocked: missing compliance proof receipt")]
    MissingProofReceipt,
    #[msg("Transfer blocked: invalid proof receipt")]
    InvalidProofReceipt,
    #[msg("Transfer blocked: proof receipt expired")]
    ProofReceiptExpired,
    #[msg("Transfer blocked: invalid stablecoin config")]
    InvalidConfig,
}
