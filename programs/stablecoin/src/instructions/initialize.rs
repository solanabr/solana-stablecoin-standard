use anchor_lang::prelude::*;
use anchor_lang::system_program;
use anchor_lang::solana_program::program::invoke;
use anchor_spl::token_2022::{self, InitializeMint2, Token2022};
use anchor_spl::token_2022_extensions::{
    default_account_state_initialize, metadata_pointer_initialize, permanent_delegate_initialize,
    transfer_hook_initialize, DefaultAccountStateInitialize, MetadataPointerInitialize,
    PermanentDelegateInitialize, TransferHookInitialize,
};
use anchor_spl::token_2022::spl_token_2022::{
    extension::confidential_transfer::instruction as confidential_transfer_instruction,
    extension::ExtensionType,
    state::{AccountState, Mint},
};

use crate::errors::StablecoinError;
use crate::events::StablecoinInitialized;
use crate::state::StablecoinConfig;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct InitializeParams {
    pub name: String,
    pub symbol: String,
    pub uri: String,
    pub decimals: u8,
    pub standard_version: String,
    pub enable_permanent_delegate: bool,
    pub enable_transfer_hook: bool,
    pub default_account_frozen: bool,
    pub transfer_hook_program_id: Option<Pubkey>,
    pub enable_confidential_transfers: bool,
    pub enable_zk_compliance_proofs: bool,
    pub enable_compressed_compliance_state: bool,
    pub proof_verifier_program_id: Option<Pubkey>,
    pub compressed_compliance_root: Option<String>,
    pub compliance_circuit: Option<String>,
}

