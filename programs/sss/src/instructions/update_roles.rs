use anchor_lang::{
    prelude::*,
    system_program::{create_account, CreateAccount},
};

use crate::{
    constants::*,
    error::StableError,
    events::UpdateRolesEvent,
    state::{MinterAccount, RoleAccount},
};

/// A single role update entry supplied as instruction data.
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct UpdateRole {
    /// Role name: "master" | "minter" | "burner" | "pauser" | "blacklister" | "seizer"
    pub role: String,
    /// If Some, the old holder's PDA will be closed. Must match remaining_accounts order.
    pub old_key: Option<Pubkey>,
    /// The new holder to grant the role to.
    pub new_key: Pubkey,
    /// Only used when role == "minter".
    pub allowance: u64,
}

#[event_cpi]
#[derive(Accounts)]
pub struct UpdateRoles<'info> {
    /// Must hold the master role for this mint.
    #[account(mut)]
    pub master: Signer<'info>,
    /// CHECK: Token-2022 mint. Used as seed component.
    pub mint: UncheckedAccount<'info>,
    /// Master role PDA. Existence confirms the master role.
    #[account(
        seeds = [ROLE_SEED, mint.key().as_ref(), MASTER_ROLE, master.key().as_ref()],
        bump = master_role.bump,
    )]
    pub master_role: Account<'info, RoleAccount>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

/// Validate that `role` is a known role and return its seed bytes.
fn role_seed(role: &str) -> Result<&'static [u8]> {
    match role {
        "master" => Ok(MASTER_ROLE),
        "minter" => Ok(MINTER_ROLE),
        "burner" => Ok(BURNER_ROLE),
        "pauser" => Ok(PAUSER_ROLE),
        "blacklister" => Ok(BLACKLISTER_ROLE),
        "seizer" => Ok(SEIZER_ROLE),
        _ => err!(StableError::InvalidRole),
    }
}

/// For each UpdateRole entry the caller must pass accounts in remaining_accounts in this order:
///   - If old_key is Some: old role PDA (writable, will be closed)
///   - New role PDA (writable, will be created)
///
/// The handler creates / closes the PDAs via CPI to the system program using the stored bumps.
/// When #[event_cpi] is used, the client sends event_authority and program after the named accounts,
/// so they appear at the start of remaining_accounts; we skip them so the first remaining account
/// is the role PDA(s).
pub fn handler<'c: 'info, 'info>(
    ctx: Context<'_, '_, 'c, 'info, UpdateRoles<'info>>,
    roles: Vec<UpdateRole>,
) -> Result<()> {
    let mint_key = ctx.accounts.mint.key();
    let remaining = &ctx.remaining_accounts;
    let mut idx: usize = 0;
    // Skip event_authority and program if present (injected by event_cpi; client sends them after named accounts).
    if remaining.len() >= 2 {
        let (event_auth_pda, _) = Pubkey::find_program_address(
            &[b"__event_authority"],
            ctx.program_id,
        );
        if remaining[0].key() == event_auth_pda && remaining[1].key() == *ctx.program_id {
            idx = 2;
        }
    }

    let rent = Rent::get()?;

    for update in roles.iter() {
        let role_bytes = role_seed(&update.role)?;
        let is_minter = update.role == "minter";

        // --- Close old PDA if requested ---
        if update.old_key.is_some() {
            let old_key = update.old_key.unwrap();
            let old_pda = &remaining[idx];
            idx += 1;

            // Verify the address matches expected PDA.
            let (expected, _) = Pubkey::find_program_address(
                &[ROLE_SEED, mint_key.as_ref(), role_bytes, old_key.as_ref()],
                ctx.program_id,
            );
            require!(old_pda.key() == expected, StableError::Unauthorized);

            // Close: transfer lamports to master and zero-out data.
            let lamports = old_pda.lamports();
            **old_pda.try_borrow_mut_lamports()? -= lamports;
            **ctx.accounts.master.try_borrow_mut_lamports()? += lamports;
            old_pda.data.borrow_mut().fill(0);
        }

        // --- Init new PDA ---
        let new_pda = &remaining[idx];
        idx += 1;

        let (expected_new, new_bump) = Pubkey::find_program_address(
            &[
                ROLE_SEED,
                mint_key.as_ref(),
                role_bytes,
                update.new_key.as_ref(),
            ],
            ctx.program_id,
        );
        require!(new_pda.key() == expected_new, StableError::Unauthorized);

        // Allocate the account.
        let space = if is_minter {
            MinterAccount::DISCRIMINATOR.len() + MinterAccount::INIT_SPACE
        } else {
            RoleAccount::DISCRIMINATOR.len() + RoleAccount::INIT_SPACE
        };
        let lamports = rent.minimum_balance(space);

        let new_pda_seeds: &[&[u8]] = &[
            ROLE_SEED,
            mint_key.as_ref(),
            role_bytes,
            update.new_key.as_ref(),
            &[new_bump],
        ];

        create_account(
            CpiContext::new_with_signer(
                ctx.accounts.system_program.to_account_info(),
                CreateAccount {
                    from: ctx.accounts.master.to_account_info(),
                    to: new_pda.to_account_info(),
                },
                &[new_pda_seeds],
            ),
            lamports,
            space as u64,
            ctx.program_id,
        )?;

        // Write discriminator + data.
        let mut data = new_pda.try_borrow_mut_data()?;
        if is_minter {
            let disc = MinterAccount::DISCRIMINATOR;
            data[..disc.len()].copy_from_slice(disc);
            let account = MinterAccount {
                bump: new_bump,
                allowance: update.allowance,
                minted: 0,
                mint: mint_key,
            };
            let encoded = account.try_to_vec()?;
            data[disc.len()..disc.len() + encoded.len()].copy_from_slice(&encoded);
        } else {
            let disc = RoleAccount::DISCRIMINATOR;
            data[..disc.len()].copy_from_slice(disc);
            let account = RoleAccount { bump: new_bump };
            let encoded = account.try_to_vec()?;
            data[disc.len()..disc.len() + encoded.len()].copy_from_slice(&encoded);
        }

        emit_cpi!(UpdateRolesEvent {
            role: update.role.clone(),
            mint: mint_key,
            master: ctx.accounts.master.key(),
        });
    }

    Ok(())
}
