use anchor_lang::{
    prelude::*,
    system_program::{create_account, CreateAccount},
};

use crate::{
    constants::*,
    error::StableError,
    events::UpdateMinterEvent,
    state::{MinterAccount, RoleAccount},
};

#[event_cpi]
#[derive(Accounts)]
#[instruction(operation: String, minter: Pubkey, _allowance: u64)]
pub struct UpdateMinter<'info> {
    /// Must hold the master role for this mint.
    #[account(mut)]
    pub master: Signer<'info>,
    /// CHECK: Token-2022 mint. Used as a seed component.
    pub mint: UncheckedAccount<'info>,
    /// Master role PDA for the signer. Existence confirms the master role.
    #[account(
        seeds = [ROLE_SEED, mint.key().as_ref(), MASTER_ROLE, master.key().as_ref()],
        bump = master_role.bump,
    )]
    pub master_role: Account<'info, RoleAccount>,
    /// CHECK: Minter account PDA. For "add" it is created in the handler; for "remove" it is closed.
    /// The handler validates that this account's key equals the PDA derived from [ROLE_SEED, mint, MINTER_ROLE, minter].
    #[account(mut)]
    pub update_minter: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<UpdateMinter>,
    operation: String,
    minter: Pubkey,
    allowance: u64,
) -> Result<()> {
    let mint_key = ctx.accounts.mint.key();
    let (expected_pda, bump) = Pubkey::find_program_address(
        &[
            ROLE_SEED,
            mint_key.as_ref(),
            MINTER_ROLE,
            minter.as_ref(),
        ],
        ctx.program_id,
    );
    require!(
        ctx.accounts.update_minter.key() == expected_pda,
        StableError::Unauthorized
    );

    match operation.as_str() {
        "add" => {
            let space =
                MinterAccount::DISCRIMINATOR.len() + MinterAccount::INIT_SPACE;
            let rent = Rent::get()?;
            let lamports = rent.minimum_balance(space);

            let seeds: &[&[u8]] = &[
                ROLE_SEED,
                mint_key.as_ref(),
                MINTER_ROLE,
                minter.as_ref(),
                &[bump],
            ];

            create_account(
                CpiContext::new_with_signer(
                    ctx.accounts.system_program.to_account_info(),
                    CreateAccount {
                        from: ctx.accounts.master.to_account_info(),
                        to: ctx.accounts.update_minter.to_account_info(),
                    },
                    &[seeds],
                ),
                lamports,
                space as u64,
                ctx.program_id,
            )?;

            let mut data = ctx.accounts.update_minter.try_borrow_mut_data()?;
            let disc = MinterAccount::DISCRIMINATOR;
            data[..disc.len()].copy_from_slice(disc);
            let account = MinterAccount {
                bump,
                allowance,
                minted: 0,
                mint: mint_key,
            };
            let encoded = account.try_to_vec()?;
            data[disc.len()..disc.len() + encoded.len()]
                .copy_from_slice(&encoded);
        }
        "remove" => {
            let lamports = ctx.accounts.update_minter.lamports();
            **ctx.accounts.update_minter.try_borrow_mut_lamports()? -= lamports;
            **ctx.accounts.master.try_borrow_mut_lamports()? += lamports;
            ctx.accounts.update_minter.data.borrow_mut().fill(0);
        }
        _ => return Err(StableError::OperationNotAllowed.into()),
    }

    let emitted_allowance = if operation == "add" { allowance } else { 0 };
    emit_cpi!(UpdateMinterEvent {
        operation,
        mint: mint_key,
        minter,
        allowance: emitted_allowance,
    });

    Ok(())
}
