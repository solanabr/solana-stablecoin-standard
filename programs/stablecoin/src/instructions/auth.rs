use anchor_lang::prelude::*;

use crate::errors::StablecoinError;
use crate::state::{RoleAssignment, RoleType, StablecoinConfig};

pub fn config_signer_seeds<'a>(mint: &'a Pubkey, bump: &'a u8) -> [&'a [u8]; 3] {
    [b"stablecoin_config", mint.as_ref(), std::slice::from_ref(bump)]
}

pub fn require_operator_role(
    program_id: &Pubkey,
    config: &StablecoinConfig,
    operator: &Pubkey,
    role_assignment: Option<&Account<RoleAssignment>>,
    required_role: RoleType,
) -> Result<()> {
    if *operator == config.authority {
        return Ok(());
    }

    let role = role_assignment.ok_or_else(|| error!(StablecoinError::Unauthorized))?;
    let expected = Pubkey::find_program_address(
        &[
            b"role",
            config.mint.as_ref(),
            &[required_role.discriminator()],
            operator.as_ref(),
        ],
        program_id,
    )
    .0;

    require_keys_eq!(role.key(), expected, StablecoinError::Unauthorized);
    require_keys_eq!(role.mint, config.mint, StablecoinError::Unauthorized);
    require_keys_eq!(role.holder, *operator, StablecoinError::Unauthorized);
    require!(role.role == required_role, StablecoinError::Unauthorized);
    require!(role.is_active, StablecoinError::Unauthorized);

    Ok(())
}