#[derive(Accounts)]
#[instruction(params: InitializeParams)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        init,
        payer = authority,
        space = StablecoinConfig::LEN,
        seeds = [b"stablecoin_config", mint.key().as_ref()],
        bump
    )]
    pub config: Account<'info, StablecoinConfig>,
    #[account(mut)]
    pub mint: Signer<'info>,
    pub token_program: Program<'info, Token2022>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn handler(ctx: Context<Initialize>, params: InitializeParams) -> Result<()> {
    require!(
        params.name.len() <= StablecoinConfig::MAX_NAME_LEN,
        StablecoinError::NameTooLong
    );
    require!(
        params.symbol.len() <= StablecoinConfig::MAX_SYMBOL_LEN,
        StablecoinError::SymbolTooLong
    );
    require!(
        params.uri.len() <= StablecoinConfig::MAX_URI_LEN,
        StablecoinError::UriTooLong
    );
    require!(params.decimals <= 9, StablecoinError::InvalidDecimals);
    require!(
        params.standard_version.len() <= StablecoinConfig::MAX_STANDARD_VERSION_LEN,
        StablecoinError::StandardVersionTooLong
    );
    if params.enable_transfer_hook {
        require!(
            params.transfer_hook_program_id.is_some(),
            StablecoinError::TransferHookRequired
        );
    }
    if params.enable_zk_compliance_proofs {
        require!(
            params.enable_transfer_hook,
            StablecoinError::ZkProofTransferHookRequired
        );
        require!(
            params.enable_confidential_transfers,
            StablecoinError::ConfidentialTransfersRequired
        );
        if let Some(verifier_program_id) = params.proof_verifier_program_id {
            require_keys_eq!(
                verifier_program_id,
                crate::ID,
                StablecoinError::InvalidProofVerifierProgram
            );
        }
    }
    if let Some(root) = params.compressed_compliance_root.as_ref() {
        require!(
            root.len() <= StablecoinConfig::MAX_COMPLIANCE_ROOT_LEN,
            StablecoinError::CompressedComplianceRootTooLong
        );
    }
    if let Some(circuit) = params.compliance_circuit.as_ref() {
        require!(
            circuit.len() <= StablecoinConfig::MAX_COMPLIANCE_CIRCUIT_LEN,
            StablecoinError::ComplianceCircuitTooLong
        );
    }

    let mut extension_types = vec![ExtensionType::MetadataPointer];
    if params.enable_permanent_delegate {
        extension_types.push(ExtensionType::PermanentDelegate);
    }
    if params.enable_transfer_hook {
        extension_types.push(ExtensionType::TransferHook);
    }
    if params.default_account_frozen {
        extension_types.push(ExtensionType::DefaultAccountState);
    }
    if params.enable_confidential_transfers {
        extension_types.push(ExtensionType::ConfidentialTransferMint);
    }

    let mint_size = ExtensionType::try_calculate_account_len::<Mint>(&extension_types)
        .map_err(|_| StablecoinError::Overflow)?;
    let mint_lamports = ctx.accounts.rent.minimum_balance(mint_size);

    system_program::create_account(
        CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            system_program::CreateAccount {
                from: ctx.accounts.authority.to_account_info(),
                to: ctx.accounts.mint.to_account_info(),
            },
        ),
        mint_lamports,
        mint_size as u64,
        &ctx.accounts.token_program.key(),
    )?;

    metadata_pointer_initialize(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            MetadataPointerInitialize {
                token_program_id: ctx.accounts.token_program.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
            },
        ),
        Some(ctx.accounts.config.key()),
        Some(ctx.accounts.mint.key()),
    )?;

    if params.enable_permanent_delegate {
        permanent_delegate_initialize(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                PermanentDelegateInitialize {
                    token_program_id: ctx.accounts.token_program.to_account_info(),
                    mint: ctx.accounts.mint.to_account_info(),
                },
            ),
            &ctx.accounts.config.key(),
        )?;
    }

    if params.enable_transfer_hook {
        transfer_hook_initialize(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                TransferHookInitialize {
                    token_program_id: ctx.accounts.token_program.to_account_info(),
                    mint: ctx.accounts.mint.to_account_info(),
                },
            ),
            Some(ctx.accounts.config.key()),
            params.transfer_hook_program_id,
        )?;
    }

    if params.default_account_frozen {
        default_account_state_initialize(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                DefaultAccountStateInitialize {
                    token_program_id: ctx.accounts.token_program.to_account_info(),
                    mint: ctx.accounts.mint.to_account_info(),
                },
            ),
            &AccountState::Frozen,
        )?;
    }

    if params.enable_confidential_transfers {
        let instruction = confidential_transfer_instruction::initialize_mint(
            &ctx.accounts.token_program.key(),
            &ctx.accounts.mint.key(),
            Some(ctx.accounts.config.key()),
            true,
            None,
        )
        .map_err(|_| StablecoinError::Overflow)?;
        invoke(&instruction, &[ctx.accounts.mint.to_account_info()])?;
    }

    token_2022::initialize_mint2(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            InitializeMint2 {
                mint: ctx.accounts.mint.to_account_info(),
            },
        ),
        params.decimals,
        &ctx.accounts.config.key(),
        Some(&ctx.accounts.config.key()),
    )?;

    let config = &mut ctx.accounts.config;
    config.authority = ctx.accounts.authority.key();
    config.pending_authority = None;
    config.mint = ctx.accounts.mint.key();
    config.name = params.name;
    config.symbol = params.symbol;
    config.uri = params.uri;
    config.decimals = params.decimals;
    config.standard_version = params.standard_version;
    config.is_paused = false;
    config.total_minted = 0;
    config.total_burned = 0;
    config.enable_permanent_delegate = params.enable_permanent_delegate;
    config.enable_transfer_hook = params.enable_transfer_hook;
    config.default_account_frozen = params.default_account_frozen;
    config.enable_confidential_transfers = params.enable_confidential_transfers;
    config.enable_zk_compliance_proofs = params.enable_zk_compliance_proofs;
    config.enable_compressed_compliance_state = params.enable_compressed_compliance_state;
    config.transfer_hook_program_id = params.transfer_hook_program_id;
    config.proof_verifier_program_id = if params.enable_zk_compliance_proofs {
        Some(params.proof_verifier_program_id.unwrap_or(crate::ID))
    } else {
        params.proof_verifier_program_id
    };
    config.compressed_compliance_root = params.compressed_compliance_root;
    config.compliance_circuit = params.compliance_circuit;
    config.bump = ctx.bumps.config;

    emit!(StablecoinInitialized {
        mint: config.mint,
        authority: config.authority,
        preset: config.preset_level(),
    });

    Ok(())
}
