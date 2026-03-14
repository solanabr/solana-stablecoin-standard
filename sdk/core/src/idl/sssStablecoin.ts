import type { Idl } from "@coral-xyz/anchor";

export const SSS_STABLECOIN_IDL = {
  "address": "5C7LHvieTag3oioHsni4SgTVDeCYMLTchix5obimXkEL",
  "metadata": {
    "name": "sss_stablecoin",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Solana Stablecoin Standard reference program"
  },
  "instructions": [
    {
      "name": "add_to_blacklist",
      "docs": [
        "Add a wallet to the blacklist (SSS-2 only)"
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
          "name": "authority",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
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
          "name": "mint",
          "relations": [
            "config"
          ]
        },
        {
          "name": "wallet"
        },
        {
          "name": "compliance_record",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  109,
                  112,
                  108,
                  105,
                  97,
                  110,
                  99,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              },
              {
                "kind": "account",
                "path": "wallet"
              }
            ]
          }
        },
        {
          "name": "system_program",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "reason",
          "type": "string"
        }
      ]
    },
    {
      "name": "burn",
      "docs": [
        "Burn tokens from an account"
      ],
      "discriminator": [
        116,
        110,
        29,
        56,
        107,
        219,
        42,
        93
      ],
      "accounts": [
        {
          "name": "authority",
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
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
          "name": "mint",
          "writable": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "from",
          "writable": true
        },
        {
          "name": "token_program",
          "address": "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
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
      "name": "finalize_creation",
      "docs": [
        "Finalize the creation flow by handing mint/freeze authority to the config PDA"
      ],
      "discriminator": [
        23,
        183,
        231,
        131,
        28,
        109,
        4,
        207
      ],
      "accounts": [
        {
          "name": "authority",
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
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
          "name": "mint",
          "writable": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "token_program",
          "address": "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
        }
      ],
      "args": []
    },
    {
      "name": "freeze_account",
      "docs": [
        "Freeze a token account"
      ],
      "discriminator": [
        253,
        75,
        82,
        133,
        167,
        238,
        43,
        130
      ],
      "accounts": [
        {
          "name": "authority",
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
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
          "name": "mint",
          "relations": [
            "config"
          ]
        },
        {
          "name": "token_account",
          "writable": true
        },
        {
          "name": "token_program",
          "address": "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
        }
      ],
      "args": [
        {
          "name": "target",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "initialize",
      "docs": [
        "Initialize a new stablecoin"
      ],
      "discriminator": [
        175,
        175,
        109,
        31,
        13,
        152,
        155,
        237
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "authority",
          "signer": true
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
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
          "name": "master_minter_role",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  105,
                  110,
                  116,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "config"
              },
              {
                "kind": "account",
                "path": "authority"
              }
            ]
          }
        },
        {
          "name": "mint",
          "writable": true,
          "signer": true
        },
        {
          "name": "token_program",
          "address": "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
        },
        {
          "name": "system_program",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "args",
          "type": {
            "defined": {
              "name": "InitializeArgs"
            }
          }
        }
      ]
    },
    {
      "name": "initialize_existing_mint",
      "docs": [
        "Attach SSS config to an existing Token-2022 mint created by the SDK"
      ],
      "discriminator": [
        189,
        11,
        203,
        89,
        5,
        128,
        31,
        0
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "authority",
          "signer": true
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
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
          "name": "master_minter_role",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  105,
                  110,
                  116,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "config"
              },
              {
                "kind": "account",
                "path": "authority"
              }
            ]
          }
        },
        {
          "name": "mint",
          "writable": true
        },
        {
          "name": "token_program",
          "address": "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
        },
        {
          "name": "system_program",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "args",
          "type": {
            "defined": {
              "name": "InitializeArgs"
            }
          }
        }
      ]
    },
    {
      "name": "mint",
      "docs": [
        "Mint new tokens to a recipient"
      ],
      "discriminator": [
        51,
        57,
        225,
        47,
        182,
        146,
        137,
        166
      ],
      "accounts": [
        {
          "name": "authority",
          "signer": true
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
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
          "name": "mint",
          "writable": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "recipient",
          "writable": true
        },
        {
          "name": "minter_role",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  105,
                  110,
                  116,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "config"
              },
              {
                "kind": "account",
                "path": "authority"
              }
            ]
          }
        },
        {
          "name": "recipient_compliance_record"
        },
        {
          "name": "token_program",
          "address": "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
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
      "name": "pause",
      "docs": [
        "Pause all operations"
      ],
      "discriminator": [
        211,
        22,
        221,
        251,
        74,
        121,
        193,
        47
      ],
      "accounts": [
        {
          "name": "authority",
          "signer": true
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
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
          "name": "mint",
          "relations": [
            "config"
          ]
        }
      ],
      "args": []
    },
    {
      "name": "remove_from_blacklist",
      "docs": [
        "Remove a wallet from the blacklist (SSS-2 only)"
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
          "name": "authority",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
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
          "name": "mint",
          "relations": [
            "config"
          ]
        },
        {
          "name": "wallet"
        },
        {
          "name": "compliance_record",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  109,
                  112,
                  108,
                  105,
                  97,
                  110,
                  99,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              },
              {
                "kind": "account",
                "path": "wallet"
              }
            ]
          }
        },
        {
          "name": "system_program",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "seize",
      "docs": [
        "Seize tokens from a blacklisted account (SSS-2 only)"
      ],
      "discriminator": [
        129,
        159,
        143,
        31,
        161,
        224,
        241,
        84
      ],
      "accounts": [
        {
          "name": "authority",
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
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
          "name": "mint",
          "writable": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "source",
          "writable": true
        },
        {
          "name": "destination",
          "writable": true
        },
        {
          "name": "source_compliance_record"
        },
        {
          "name": "destination_compliance_record"
        },
        {
          "name": "transfer_hook_program"
        },
        {
          "name": "extra_account_meta_list"
        },
        {
          "name": "hook_config"
        },
        {
          "name": "stablecoin_program"
        },
        {
          "name": "token_program",
          "address": "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
        }
      ],
      "args": [
        {
          "name": "args",
          "type": {
            "defined": {
              "name": "SeizeArgs"
            }
          }
        }
      ]
    },
    {
      "name": "thaw_account",
      "docs": [
        "Thaw (unfreeze) a token account"
      ],
      "discriminator": [
        115,
        152,
        79,
        213,
        213,
        169,
        184,
        35
      ],
      "accounts": [
        {
          "name": "authority",
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
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
          "name": "mint",
          "relations": [
            "config"
          ]
        },
        {
          "name": "token_account",
          "writable": true
        },
        {
          "name": "token_program",
          "address": "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
        }
      ],
      "args": [
        {
          "name": "target",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "transfer_authority",
      "docs": [
        "Transfer master authority"
      ],
      "discriminator": [
        48,
        169,
        76,
        72,
        229,
        180,
        55,
        161
      ],
      "accounts": [
        {
          "name": "authority",
          "signer": true
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
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
          "name": "mint",
          "relations": [
            "config"
          ]
        }
      ],
      "args": [
        {
          "name": "new_master",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "unpause",
      "docs": [
        "Unpause operations"
      ],
      "discriminator": [
        169,
        144,
        4,
        38,
        10,
        141,
        188,
        255
      ],
      "accounts": [
        {
          "name": "authority",
          "signer": true
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
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
          "name": "mint",
          "relations": [
            "config"
          ]
        }
      ],
      "args": []
    },
    {
      "name": "update_minter",
      "docs": [
        "Update a minter's quota and status"
      ],
      "discriminator": [
        164,
        129,
        164,
        88,
        75,
        29,
        91,
        38
      ],
      "accounts": [
        {
          "name": "authority",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
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
          "name": "mint",
          "relations": [
            "config"
          ]
        },
        {
          "name": "minter_authority"
        },
        {
          "name": "minter_role",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  105,
                  110,
                  116,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "config"
              },
              {
                "kind": "account",
                "path": "minter_authority"
              }
            ]
          }
        },
        {
          "name": "system_program",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "args",
          "type": {
            "defined": {
              "name": "UpdateMinterArgs"
            }
          }
        }
      ]
    },
    {
      "name": "update_roles",
      "docs": [
        "Update operational roles"
      ],
      "discriminator": [
        220,
        152,
        205,
        233,
        177,
        123,
        219,
        125
      ],
      "accounts": [
        {
          "name": "authority",
          "signer": true
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
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
          "name": "mint",
          "relations": [
            "config"
          ]
        }
      ],
      "args": [
        {
          "name": "args",
          "type": {
            "defined": {
              "name": "UpdateRolesArgs"
            }
          }
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "ComplianceRecord",
      "discriminator": [
        147,
        228,
        164,
        27,
        251,
        44,
        67,
        185
      ]
    },
    {
      "name": "MinterRole",
      "discriminator": [
        21,
        246,
        6,
        133,
        142,
        211,
        33,
        193
      ]
    },
    {
      "name": "StablecoinConfig",
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
  "events": [
    {
      "name": "AccountFrozen",
      "discriminator": [
        221,
        214,
        59,
        29,
        246,
        50,
        119,
        206
      ]
    },
    {
      "name": "AccountThawed",
      "discriminator": [
        49,
        63,
        73,
        105,
        129,
        190,
        40,
        119
      ]
    },
    {
      "name": "AuthorityTransferred",
      "discriminator": [
        245,
        109,
        179,
        54,
        135,
        92,
        22,
        64
      ]
    },
    {
      "name": "BlacklistUpdated",
      "discriminator": [
        246,
        166,
        44,
        25,
        56,
        182,
        121,
        74
      ]
    },
    {
      "name": "Burned",
      "discriminator": [
        207,
        37,
        251,
        154,
        239,
        229,
        14,
        67
      ]
    },
    {
      "name": "CreationFinalized",
      "discriminator": [
        222,
        217,
        176,
        240,
        227,
        94,
        118,
        71
      ]
    },
    {
      "name": "Initialized",
      "discriminator": [
        208,
        213,
        115,
        98,
        115,
        82,
        201,
        209
      ]
    },
    {
      "name": "Minted",
      "discriminator": [
        174,
        131,
        21,
        57,
        88,
        117,
        114,
        121
      ]
    },
    {
      "name": "MinterUpdated",
      "discriminator": [
        8,
        124,
        66,
        45,
        176,
        53,
        49,
        153
      ]
    },
    {
      "name": "Paused",
      "discriminator": [
        172,
        248,
        5,
        253,
        49,
        255,
        255,
        232
      ]
    },
    {
      "name": "RolesUpdated",
      "discriminator": [
        81,
        37,
        176,
        32,
        30,
        204,
        251,
        246
      ]
    },
    {
      "name": "Seized",
      "discriminator": [
        197,
        48,
        203,
        203,
        174,
        37,
        100,
        65
      ]
    },
    {
      "name": "Unpaused",
      "discriminator": [
        156,
        150,
        47,
        174,
        120,
        216,
        93,
        117
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "Unauthorized",
      "msg": "Unauthorized"
    },
    {
      "code": 6001,
      "name": "Paused",
      "msg": "Program is paused"
    },
    {
      "code": 6002,
      "name": "InvalidMint",
      "msg": "Mint does not match config"
    },
    {
      "code": 6003,
      "name": "InvalidTreasury",
      "msg": "Invalid treasury token account"
    },
    {
      "code": 6004,
      "name": "QuotaExceeded",
      "msg": "Quota exceeded for current window"
    },
    {
      "code": 6005,
      "name": "InvalidQuota",
      "msg": "Invalid quota configuration"
    },
    {
      "code": 6006,
      "name": "MathOverflow",
      "msg": "Arithmetic overflow"
    },
    {
      "code": 6007,
      "name": "ComplianceDisabled",
      "msg": "Compliance features are disabled"
    },
    {
      "code": 6008,
      "name": "PermanentDelegateDisabled",
      "msg": "Permanent delegate extension is disabled"
    },
    {
      "code": 6009,
      "name": "WalletBlacklisted",
      "msg": "Wallet is blacklisted"
    },
    {
      "code": 6010,
      "name": "WalletNotBlacklisted",
      "msg": "Wallet is not blacklisted"
    },
    {
      "code": 6011,
      "name": "InvalidComplianceRecord",
      "msg": "Invalid compliance record"
    },
    {
      "code": 6012,
      "name": "InvalidTokenAccount",
      "msg": "Invalid token account"
    },
    {
      "code": 6013,
      "name": "MintSizingFailed",
      "msg": "Mint account sizing failed"
    },
    {
      "code": 6014,
      "name": "InvalidPresetConfiguration",
      "msg": "Invalid preset/extension configuration"
    }
  ],
  "types": [
    {
      "name": "AccountFrozen",
      "docs": [
        "Emitted when an account is frozen"
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "token_account",
            "type": "pubkey"
          },
          {
            "name": "authority",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "AccountThawed",
      "docs": [
        "Emitted when an account is thawed"
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "token_account",
            "type": "pubkey"
          },
          {
            "name": "authority",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "AuthorityTransferred",
      "docs": [
        "Emitted when master authority is transferred"
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "old_master",
            "type": "pubkey"
          },
          {
            "name": "new_master",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "BlacklistUpdated",
      "docs": [
        "Emitted when a wallet's blacklist status changes"
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "wallet",
            "type": "pubkey"
          },
          {
            "name": "blacklisted",
            "type": "bool"
          },
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "reason_hash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          }
        ]
      }
    },
    {
      "name": "Burned",
      "docs": [
        "Emitted when tokens are burned"
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "from",
            "type": "pubkey"
          },
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "ComplianceRecord",
      "docs": [
        "Compliance record for tracking blacklist status",
        "",
        "PDA derived with: [\"compliance\", mint, wallet]"
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "wallet",
            "type": "pubkey"
          },
          {
            "name": "blacklisted",
            "type": "bool"
          },
          {
            "name": "reason_hash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "updated_at",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "CreationFinalized",
      "docs": [
        "Emitted when mint/freeze control is handed to the config PDA"
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "config",
            "type": "pubkey"
          },
          {
            "name": "authority",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "InitializeArgs",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "name",
            "type": "string"
          },
          {
            "name": "symbol",
            "type": "string"
          },
          {
            "name": "uri",
            "type": "string"
          },
          {
            "name": "decimals",
            "type": "u8"
          },
          {
            "name": "preset",
            "type": {
              "defined": {
                "name": "Preset"
              }
            }
          },
          {
            "name": "enable_compliance",
            "type": "bool"
          },
          {
            "name": "enable_permanent_delegate",
            "type": "bool"
          },
          {
            "name": "enable_transfer_hook",
            "type": "bool"
          },
          {
            "name": "default_account_frozen",
            "type": "bool"
          },
          {
            "name": "seize_requires_blacklist",
            "type": "bool"
          },
          {
            "name": "transfer_hook_program",
            "type": "pubkey"
          },
          {
            "name": "roles",
            "type": {
              "defined": {
                "name": "RoleConfiguration"
              }
            }
          },
          {
            "name": "initial_minter_quota",
            "type": "u64"
          },
          {
            "name": "initial_minter_window_seconds",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "Initialized",
      "docs": [
        "Emitted when a new stablecoin is initialized"
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "config",
            "type": "pubkey"
          },
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "master",
            "type": "pubkey"
          },
          {
            "name": "preset",
            "type": "u8"
          },
          {
            "name": "compliance_enabled",
            "type": "bool"
          },
          {
            "name": "transfer_hook_enabled",
            "type": "bool"
          },
          {
            "name": "permanent_delegate_enabled",
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "Minted",
      "docs": [
        "Emitted when tokens are minted"
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "to",
            "type": "pubkey"
          },
          {
            "name": "minter",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "quota_used",
            "type": "u64"
          },
          {
            "name": "quota_limit",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "MinterRole",
      "docs": [
        "Role configuration for minter authorities",
        "",
        "PDA derived with: [\"minter\", config, authority]"
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "config",
            "type": "pubkey"
          },
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "active",
            "type": "bool"
          },
          {
            "name": "quota_amount",
            "type": "u64"
          },
          {
            "name": "window_seconds",
            "type": "i64"
          },
          {
            "name": "window_start_ts",
            "type": "i64"
          },
          {
            "name": "minted_in_window",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "MinterUpdated",
      "docs": [
        "Emitted when a minter role is updated"
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "minter",
            "type": "pubkey"
          },
          {
            "name": "active",
            "type": "bool"
          },
          {
            "name": "quota_amount",
            "type": "u64"
          },
          {
            "name": "window_seconds",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "Paused",
      "docs": [
        "Emitted when the stablecoin is paused"
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "authority",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "Preset",
      "repr": {
        "kind": "rust"
      },
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "Sss1"
          },
          {
            "name": "Sss2"
          }
        ]
      }
    },
    {
      "name": "RoleConfiguration",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "pauser",
            "type": {
              "option": "pubkey"
            }
          },
          {
            "name": "burner",
            "type": {
              "option": "pubkey"
            }
          },
          {
            "name": "blacklister",
            "type": {
              "option": "pubkey"
            }
          },
          {
            "name": "seizer",
            "type": {
              "option": "pubkey"
            }
          },
          {
            "name": "treasury",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "RolesUpdated",
      "docs": [
        "Emitted when operational roles are updated"
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "pauser",
            "type": "pubkey"
          },
          {
            "name": "burner",
            "type": "pubkey"
          },
          {
            "name": "blacklister",
            "type": "pubkey"
          },
          {
            "name": "seizer",
            "type": "pubkey"
          },
          {
            "name": "treasury",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "SeizeArgs",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "override_requires_blacklist",
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "Seized",
      "docs": [
        "Emitted when tokens are seized"
      ],
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
            "name": "source_owner",
            "type": "pubkey"
          },
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "override_requires_blacklist",
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "StablecoinConfig",
      "docs": [
        "Global configuration for a stablecoin mint",
        "",
        "PDA derived with: [\"config\", mint]"
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "preset",
            "type": "u8"
          },
          {
            "name": "decimals",
            "type": "u8"
          },
          {
            "name": "name",
            "type": "string"
          },
          {
            "name": "symbol",
            "type": "string"
          },
          {
            "name": "uri",
            "type": "string"
          },
          {
            "name": "master_authority",
            "type": "pubkey"
          },
          {
            "name": "pauser",
            "type": "pubkey"
          },
          {
            "name": "burner",
            "type": "pubkey"
          },
          {
            "name": "blacklister",
            "type": "pubkey"
          },
          {
            "name": "seizer",
            "type": "pubkey"
          },
          {
            "name": "treasury",
            "type": "pubkey"
          },
          {
            "name": "compliance_enabled",
            "type": "bool"
          },
          {
            "name": "paused",
            "type": "bool"
          },
          {
            "name": "seize_requires_blacklist",
            "type": "bool"
          },
          {
            "name": "permanent_delegate_enabled",
            "type": "bool"
          },
          {
            "name": "transfer_hook_enabled",
            "type": "bool"
          },
          {
            "name": "default_account_frozen",
            "type": "bool"
          },
          {
            "name": "transfer_hook_program",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "Unpaused",
      "docs": [
        "Emitted when the stablecoin is unpaused"
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "authority",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "UpdateMinterArgs",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "active",
            "type": "bool"
          },
          {
            "name": "quota_amount",
            "type": "u64"
          },
          {
            "name": "window_seconds",
            "type": "i64"
          },
          {
            "name": "reset_window",
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "UpdateRolesArgs",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "pauser",
            "type": {
              "option": "pubkey"
            }
          },
          {
            "name": "burner",
            "type": {
              "option": "pubkey"
            }
          },
          {
            "name": "blacklister",
            "type": {
              "option": "pubkey"
            }
          },
          {
            "name": "seizer",
            "type": {
              "option": "pubkey"
            }
          },
          {
            "name": "treasury",
            "type": {
              "option": "pubkey"
            }
          }
        ]
      }
    }
  ]
} as const satisfies Idl;
