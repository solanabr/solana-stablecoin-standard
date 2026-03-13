# SSS-2: Compliant Stablecoin

## Scope

SSS-2 extends SSS-1 with on-chain compliance: permanent delegate, transfer hook, default account frozen, blacklist, and seize.

## Features (SSS-1 plus)

- **Permanent delegate:** The stablecoin PDA is the permanent delegate so the program can move tokens from any account (used for seize).
- **Transfer hook:** Every transfer is checked by the hook program; the hook consults the blacklist PDAs and denies transfers from/to blacklisted addresses.
- **Default account frozen:** New token accounts are created in a frozen state; they must be explicitly thawed (e.g. after KYC) before use.
- **Blacklist:** Blacklister role can add/remove addresses with a reason; the transfer hook enforces the list on every transfer.
- **Seize:** Seizer role can move the full balance from a given token account to a treasury token account (e.g. sanctioned wallet → treasury).

## Use Cases

- Regulated stablecoins (USDC/USDT-class).
- Jurisdictions that expect on-chain blacklist enforcement and token seizure.
- Issuers that need a full audit trail and no gaps in transfer enforcement.

## Initialization

Use preset `SSS_2` or `extensions: { enablePermanentDelegate: true, enableTransferHook: true, defaultAccountFrozen: true }`. After deploy:

1. Initialize the stablecoin (mint + state + authority role).
2. Initialize the transfer hook’s ExtraAccountMetaList PDA for this mint (so Token-2022 includes the hook and blacklist accounts on every transfer).

The SDK and CLI perform step 2 automatically when creating an SSS-2 stablecoin.

## Instructions (SSS-2)

All SSS-1 instructions apply. In addition:

| Instruction | Who signs | Description |
| ----------- | --------- | ----------- |
| add_to_blacklist | blacklister | Add address to blacklist with reason. |
| remove_from_blacklist | blacklister | Remove address from blacklist. |
| seize | seizer | Transfer full balance from source token account to destination (treasury). |

Transfer hook (sss-2 program) `execute` runs on every transfer and denies if paused or source/dest is blacklisted.

## Failure modes

- All SSS-1 failure modes apply.
- **ComplianceNotEnabled (6002):** `add_to_blacklist`, `remove_from_blacklist`, or `seize` called on a stablecoin that was not initialized with compliance (e.g. SSS-1). The program checks `enable_permanent_delegate` and `enable_transfer_hook`; both must be true.
- **AlreadyBlacklisted (6003) / NotBlacklisted (6004):** Add when already listed, or remove when not listed.
- **Blacklisted (6011):** Transfer hook denies transfer when source or destination is blacklisted.
