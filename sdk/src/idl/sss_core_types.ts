/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/sss_core.json`.
 */
export type SssCore = {
  "address": "CZzvCtyZC8KR37DNDeGYpwN46YEc7WEh6RyeSRdhjY4Y",
  "metadata": {
    "name": "sssCore",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Core stablecoin program for the Solana Stablecoin Standard"
  },
  "instructions": [
    {
      "name": "acceptAuthority",
      "docs": [
        "Accept a pending authority transfer. Must be called by the pending authority."
      ],
      "discriminator": [
        107,
        86,
        198,
        91,
        33,
        12,
        107,
        160
      ],
      "accounts": [
        {
          "name": "newAuthority",
          "docs": [
            "The pending authority accepting the transfer."
          ],
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
                "path": "config.mint",
                "account": "stablecoinConfig"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "burnTokens",
      "docs": [
        "Burn tokens from the signer's token account."
      ],
      "discriminator": [
        76,
        15,
        51,
        254,
        229,
        215,
        121,
        66
      ],
      "accounts": [
        {
          "name": "burner",
          "docs": [
            "The token holder burning their tokens."
          ],
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
                "path": "config.mint",
                "account": "stablecoinConfig"
              }
            ]
          }
        },
        {
          "name": "mint",
          "writable": true
        },
        {
          "name": "tokenAccount",
          "docs": [
            "Token account to burn from. Must be owned by the burner."
          ],
          "writable": true
        },
        {
          "name": "tokenProgram"
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
      "name": "configureMinter",
      "docs": [
        "Configure a new minter or update an existing minter's quota."
      ],
      "discriminator": [
        182,
        155,
        212,
        100,
        11,
        175,
        51,
        242
      ],
      "accounts": [
        {
          "name": "masterMinter",
          "docs": [
            "The master minter who is configuring this minter."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "docs": [
            "The stablecoin config. Validates signer is master_minter and not paused."
          ],
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
                "path": "config.mint",
                "account": "stablecoinConfig"
              }
            ]
          }
        },
        {
          "name": "minterState",
          "docs": [
            "Per-minter state. Created if it doesn't exist, updated if it does."
          ],
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
                "kind": "arg",
                "path": "minterWallet"
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
          "name": "minterWallet",
          "type": "pubkey"
        },
        {
          "name": "quota",
          "type": "u64"
        }
      ]
    },
    {
      "name": "freezeAccount",
      "docs": [
        "Freeze a token account. Available to authority and blacklister.",
        "Works even when paused (emergency power)."
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
          "name": "signer",
          "docs": [
            "Must be either the authority or the blacklister."
          ],
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
                "path": "config.mint",
                "account": "stablecoinConfig"
              }
            ]
          }
        },
        {
          "name": "mint"
        },
        {
          "name": "targetTokenAccount",
          "writable": true
        },
        {
          "name": "mintAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  105,
                  110,
                  116,
                  45,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
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
          "name": "tokenProgram",
          "address": "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
        }
      ],
      "args": []
    },
    {
      "name": "initialize",
      "docs": [
        "Initialize a new stablecoin with the specified preset and metadata."
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
          "name": "authority",
          "docs": [
            "Authority who will own this stablecoin. Pays for account creation."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "mint",
          "docs": [
            "Fresh keypair for the Token-2022 mint. Client generates and signs."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "docs": [
            "Stablecoin configuration PDA."
          ],
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
          "name": "mintAuthority",
          "docs": [
            "Mint authority PDA — holds mint, freeze, and permanent delegate authority."
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  105,
                  110,
                  116,
                  45,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
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
          "name": "hookProgram",
          "docs": [
            "The hook program ID for SSS-2. Required if preset == 2."
          ],
          "optional": true
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
      "args": [
        {
          "name": "params",
          "type": {
            "defined": {
              "name": "initializeParams"
            }
          }
        }
      ]
    },
    {
      "name": "mintTokens",
      "docs": [
        "Mint tokens to a destination account. Enforces minter quota."
      ],
      "discriminator": [
        59,
        132,
        24,
        246,
        122,
        39,
        8,
        243
      ],
      "accounts": [
        {
          "name": "minter",
          "docs": [
            "The authorized minter."
          ],
          "signer": true
        },
        {
          "name": "config",
          "docs": [
            "Stablecoin config. Must not be paused."
          ],
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
                "path": "config.mint",
                "account": "stablecoinConfig"
              }
            ]
          }
        },
        {
          "name": "minterState",
          "docs": [
            "Minter's state. Must be enabled and match signer."
          ],
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
                "path": "minter"
              }
            ]
          }
        },
        {
          "name": "mint",
          "docs": [
            "The stablecoin mint."
          ],
          "writable": true
        },
        {
          "name": "destination",
          "docs": [
            "Destination token account to receive minted tokens."
          ],
          "writable": true
        },
        {
          "name": "mintAuthority",
          "docs": [
            "Mint authority PDA."
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  105,
                  110,
                  116,
                  45,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
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
          "name": "tokenProgram"
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
        "Pause all minting, burning, and transfer operations."
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
          "name": "pauser",
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
                "path": "config.mint",
                "account": "stablecoinConfig"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "removeMinter",
      "docs": [
        "Disable a minter. Account is preserved for audit trail."
      ],
      "discriminator": [
        241,
        69,
        84,
        16,
        164,
        232,
        131,
        79
      ],
      "accounts": [
        {
          "name": "masterMinter",
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
                "path": "config.mint",
                "account": "stablecoinConfig"
              }
            ]
          }
        },
        {
          "name": "minterState",
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
                "path": "minter_state.minter",
                "account": "minterState"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "seize",
      "docs": [
        "Seize tokens from a target account using the permanent delegate (SSS-2 only)."
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
          "docs": [
            "Only the authority can seize tokens."
          ],
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
                "path": "config.mint",
                "account": "stablecoinConfig"
              }
            ]
          }
        },
        {
          "name": "mint"
        },
        {
          "name": "sourceTokenAccount",
          "docs": [
            "The target account to seize tokens from."
          ],
          "writable": true
        },
        {
          "name": "destinationTokenAccount",
          "docs": [
            "Treasury or authority's token account to receive seized tokens."
          ],
          "writable": true
        },
        {
          "name": "mintAuthority",
          "docs": [
            "Mint authority PDA acting as permanent delegate."
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  105,
                  110,
                  116,
                  45,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
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
          "name": "tokenProgram",
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
      "name": "thawAccount",
      "docs": [
        "Thaw a frozen token account. Available to authority and blacklister.",
        "Works even when paused (emergency power)."
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
          "name": "signer",
          "docs": [
            "Must be either the authority or the blacklister."
          ],
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
                "path": "config.mint",
                "account": "stablecoinConfig"
              }
            ]
          }
        },
        {
          "name": "mint"
        },
        {
          "name": "targetTokenAccount",
          "writable": true
        },
        {
          "name": "mintAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  105,
                  110,
                  116,
                  45,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
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
          "name": "tokenProgram",
          "address": "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
        }
      ],
      "args": []
    },
    {
      "name": "transferAuthority",
      "docs": [
        "Initiate a two-step authority transfer."
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
                "path": "config.mint",
                "account": "stablecoinConfig"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "newAuthority",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "unpause",
      "docs": [
        "Resume operations after a pause."
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
          "name": "pauser",
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
                "path": "config.mint",
                "account": "stablecoinConfig"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "updateRole",
      "docs": [
        "Update a role assignment. Only the authority can call this."
      ],
      "discriminator": [
        36,
        223,
        162,
        98,
        168,
        209,
        75,
        151
      ],
      "accounts": [
        {
          "name": "authority",
          "docs": [
            "Only the authority can update roles."
          ],
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
                "path": "config.mint",
                "account": "stablecoinConfig"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "role",
          "type": {
            "defined": {
              "name": "roleType"
            }
          }
        },
        {
          "name": "newAddress",
          "type": "pubkey"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "minterState",
      "discriminator": [
        251,
        69,
        145,
        137,
        48,
        218,
        88,
        148
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
      "name": "invalidPreset",
      "msg": "Invalid preset: must be 1 (Minimal) or 2 (Compliant)"
    },
    {
      "code": 6001,
      "name": "invalidDecimals",
      "msg": "Invalid decimals: must be between 0 and 9"
    },
    {
      "code": 6002,
      "name": "paused",
      "msg": "Operations are paused"
    },
    {
      "code": 6003,
      "name": "notPaused",
      "msg": "Operations are not paused"
    },
    {
      "code": 6004,
      "name": "notAuthority",
      "msg": "Unauthorized: caller is not the authority"
    },
    {
      "code": 6005,
      "name": "notMasterMinter",
      "msg": "Unauthorized: caller is not the master minter"
    },
    {
      "code": 6006,
      "name": "notPauser",
      "msg": "Unauthorized: caller is not the pauser"
    },
    {
      "code": 6007,
      "name": "notBlacklister",
      "msg": "Unauthorized: caller is not the blacklister"
    },
    {
      "code": 6008,
      "name": "unauthorized",
      "msg": "Unauthorized: caller does not have the required role"
    },
    {
      "code": 6009,
      "name": "minterDisabled",
      "msg": "Minter is not enabled"
    },
    {
      "code": 6010,
      "name": "quotaExceeded",
      "msg": "Minting quota exceeded"
    },
    {
      "code": 6011,
      "name": "zeroAmount",
      "msg": "Amount must be greater than zero"
    },
    {
      "code": 6012,
      "name": "noPendingAuthority",
      "msg": "No pending authority transfer"
    },
    {
      "code": 6013,
      "name": "notPendingAuthority",
      "msg": "Caller is not the pending authority"
    },
    {
      "code": 6014,
      "name": "presetFeatureUnavailable",
      "msg": "Feature not available for this preset"
    },
    {
      "code": 6015,
      "name": "arithmeticOverflow",
      "msg": "Arithmetic overflow"
    },
    {
      "code": 6016,
      "name": "hookProgramRequired",
      "msg": "Hook program is required for SSS-2 preset"
    },
    {
      "code": 6017,
      "name": "nameTooLong",
      "msg": "Name exceeds maximum length"
    },
    {
      "code": 6018,
      "name": "symbolTooLong",
      "msg": "Symbol exceeds maximum length"
    },
    {
      "code": 6019,
      "name": "uriTooLong",
      "msg": "URI exceeds maximum length"
    }
  ],
  "types": [
    {
      "name": "initializeParams",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "preset",
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
            "name": "decimals",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "minterState",
      "docs": [
        "Per-minter state tracking quotas and usage.",
        "",
        "PDA: `[b\"minter\", config.key().as_ref(), minter.key().as_ref()]`"
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "config",
            "docs": [
              "The parent stablecoin config."
            ],
            "type": "pubkey"
          },
          {
            "name": "minter",
            "docs": [
              "The minter's wallet address."
            ],
            "type": "pubkey"
          },
          {
            "name": "quota",
            "docs": [
              "Maximum tokens this minter is allowed to mint."
            ],
            "type": "u64"
          },
          {
            "name": "mintedAmount",
            "docs": [
              "Tokens minted so far (consumed quota). Burning does NOT reduce this."
            ],
            "type": "u64"
          },
          {
            "name": "enabled",
            "docs": [
              "Whether this minter is currently active."
            ],
            "type": "bool"
          },
          {
            "name": "bump",
            "docs": [
              "Bump for this minter PDA."
            ],
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "roleType",
      "docs": [
        "Role type enum for the update_role instruction."
      ],
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "masterMinter"
          },
          {
            "name": "pauser"
          },
          {
            "name": "blacklister"
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
