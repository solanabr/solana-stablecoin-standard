# SDK Reference

Package: `@stbr/sss-token`

## Main Class

- `SolanaStablecoin.create(config, programId)`
- Core ops: `mint`, `burn`, `freezeAccount`, `thawAccount`, `pause`, `unpause`
- Management: `updateMinter`, `updateRoles`, authority transfer (propose/accept on-chain)
- Queries: `getConfig`, `getRoles`, `getTotalSupply`, `getHolders`

## Presets

- `SSS_1`: base stablecoin controls
- `SSS_2`: compliance flags enabled
- `SSS_3`: privacy flag enabled

## Modules

- `compliance.*`: blacklist + seizure wrappers
- `privacy.*`: shield/private/unshield/viewing-key API surface
- `PrivacyRelayClient`: relay client for `/transact`, `/status/:id`, `/commitments`, `/viewing-key/register`
