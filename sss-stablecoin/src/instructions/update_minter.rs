use crate::errors::StablecoinError;
use crate::events::*;
use crate::state::{MinterEntry, RoleRegistry, StablecoinConfig};
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct UpdateMinter<'info> {
    #[account(
        seeds = [StablecoinConfig::SEED_PREFIX.as_bytes(), config.authority.as_ref(), config.symbol.as_bytes()],
        bump = config.bump
    )]
    pub config: Account<'info, StablecoinConfig>,
    #[account(
        mut,
        seeds = [RoleRegistry::SEED_PREFIX.as_bytes(), config.key().as_ref()],
        bump = role_registry.bump
    )]
    pub role_registry: Account<'info, RoleRegistry>,
    #[account(mut)]
    pub authority: Signer<'info>,
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub enum UpdateMinterAction {
    Add { quota: u64 },
    Remove,
    UpdateQuota { new_quota: u64 },
}

pub fn update_minter(
    ctx: Context<UpdateMinter>,
    address: Pubkey,
    action: UpdateMinterAction,
) -> Result<()> {
    let role_registry = &ctx.accounts.role_registry;
    let authority = ctx.accounts.authority.key();

    require!(
        role_registry.master == authority,
        StablecoinError::Unauthorized
    );

    let role_registry = &mut ctx.accounts.role_registry;
    let action_label = apply_update_minter_action(&mut role_registry.minters, address, action)?;

    emit!(RoleUpdated {
        role_type: "minter".to_string(),
        address,
        action: action_label.to_string(),
    });

    Ok(())
}

fn apply_update_minter_action(
    minters: &mut Vec<MinterEntry>,
    address: Pubkey,
    action: UpdateMinterAction,
) -> Result<&'static str> {
    match action {
        UpdateMinterAction::Add { quota } => {
            if minters.iter().any(|m| m.address == address) {
                return err!(StablecoinError::InvalidRole);
            }
            minters.push(MinterEntry {
                address,
                quota,
                minted: 0,
            });
            Ok("add")
        }
        UpdateMinterAction::Remove => {
            let initial_len = minters.len();
            minters.retain(|m| m.address != address);
            if minters.len() == initial_len {
                return err!(StablecoinError::MinterNotFound);
            }
            Ok("remove")
        }
        UpdateMinterAction::UpdateQuota { new_quota } => {
            if let Some(entry) = minters.iter_mut().find(|m| m.address == address) {
                entry.quota = new_quota;
                Ok("update_quota")
            } else {
                err!(StablecoinError::MinterNotFound)
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn entry(address: Pubkey, quota: u64, minted: u64) -> MinterEntry {
        MinterEntry {
            address,
            quota,
            minted,
        }
    }

    #[test]
    fn add_inserts_new_minter_with_zero_minted() {
        let mut minters = vec![];
        let address = Pubkey::new_unique();

        let label = apply_update_minter_action(
            &mut minters,
            address,
            UpdateMinterAction::Add { quota: 50 },
        )
        .unwrap();

        assert_eq!(label, "add");
        assert_eq!(minters.len(), 1);
        assert_eq!(minters[0].address, address);
        assert_eq!(minters[0].quota, 50);
        assert_eq!(minters[0].minted, 0);
    }

    #[test]
    fn add_duplicate_minter_returns_invalid_role() {
        let address = Pubkey::new_unique();
        let mut minters = vec![entry(address, 10, 0)];

        let err = apply_update_minter_action(
            &mut minters,
            address,
            UpdateMinterAction::Add { quota: 30 },
        )
        .unwrap_err();

        assert_eq!(err, error!(StablecoinError::InvalidRole));
    }

    #[test]
    fn add_allows_same_quota_for_different_address() {
        let mut minters = vec![entry(Pubkey::new_unique(), 10, 0)];
        let address = Pubkey::new_unique();

        apply_update_minter_action(&mut minters, address, UpdateMinterAction::Add { quota: 10 })
            .unwrap();

        assert_eq!(minters.len(), 2);
    }

    #[test]
    fn remove_existing_minter_succeeds() {
        let target = Pubkey::new_unique();
        let mut minters = vec![entry(target, 10, 1), entry(Pubkey::new_unique(), 20, 2)];

        let label =
            apply_update_minter_action(&mut minters, target, UpdateMinterAction::Remove).unwrap();

        assert_eq!(label, "remove");
        assert_eq!(minters.len(), 1);
        assert!(minters.iter().all(|m| m.address != target));
    }

    #[test]
    fn remove_missing_minter_returns_not_found() {
        let mut minters = vec![entry(Pubkey::new_unique(), 10, 0)];
        let err = apply_update_minter_action(
            &mut minters,
            Pubkey::new_unique(),
            UpdateMinterAction::Remove,
        )
        .unwrap_err();

        assert_eq!(err, error!(StablecoinError::MinterNotFound));
    }

    #[test]
    fn remove_only_target_and_keeps_other_entries() {
        let keep = Pubkey::new_unique();
        let drop = Pubkey::new_unique();
        let mut minters = vec![entry(keep, 1, 1), entry(drop, 2, 2)];

        apply_update_minter_action(&mut minters, drop, UpdateMinterAction::Remove).unwrap();

        assert_eq!(minters.len(), 1);
        assert_eq!(minters[0].address, keep);
        assert_eq!(minters[0].minted, 1);
    }

    #[test]
    fn update_quota_changes_existing_minter_quota() {
        let target = Pubkey::new_unique();
        let mut minters = vec![entry(target, 10, 7)];

        let label = apply_update_minter_action(
            &mut minters,
            target,
            UpdateMinterAction::UpdateQuota { new_quota: 55 },
        )
        .unwrap();

        assert_eq!(label, "update_quota");
        assert_eq!(minters[0].quota, 55);
    }

    #[test]
    fn update_quota_preserves_minted_amount() {
        let target = Pubkey::new_unique();
        let mut minters = vec![entry(target, 10, 7)];

        apply_update_minter_action(
            &mut minters,
            target,
            UpdateMinterAction::UpdateQuota { new_quota: 99 },
        )
        .unwrap();

        assert_eq!(minters[0].minted, 7);
    }

    #[test]
    fn update_quota_missing_minter_returns_not_found() {
        let mut minters = vec![entry(Pubkey::new_unique(), 10, 0)];

        let err = apply_update_minter_action(
            &mut minters,
            Pubkey::new_unique(),
            UpdateMinterAction::UpdateQuota { new_quota: 5 },
        )
        .unwrap_err();

        assert_eq!(err, error!(StablecoinError::MinterNotFound));
    }

    #[test]
    fn add_with_zero_quota_is_allowed() {
        let mut minters = vec![];
        let target = Pubkey::new_unique();

        apply_update_minter_action(&mut minters, target, UpdateMinterAction::Add { quota: 0 })
            .unwrap();

        assert_eq!(minters[0].quota, 0);
    }

    #[test]
    fn update_quota_to_zero_is_allowed() {
        let target = Pubkey::new_unique();
        let mut minters = vec![entry(target, 10, 3)];

        apply_update_minter_action(
            &mut minters,
            target,
            UpdateMinterAction::UpdateQuota { new_quota: 0 },
        )
        .unwrap();

        assert_eq!(minters[0].quota, 0);
    }

    #[test]
    fn remove_on_empty_set_returns_not_found() {
        let mut minters = vec![];
        let err = apply_update_minter_action(
            &mut minters,
            Pubkey::new_unique(),
            UpdateMinterAction::Remove,
        )
        .unwrap_err();

        assert_eq!(err, error!(StablecoinError::MinterNotFound));
    }
}
