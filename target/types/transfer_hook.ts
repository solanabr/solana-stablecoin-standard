/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/transfer_hook.json`.
 */
export type TransferHook = {
  "address": "C6psRvWLQ4PyiRcx7KZw5giAhNFtTMLn2foBaToJ36V",
  "metadata": {
    "name": "transferHook",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "SSS-2 Transfer Hook — blacklist enforcement on every transfer"
  },
  "instructions": [
    {
      "name": "execute",
      "docs": [
        "Called by Token-2022 on every `transfer_checked`.",
        "",
        "Checks:",
        "1. Hook is not paused",
        "2. Sender is not blacklisted",
        "3. Receiver is not blacklisted",
        "4. Increments transfer counter"
      ],
      "discriminator": [
        130,
        221,
        242,
        154,
        13,
        193,
        189,
        29
      ],
      "accounts": [
        {
          "name": "sourceToken",
          "docs": [
            "Source token account"
          ]
        },
        {
          "name": "mint",
          "docs": [
            "Mint"
          ]
        },
        {
          "name": "destinationToken",
          "docs": [
            "Destination token account"
          ]
        },
        {
          "name": "owner",
          "docs": [
            "Source wallet / owner"
          ]
        },
        {
          "name": "extraAccountMetaList",
          "docs": [
            "Extra account meta list"
          ]
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "getHookInfo",
      "docs": [
        "Emits the current hook state as an event (useful for off-chain indexers)."
      ],
      "discriminator": [
        19,
        147,
        203,
        142,
        42,
        132,
        166,
        41
      ],
      "accounts": [
        {
          "name": "hookState"
        }
      ],
      "args": []
    },
    {
      "name": "initializeExtraAccountMetaList",
      "docs": [
        "Registers the additional accounts that Token-2022 must resolve and pass",
        "into every `transfer_checked` call for this mint.",
        "",
        "Called **once** per SSS-2 mint, right after mint creation.",
        "",
        "Extra accounts registered:",
        "[5] sender blacklist PDA   (derived from sss-token program)",
        "[6] receiver blacklist PDA (derived from sss-token program)",
        "[7] hook state PDA         (stores paused flag & admin)"
      ],
      "discriminator": [
        92,
        197,
        174,
        197,
        41,
        124,
        19,
        3
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "extraAccountMetaList",
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
          "name": "mint"
        },
        {
          "name": "hookState",
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
                  115,
                  116,
                  97,
                  116,
                  101
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
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "stablecoinState",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "pauseHook",
      "docs": [
        "Pause all transfers through this hook. Only the hook admin can call this.",
        "This is a nuclear option — use it for emergencies only."
      ],
      "discriminator": [
        58,
        153,
        195,
        229,
        188,
        32,
        230,
        199
      ],
      "accounts": [
        {
          "name": "hookState",
          "writable": true
        },
        {
          "name": "admin",
          "signer": true,
          "relations": [
            "hookState"
          ]
        }
      ],
      "args": []
    },
    {
      "name": "unpauseHook",
      "docs": [
        "Resume transfers after a pause."
      ],
      "discriminator": [
        7,
        217,
        254,
        136,
        32,
        179,
        7,
        226
      ],
      "accounts": [
        {
          "name": "hookState",
          "writable": true
        },
        {
          "name": "admin",
          "signer": true,
          "relations": [
            "hookState"
          ]
        }
      ],
      "args": []
    },
    {
      "name": "updateHookAdmin",
      "docs": [
        "Transfer hook administration to a new authority."
      ],
      "discriminator": [
        242,
        173,
        222,
        165,
        181,
        31,
        215,
        158
      ],
      "accounts": [
        {
          "name": "hookState",
          "writable": true
        },
        {
          "name": "admin",
          "signer": true,
          "relations": [
            "hookState"
          ]
        }
      ],
      "args": [
        {
          "name": "newAdmin",
          "type": "pubkey"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "hookState",
      "discriminator": [
        10,
        13,
        71,
        116,
        92,
        105,
        237,
        231
      ]
    }
  ],
  "events": [
    {
      "name": "hookAdminUpdated",
      "discriminator": [
        15,
        22,
        151,
        34,
        155,
        252,
        227,
        241
      ]
    },
    {
      "name": "hookInfo",
      "discriminator": [
        160,
        16,
        54,
        132,
        118,
        40,
        42,
        25
      ]
    },
    {
      "name": "hookInitialized",
      "discriminator": [
        127,
        123,
        212,
        103,
        69,
        142,
        254,
        152
      ]
    },
    {
      "name": "hookPaused",
      "discriminator": [
        204,
        155,
        242,
        189,
        43,
        145,
        31,
        247
      ]
    },
    {
      "name": "hookUnpaused",
      "discriminator": [
        78,
        90,
        58,
        251,
        59,
        255,
        88,
        235
      ]
    },
    {
      "name": "transferChecked",
      "discriminator": [
        175,
        66,
        211,
        18,
        36,
        168,
        174,
        166
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "senderBlacklisted",
      "msg": "Transfer blocked: sender is blacklisted"
    },
    {
      "code": 6001,
      "name": "recipientBlacklisted",
      "msg": "Transfer blocked: recipient is blacklisted"
    },
    {
      "code": 6002,
      "name": "transfersPaused",
      "msg": "All transfers are paused by the hook admin"
    },
    {
      "code": 6003,
      "name": "alreadyPaused",
      "msg": "Hook is already paused"
    },
    {
      "code": 6004,
      "name": "notPaused",
      "msg": "Hook is not currently paused"
    },
    {
      "code": 6005,
      "name": "unauthorized",
      "msg": "Unauthorized: signer is not the hook admin"
    },
    {
      "code": 6006,
      "name": "invalidAdmin",
      "msg": "Invalid admin: cannot set admin to the default public key"
    },
    {
      "code": 6007,
      "name": "missingAccounts",
      "msg": "Missing required extra accounts"
    }
  ],
  "types": [
    {
      "name": "hookAdminUpdated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "oldAdmin",
            "type": "pubkey"
          },
          {
            "name": "newAdmin",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "hookInfo",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "admin",
            "type": "pubkey"
          },
          {
            "name": "paused",
            "type": "bool"
          },
          {
            "name": "totalTransfers",
            "type": "u64"
          },
          {
            "name": "stablecoinState",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "hookInitialized",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "admin",
            "type": "pubkey"
          },
          {
            "name": "stablecoinState",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "hookPaused",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "admin",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "hookState",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "docs": [
              "The mint this hook is attached to"
            ],
            "type": "pubkey"
          },
          {
            "name": "admin",
            "docs": [
              "Admin that can pause/unpause the hook"
            ],
            "type": "pubkey"
          },
          {
            "name": "paused",
            "docs": [
              "If true, ALL transfers through this hook are blocked"
            ],
            "type": "bool"
          },
          {
            "name": "totalTransfers",
            "docs": [
              "Running counter of successful transfers"
            ],
            "type": "u64"
          },
          {
            "name": "stablecoinState",
            "docs": [
              "The SSS-Token stablecoin state PDA (for reference)"
            ],
            "type": "pubkey"
          },
          {
            "name": "bump",
            "docs": [
              "PDA bump"
            ],
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "hookUnpaused",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "admin",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "transferChecked",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "source",
            "type": "pubkey"
          },
          {
            "name": "destination",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          }
        ]
      }
    }
  ]
};
