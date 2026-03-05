use crate::errors::StablecoinError;
use crate::events::*;
use crate::state::{RoleRegistry, StablecoinConfig};
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct UpdateRoles<'info> {
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

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub enum RoleType {
    Burner,
    Pauser,
    Blacklister,
    Seizer,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub enum UpdateRoleAction {
    Add,
    Remove,
}

pub fn update_roles(
    ctx: Context<UpdateRoles>,
    role_type: RoleType,
    address: Pubkey,
    action: UpdateRoleAction,
) -> Result<()> {
    let config = &ctx.accounts.config;
    let role_registry = &ctx.accounts.role_registry;
    let authority = ctx.accounts.authority.key();

    require!(
        role_registry.master == authority,
        StablecoinError::Unauthorized
    );

    let role_registry = &mut ctx.accounts.role_registry;
    let role_name = role_name(&role_type);

    apply_update_role_action(config, role_registry, role_type, address, action.clone())?;

    emit!(RoleUpdated {
        role_type: role_name.to_string(),
        address,
        action: match action {
            UpdateRoleAction::Add => "add",
            UpdateRoleAction::Remove => "remove",
        }
        .to_string(),
    });

    Ok(())
}

fn role_name(role_type: &RoleType) -> &'static str {
    match role_type {
        RoleType::Burner => "burner",
        RoleType::Pauser => "pauser",
        RoleType::Blacklister => "blacklister",
        RoleType::Seizer => "seizer",
    }
}

fn apply_update_role_action(
    config: &StablecoinConfig,
    role_registry: &mut RoleRegistry,
    role_type: RoleType,
    address: Pubkey,
    action: UpdateRoleAction,
) -> Result<()> {
    match action {
        UpdateRoleAction::Add => match role_type {
            RoleType::Burner => push_unique(&mut role_registry.burners, address),
            RoleType::Pauser => push_unique(&mut role_registry.pausers, address),
            RoleType::Blacklister => {
                require!(
                    config.enable_transfer_hook,
                    StablecoinError::ComplianceNotEnabled
                );
                push_unique(&mut role_registry.blacklisters, address);
            }
            RoleType::Seizer => {
                require!(
                    config.enable_permanent_delegate,
                    StablecoinError::ComplianceNotEnabled
                );
                push_unique(&mut role_registry.seizers, address);
            }
        },
        UpdateRoleAction::Remove => match role_type {
            RoleType::Burner => role_registry.burners.retain(|&x| x != address),
            RoleType::Pauser => role_registry.pausers.retain(|&x| x != address),
            RoleType::Blacklister => role_registry.blacklisters.retain(|&x| x != address),
            RoleType::Seizer => role_registry.seizers.retain(|&x| x != address),
        },
    }

    Ok(())
}

