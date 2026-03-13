# Security

## Role-Based Access Control

| Role | Permissions |
|------|------------|
| Admin | Grant/revoke roles, update metadata |
| Minter | Mint new tokens |
| Burner | Burn tokens |
| Freezer | Freeze/unfreeze token accounts |
| Blacklister | Add/remove addresses from blacklist |

- Admin role cannot be granted or revoked via `grant_role`/`revoke_role`
- Only the admin set during initialization has admin privileges
- Role PDAs are derived from `[config, authority, role_type]`

## On-Chain Security

- **Checked arithmetic**: All math uses `checked_add`, `checked_sub`, `checked_mul`
- **No `unwrap()`** in program code — all errors handled explicitly
- **Account validation**: All accounts validated via Anchor constraints
- **PDA bumps**: Canonical bumps stored, never recalculated
- **Signer verification**: All mutable operations require appropriate signer

## Transfer Hook Security

- Blacklist PDA checked during every transfer via Token-2022 transfer hook
- Hook cannot be bypassed — enforced at the token program level
- Only the hook authority can modify the blacklist

## Best Practices

1. Use a multisig for the admin authority
2. Keep minter/burner keys in secure HSMs
3. Monitor all role grant/revoke events
4. Regularly audit the blacklist
5. Test thoroughly on devnet before mainnet
