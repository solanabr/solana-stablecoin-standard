---
sidebar_position: 8
title: Instructions Reference
description: Operational summary of major on-chain instruction groups
---

# Instructions Reference

This page summarizes instruction groups and intended operational usage.

## Administrative Instructions

- `initialize`: create mint and root policy configuration.
- `nominate_authority`: begin authority transfer.
- `accept_authority`: finalize authority transfer.
- `set_supply_cap`: update hard supply ceiling.

## Role and Quota Instructions

- `update_roles`: grant or revoke operator capabilities.
- `update_minter_config`: define mint quotas and limits.

## Supply Instructions

- `mint_tokens`: issue supply to recipient accounts.
- `burn_tokens`: reduce supply through authorized burns.

## Compliance Instructions

- `freeze_account` / `thaw_account`
- `add_to_blacklist` / `remove_from_blacklist`
- `seize`
- `pause` / `unpause`

## Banking and Settlement Instructions

- `create_mint_request`
- `confirm_and_mint`
- `create_redemption`
- `complete_redemption`

## Oracle and Attestation Instructions

- `configure_oracle`
- `toggle_oracle`
- `submit_attestation`

## Usage Notes

- Use transactional pre-checks in backend services before signing.
- Require human approval for high-impact controls.
- Treat `pause`, `blacklist`, and `seize` as regulated actions with audit evidence.

## See Also

- [SDK and CLI](./sdk-cli)
- [Deployment](./deployment)
- [Compliance and Security](./compliance-security)