fn push_unique(entries: &mut Vec<Pubkey>, address: Pubkey) {
    if !entries.contains(&address) {
        entries.push(address);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn config(enable_transfer_hook: bool, enable_permanent_delegate: bool) -> StablecoinConfig {
        StablecoinConfig {
            authority: Pubkey::new_unique(),
            mint: Pubkey::new_unique(),
            name: "SSS".to_string(),
            symbol: "SSS".to_string(),
            decimals: 6,
            paused: false,
            total_minted: 0,
            total_burned: 0,
            enable_permanent_delegate,
            enable_transfer_hook,
            default_account_frozen: false,
            enable_privacy: false,
            proposed_authority: None,
            bump: 255,
        }
    }

    fn registry() -> RoleRegistry {
        RoleRegistry {
            config: Pubkey::new_unique(),
            master: Pubkey::new_unique(),
            minters: vec![],
            burners: vec![],
            pausers: vec![],
            blacklisters: vec![],
            seizers: vec![],
            bump: 255,
        }
    }

    #[test]
    fn role_name_matches_variants() {
        assert_eq!(role_name(&RoleType::Burner), "burner");
        assert_eq!(role_name(&RoleType::Pauser), "pauser");
        assert_eq!(role_name(&RoleType::Blacklister), "blacklister");
        assert_eq!(role_name(&RoleType::Seizer), "seizer");
    }

    #[test]
    fn add_burner_pushes_address() {
        let cfg = config(false, false);
        let mut rr = registry();
        let addr = Pubkey::new_unique();
        apply_update_role_action(&cfg, &mut rr, RoleType::Burner, addr, UpdateRoleAction::Add)
            .unwrap();
        assert_eq!(rr.burners, vec![addr]);
    }

    #[test]
    fn add_burner_is_idempotent() {
        let cfg = config(false, false);
        let mut rr = registry();
        let addr = Pubkey::new_unique();
        apply_update_role_action(&cfg, &mut rr, RoleType::Burner, addr, UpdateRoleAction::Add)
            .unwrap();
        apply_update_role_action(&cfg, &mut rr, RoleType::Burner, addr, UpdateRoleAction::Add)
            .unwrap();
        assert_eq!(rr.burners.len(), 1);
    }

    #[test]
    fn remove_burner_removes_address() {
        let cfg = config(false, false);
        let mut rr = registry();
        let addr = Pubkey::new_unique();
        rr.burners.push(addr);
        apply_update_role_action(
            &cfg,
            &mut rr,
            RoleType::Burner,
            addr,
            UpdateRoleAction::Remove,
        )
        .unwrap();
        assert!(rr.burners.is_empty());
    }

    #[test]
    fn add_pauser_pushes_address() {
        let cfg = config(false, false);
        let mut rr = registry();
        let addr = Pubkey::new_unique();
        apply_update_role_action(&cfg, &mut rr, RoleType::Pauser, addr, UpdateRoleAction::Add)
            .unwrap();
        assert_eq!(rr.pausers, vec![addr]);
    }

    #[test]
    fn remove_pauser_removes_address() {
        let cfg = config(false, false);
        let mut rr = registry();
        let addr = Pubkey::new_unique();
        rr.pausers.push(addr);
        apply_update_role_action(
            &cfg,
            &mut rr,
            RoleType::Pauser,
            addr,
            UpdateRoleAction::Remove,
        )
        .unwrap();
        assert!(rr.pausers.is_empty());
    }

    #[test]
    fn add_blacklister_requires_transfer_hook_enabled() {
        let cfg = config(false, false);
        let mut rr = registry();
        let err = apply_update_role_action(
            &cfg,
            &mut rr,
            RoleType::Blacklister,
            Pubkey::new_unique(),
            UpdateRoleAction::Add,
        )
        .unwrap_err();
        assert_eq!(err, error!(StablecoinError::ComplianceNotEnabled));
    }

    #[test]
    fn add_blacklister_succeeds_when_transfer_hook_enabled() {
        let cfg = config(true, false);
        let mut rr = registry();
        let addr = Pubkey::new_unique();
        apply_update_role_action(
            &cfg,
            &mut rr,
            RoleType::Blacklister,
            addr,
            UpdateRoleAction::Add,
        )
        .unwrap();
        assert_eq!(rr.blacklisters, vec![addr]);
    }

    #[test]
    fn remove_blacklister_removes_without_feature_gating() {
        let cfg = config(false, false);
        let mut rr = registry();
        let addr = Pubkey::new_unique();
        rr.blacklisters.push(addr);
        apply_update_role_action(
            &cfg,
            &mut rr,
            RoleType::Blacklister,
            addr,
            UpdateRoleAction::Remove,
        )
        .unwrap();
        assert!(rr.blacklisters.is_empty());
    }

    #[test]
    fn add_seizer_requires_permanent_delegate_enabled() {
        let cfg = config(true, false);
        let mut rr = registry();
        let err = apply_update_role_action(
            &cfg,
            &mut rr,
            RoleType::Seizer,
            Pubkey::new_unique(),
            UpdateRoleAction::Add,
        )
        .unwrap_err();
        assert_eq!(err, error!(StablecoinError::ComplianceNotEnabled));
    }

    #[test]
    fn add_seizer_succeeds_when_permanent_delegate_enabled() {
        let cfg = config(false, true);
        let mut rr = registry();
        let addr = Pubkey::new_unique();
        apply_update_role_action(&cfg, &mut rr, RoleType::Seizer, addr, UpdateRoleAction::Add)
            .unwrap();
        assert_eq!(rr.seizers, vec![addr]);
    }

    #[test]
    fn remove_seizer_removes_address() {
        let cfg = config(false, false);
        let mut rr = registry();
        let addr = Pubkey::new_unique();
        rr.seizers.push(addr);
        apply_update_role_action(
            &cfg,
            &mut rr,
            RoleType::Seizer,
            addr,
            UpdateRoleAction::Remove,
        )
        .unwrap();
        assert!(rr.seizers.is_empty());
    }

    #[test]
    fn add_blacklister_is_idempotent() {
        let cfg = config(true, false);
        let mut rr = registry();
        let addr = Pubkey::new_unique();
        apply_update_role_action(
            &cfg,
            &mut rr,
            RoleType::Blacklister,
            addr,
            UpdateRoleAction::Add,
        )
        .unwrap();
        apply_update_role_action(
            &cfg,
            &mut rr,
            RoleType::Blacklister,
            addr,
            UpdateRoleAction::Add,
        )
        .unwrap();
        assert_eq!(rr.blacklisters.len(), 1);
    }

    #[test]
    fn add_seizer_is_idempotent() {
        let cfg = config(false, true);
        let mut rr = registry();
        let addr = Pubkey::new_unique();
        apply_update_role_action(&cfg, &mut rr, RoleType::Seizer, addr, UpdateRoleAction::Add)
            .unwrap();
        apply_update_role_action(&cfg, &mut rr, RoleType::Seizer, addr, UpdateRoleAction::Add)
            .unwrap();
        assert_eq!(rr.seizers.len(), 1);
    }

    #[test]
    fn remove_missing_entries_is_noop() {
        let cfg = config(false, false);
        let mut rr = registry();
        apply_update_role_action(
            &cfg,
            &mut rr,
            RoleType::Burner,
            Pubkey::new_unique(),
            UpdateRoleAction::Remove,
        )
        .unwrap();
        assert!(rr.burners.is_empty());
    }

    #[test]
    fn add_pauser_does_not_touch_other_collections() {
        let cfg = config(true, true);
        let mut rr = registry();
        rr.burners.push(Pubkey::new_unique());
        rr.blacklisters.push(Pubkey::new_unique());
        let pauser = Pubkey::new_unique();
        apply_update_role_action(
            &cfg,
            &mut rr,
            RoleType::Pauser,
            pauser,
            UpdateRoleAction::Add,
        )
        .unwrap();
        assert_eq!(rr.pausers, vec![pauser]);
        assert_eq!(rr.burners.len(), 1);
        assert_eq!(rr.blacklisters.len(), 1);
    }

    #[test]
    fn remove_blacklister_does_not_touch_seizers() {
        let cfg = config(false, true);
        let mut rr = registry();
        let blacklister = Pubkey::new_unique();
        rr.blacklisters.push(blacklister);
        rr.seizers.push(Pubkey::new_unique());

        apply_update_role_action(
            &cfg,
            &mut rr,
            RoleType::Blacklister,
            blacklister,
            UpdateRoleAction::Remove,
        )
        .unwrap();

        assert!(rr.blacklisters.is_empty());
        assert_eq!(rr.seizers.len(), 1);
    }
}
