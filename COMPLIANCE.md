# Compliance Notes

## Regulatory Considerations

SSS-2 introduces controls typically required by regulated issuers:

- Wallet-level sanctions blocking.
- Emergency pause capability.
- Administrative seizure path under authorized role governance.

Final legal/regulatory suitability depends on jurisdiction and should be reviewed by counsel.

## Audit Trail Format

Audit trails are assembled from on-chain events and indexed service output.

Recommended event fields:

- Timestamp / slot / signature
- Mint
- Action type (`mint`, `burn`, `freeze`, `blacklist_add`, `seize`, etc.)
- Initiator authority
- Subject accounts (wallets/ATAs)
- Amount (if monetary action)
- Optional reason fields (blacklist justification)

## Operational Controls

- Separate key custody for master vs operational roles.
- Enforce documented approval flow for blacklist and seize actions.
- Keep immutable change logs and replayable evidence from indexer output.
