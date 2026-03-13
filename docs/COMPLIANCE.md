# Compliance Modules

SSS separates compliance operations from monetary supply logic.

## Blacklist Registry
An on-chain registry linking an account pubkey to an arbitrary text reason (max 32 chars) for audit trails.
It prevents `TransferChecked` operations from passing when `enable_transfer_hook` is true.

## Seizure Support
Permanent Delegates are instantiated with the `StablecoinConfig` PDA on SSS-2.
A `Seizer` uses the SSS `seize` instruction to unilaterally trigger `spl_transfer_checked`.

## Pause Scenarios
Pausing the stablecoin (requires the `Pauser` role) puts an explicit soft lock on the `Mint` and `Burn` SSS Anchor instructions. It does *not* natively halt SPL token transfers unless the transfer hook implements that check dynamically. Freezing an account is distinct from Pausing the system.
