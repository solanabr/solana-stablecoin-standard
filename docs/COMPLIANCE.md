# Compliance

## Overview

SSS compliance controls are delivered as an optional module inside the `sss-1` program.

## Hook Module Flow

1. Initialize hook module (`initialize_hook_module`) for a mint.
2. Initialize transfer-hook account metas (`initialize_extra_account_meta_list`).
3. Manage blacklist entries (`add_to_blacklist`, `remove_from_blacklist`).
4. Toggle enforcement (`set_compliance_mode`).
5. Rotate compliance authority (`transfer_hook_authority`) when needed.

```
User A -> Transfer -> Token-2022 -> sss-1 transfer_hook -> blacklist checks -> allow/deny
```

## Controls

- Blacklist enforcement at transfer-hook level.
- Freeze authority via SSS-1 Freezer role (if enabled).
- Separation of duties through role PDAs and hook authority PDA.
- On-chain event audit trail for blacklist/compliance state changes.
