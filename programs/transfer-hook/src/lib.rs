use anchor_lang::prelude::*;

pub mod error;
pub mod instructions;

use instructions::*;

declare_id!("6tULvFAJ7HfaMsjqcUyS7G3kJyncrBsth9kp2UGramiY");

pub mod sss_token_program {
    anchor_lang::declare_id!("E7iCiXrkudyt5j1nVHHmbuqCEyLP2hD4VGNJyuPAdWwP");
}

const BLACKLIST_SEED: &[u8] = b"blacklist";

#[program]
pub mod transfer_hook {
    use super::*;

    pub fn initialize_extra_account_meta_list(
        ctx: Context<InitializeExtraAccountMetaList>,
    ) -> Result<()> {
        instructions::initialize::handler(ctx)
    }

    // Called directly (e.g. from tests); Anchor's own discriminator.
    pub fn execute(ctx: Context<Execute>, amount: u64) -> Result<()> {
        instructions::execute::handler(ctx, amount)
    }

    // Token-2022 calls the hook using the SPL Transfer Hook Interface
    // discriminator (sha256("spl-transfer-hook-interface:execute")[..8]),
    // which differs from Anchor's discriminator. Anchor routes unknown
    // discriminators here so we can handle the SPL interface call.
    //
    // Account layout from Token-2022:
    //   [0] source_token_account
    //   [1] mint
    //   [2] destination_token_account
    //   [3] source_authority (wallet / permanent delegate)
    //   [4] extra_account_meta_list
    //   [5] sss_token_program (from ExtraAccountMetaList)
    //   [6] sender blacklist PDA
    //   [7] recipient blacklist PDA
    pub fn fallback<'info>(
        _program_id: &Pubkey,
        accounts: &'info [AccountInfo<'info>],
        data: &[u8],
    ) -> Result<()> {
        if data.len() < 8 {
            return err!(anchor_lang::error::ErrorCode::InstructionFallbackNotFound);
        }

        // sha256("spl-transfer-hook-interface:execute")[..8]
        const EXECUTE_DISCRIMINATOR: [u8; 8] = [105, 37, 101, 197, 75, 251, 102, 26];
        if data[..8] == EXECUTE_DISCRIMINATOR {
            // Minimum: source(0), mint(1), dest(2), authority(3), extra_metas(4),
            //          sss_program(5), sender_bl(6), recipient_bl(7)
            require!(accounts.len() >= 8, error::HookError::InvalidBlacklistAccount);

            let mint_key = accounts[1].key();
            let sender_key = accounts[3].key();

            // Extract destination token account owner from account data (offset 32..64).
            let dest_data = accounts[2].try_borrow_data()?;
            require!(dest_data.len() >= 64, error::HookError::InvalidBlacklistAccount);
            let dest_owner = Pubkey::try_from(&dest_data[32..64])
                .map_err(|_| error!(error::HookError::InvalidBlacklistAccount))?;

            let sss_token_id = sss_token_program::ID;

            // Verify the blacklist PDA keys match expected derivations.
            let sender_blacklist = &accounts[6];
            let recipient_blacklist = &accounts[7];

            let (expected_sender_pda, _) = Pubkey::find_program_address(
                &[BLACKLIST_SEED, mint_key.as_ref(), sender_key.as_ref()],
                &sss_token_id,
            );
            require_keys_eq!(
                sender_blacklist.key(),
                expected_sender_pda,
                error::HookError::InvalidBlacklistAccount
            );

            let (expected_recipient_pda, _) = Pubkey::find_program_address(
                &[BLACKLIST_SEED, mint_key.as_ref(), dest_owner.as_ref()],
                &sss_token_id,
            );
            require_keys_eq!(
                recipient_blacklist.key(),
                expected_recipient_pda,
                error::HookError::InvalidBlacklistAccount
            );

            if sender_blacklist.lamports() > 0 {
                return err!(error::HookError::SenderBlacklisted);
            }
            if recipient_blacklist.lamports() > 0 {
                return err!(error::HookError::RecipientBlacklisted);
            }

            return Ok(());
        }

        err!(anchor_lang::error::ErrorCode::InstructionFallbackNotFound)
    }
}
