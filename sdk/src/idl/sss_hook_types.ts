/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/sss_hook.json`.
 */
export type SssHook = {
  "address": "9aw7Ac4aGMMfND3BvYgGEcASuvyJiBXnQizbhNBphcNM",
  "metadata": {
    "name": "sssHook",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Transfer hook program for SSS-2 compliance (blacklist enforcement)"
  },
  "instructions": [
    {
      "name": "addToBlacklist",
      "docs": [
        "Add a wallet to the blacklist. Only callable by the blacklister role."
      ],
      "discriminator": [
        90,
        115,
        98,
        231,
        173,
        119,
        117,
        176
      ],
      "accounts": [
        {
          "name": "blacklister",
          "docs": [
            "Must be the blacklister role from the stablecoin config."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "mint",
          "docs": [
            "The stablecoin mint."
          ]
        },
        {
          "name": "stablecoinConfig",
          "docs": [
            "Core program's StablecoinConfig — cross-program read for role validation."
          ]
        },
        {
          "name": "blacklistEntry",
          "docs": [
            "Blacklist entry PDA. Created if new, updated if existing."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  108,
                  97,
                  99,
                  107,
                  108,
                  105,
                  115,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              },
              {
                "kind": "arg",
                "path": "wallet"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "wallet",
          "type": "pubkey"
        },
        {
          "name": "reason",
          "type": "string"
        }
      ]
    },
    {
      "name": "initializeHook",
      "docs": [
        "Initialize the transfer hook program for an SSS-2 stablecoin.",
        "Creates the ExtraAccountMetaList and HookConfig PDAs."
      ],
      "discriminator": [
        37,
        101,
        119,
        255,
        156,
        39,
        252,
        232
      ],
      "accounts": [
        {
          "name": "authority",
          "docs": [
            "Authority paying for account creation."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "mint",
          "docs": [
            "The stablecoin Token-2022 mint."
          ]
        },
        {
          "name": "stablecoinConfig",
          "docs": [
            "The core program's StablecoinConfig. Validates this mint has a config."
          ]
        },
        {
          "name": "hookConfig",
          "docs": [
            "Hook configuration PDA."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  104,
                  111,
                  111,
                  107,
                  45,
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ]
          }
        },
        {
          "name": "extraAccountMetaList",
          "docs": [
            "The ExtraAccountMetaList PDA required by spl-transfer-hook-interface."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  120,
                  116,
                  114,
                  97,
                  45,
                  97,
                  99,
                  99,
                  111,
                  117,
                  110,
                  116,
                  45,
                  109,
                  101,
                  116,
                  97,
                  115
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ]
          }
        },
        {
          "name": "coreProgram",
          "docs": [
            "The sss-core program ID (needed for external PDA derivation)."
          ]
        },
        {
          "name": "tokenProgram",
          "address": "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "removeFromBlacklist",
      "docs": [
        "Remove a wallet from the blacklist. Only callable by the blacklister role."
      ],
      "discriminator": [
        47,
        105,
        20,
        10,
        165,
        168,
        203,
        219
      ],
      "accounts": [
        {
          "name": "blacklister",
          "signer": true
        },
        {
          "name": "mint"
        },
        {
          "name": "stablecoinConfig"
        },
        {
          "name": "blacklistEntry",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  108,
                  97,
                  99,
                  107,
                  108,
                  105,
                  115,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              },
              {
                "kind": "account",
                "path": "blacklist_entry.wallet",
                "account": "blacklistEntry"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "transferHook",
      "docs": [
        "Transfer hook executed by Token-2022 on every transfer.",
        "Checks pause state and blacklist entries for both sender and receiver."
      ],
      "discriminator": [
        105,
        37,
        101,
        197,
        75,
        251,
        102,
        26
      ],
      "accounts": [
        {
          "name": "sourceToken"
        },
        {
          "name": "mint"
        },
        {
          "name": "destinationToken"
        },
        {
          "name": "owner"
        },
        {
          "name": "extraAccountMetaList",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  120,
                  116,
                  114,
                  97,
                  45,
                  97,
                  99,
                  99,
                  111,
                  117,
                  110,
                  116,
                  45,
                  109,
                  101,
                  116,
                  97,
                  115
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ]
          }
        },
        {
          "name": "coreProgram"
        },
        {
          "name": "stablecoinConfig"
        },
        {
          "name": "sourceBlacklist"
        },
        {
          "name": "destinationBlacklist"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "blacklistEntry",
      "discriminator": [
        218,
        179,
        231,
        40,
        141,
        25,
        168,
        189
      ]
    },
    {
      "name": "hookConfig",
      "discriminator": [
        137,
        155,
        101,
        95,
        138,
        72,
        8,
        182
      ]
    },
    {
      "name": "stablecoinConfig",
      "discriminator": [
        127,
        25,
        244,
        213,
        1,
        192,
        101,
        6
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "blacklisted",
      "msg": "Wallet is blacklisted"
    },
    {
      "code": 6001,
      "name": "contractPaused",
      "msg": "Contract is paused"
    },
    {
      "code": 6002,
      "name": "notBlacklister",
      "msg": "Caller is not the blacklister"
    },
    {
      "code": 6003,
      "name": "invalidConfig",
      "msg": "Invalid stablecoin config"
    },
    {
      "code": 6004,
      "name": "alreadyBlacklisted",
      "msg": "Wallet is already blacklisted"
    },
    {
      "code": 6005,
      "name": "notBlacklisted",
      "msg": "Wallet is not blacklisted"
    },
    {
      "code": 6006,
      "name": "isNotCurrentlyTransferring",
      "msg": "Not currently transferring"
    },
    {
      "code": 6007,
      "name": "reasonTooLong",
      "msg": "Reason exceeds maximum length"
    }
  ],
  "types": [
    {
      "name": "blacklistEntry",
      "docs": [
        "Blacklist entry for a single wallet address.",
        "",
        "PDA: `[b\"blacklist\", mint.key().as_ref(), wallet.key().as_ref()]`"
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "docs": [
              "The stablecoin mint this entry belongs to."
            ],
            "type": "pubkey"
          },
          {
            "name": "wallet",
            "docs": [
              "The blacklisted wallet address."
            ],
            "type": "pubkey"
          },
          {
            "name": "blacklisted",
            "docs": [
              "Whether this wallet is currently blacklisted."
            ],
            "type": "bool"
          },
          {
            "name": "reason",
            "docs": [
              "Human-readable reason for blacklisting."
            ],
            "type": "string"
          },
          {
            "name": "blacklistedAt",
            "docs": [
              "Unix timestamp when blacklisted."
            ],
            "type": "i64"
          },
          {
            "name": "blacklistedBy",
            "docs": [
              "Who initiated the blacklisting."
            ],
            "type": "pubkey"
          },
          {
            "name": "bump",
            "docs": [
              "Bump for this PDA."
            ],
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "hookConfig",
      "docs": [
        "Configuration for the transfer hook program instance.",
        "",
        "PDA: `[b\"hook-config\", mint.key().as_ref()]`"
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "docs": [
              "The Token-2022 mint this hook serves."
            ],
            "type": "pubkey"
          },
          {
            "name": "stablecoinConfig",
            "docs": [
              "The core program's StablecoinConfig PDA (for reading pause state and roles)."
            ],
            "type": "pubkey"
          },
          {
            "name": "coreProgram",
            "docs": [
              "The core program ID (for PDA validation)."
            ],
            "type": "pubkey"
          },
          {
            "name": "bump",
            "docs": [
              "Bump for this PDA."
            ],
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "stablecoinConfig",
      "docs": [
        "Global configuration for a stablecoin deployment.",
        "One per stablecoin mint. Stores role assignments, pause state, and audit counters.",
        "",
        "PDA: `[b\"config\", mint.key().as_ref()]`"
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "docs": [
              "The Token-2022 mint address for this stablecoin."
            ],
            "type": "pubkey"
          },
          {
            "name": "preset",
            "docs": [
              "Preset type: 1 = SSS-1 (Minimal), 2 = SSS-2 (Compliant)."
            ],
            "type": "u8"
          },
          {
            "name": "authority",
            "docs": [
              "Master authority. Can update all other roles and perform seize (SSS-2)."
            ],
            "type": "pubkey"
          },
          {
            "name": "pendingAuthority",
            "docs": [
              "Pending authority for two-step ownership transfer. Default = Pubkey::default()."
            ],
            "type": "pubkey"
          },
          {
            "name": "masterMinter",
            "docs": [
              "Master minter. Can configure/remove minters and set quotas."
            ],
            "type": "pubkey"
          },
          {
            "name": "pauser",
            "docs": [
              "Pauser. Can pause/unpause all operations."
            ],
            "type": "pubkey"
          },
          {
            "name": "blacklister",
            "docs": [
              "Blacklister. Can add/remove wallets from blacklist (SSS-2 only)."
            ],
            "type": "pubkey"
          },
          {
            "name": "paused",
            "docs": [
              "Whether operations are paused."
            ],
            "type": "bool"
          },
          {
            "name": "totalMinted",
            "docs": [
              "Lifetime total tokens minted (for audit trail)."
            ],
            "type": "u64"
          },
          {
            "name": "totalBurned",
            "docs": [
              "Lifetime total tokens burned (for audit trail)."
            ],
            "type": "u64"
          },
          {
            "name": "bump",
            "docs": [
              "Bump for this config PDA."
            ],
            "type": "u8"
          },
          {
            "name": "mintAuthorityBump",
            "docs": [
              "Bump for the mint authority PDA."
            ],
            "type": "u8"
          }
        ]
      }
    }
  ]
};
