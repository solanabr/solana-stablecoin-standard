/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/sss_core.json`.
 */
export type SssCore = {
  "address": "Corep3pXJzUGaqpw2xzWQi4q63cn1STABiCDMJhMECB",
  "metadata": {
    "name": "sssCore",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Solana Stablecoin Standard - Core Program"
  },
  "instructions": [
    {
      "name": "burnTokens",
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
                  115,
                  115,
                  115,
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
          "name": "burnerRole",
          "docs": [
            "Burner role PDA — its existence proves burn authorization."
          ]
        },
        {
          "name": "mint",
          "writable": true
        },
        {
          "name": "from",
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
      "name": "freezeAccount",
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
          "name": "freezer",
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  115,
                  115,
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
          "name": "freezerRole"
        },
        {
          "name": "mint"
        },
        {
          "name": "tokenAccount",
          "writable": true
        },
        {
          "name": "tokenProgram"
        }
      ],
      "args": []
    },
    {
      "name": "grantRole",
      "discriminator": [
        218,
        234,
        128,
        15,
        82,
        33,
        236,
        253
      ],
      "accounts": [
        {
          "name": "admin",
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
                  115,
                  115,
                  115,
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
                "path": "config.mint",
                "account": "stablecoinConfig"
              }
            ]
          }
        },
        {
          "name": "adminRole",
          "docs": [
            "Admin's own role PDA — proves admin authorization."
          ]
        },
        {
          "name": "grantee",
          "docs": [
            "The address receiving the role."
          ]
        },
        {
          "name": "roleAccount",
          "writable": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "role",
          "type": "u8"
        }
      ]
    },
    {
      "name": "initialize",
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
          "writable": true,
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
                  115,
                  115,
                  115,
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
          "name": "mint",
          "docs": [
            "The Token-2022 mint, created externally by the SDK before this instruction."
          ]
        },
        {
          "name": "adminRole",
          "writable": true
        },
        {
          "name": "tokenProgram"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "args",
          "type": {
            "defined": {
              "name": "initializeArgs"
            }
          }
        }
      ]
    },
    {
      "name": "mintTokens",
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
                  115,
                  115,
                  115,
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
          "name": "minterRole",
          "docs": [
            "Minter role PDA — its existence proves authorization.",
            "Mutable for per-minter quota tracking (amount_minted)."
          ],
          "writable": true
        },
        {
          "name": "mint",
          "writable": true
        },
        {
          "name": "to",
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
      "name": "pause",
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
                  115,
                  115,
                  115,
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
                "path": "config.mint",
                "account": "stablecoinConfig"
              }
            ]
          }
        },
        {
          "name": "pauserRole"
        }
      ],
      "args": []
    },
    {
      "name": "revokeRole",
      "discriminator": [
        179,
        232,
        2,
        180,
        48,
        227,
        82,
        7
      ],
      "accounts": [
        {
          "name": "admin",
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
                  115,
                  115,
                  115,
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
                "path": "config.mint",
                "account": "stablecoinConfig"
              }
            ]
          }
        },
        {
          "name": "adminRole",
          "docs": [
            "Admin's own role PDA — proves admin authorization."
          ]
        },
        {
          "name": "roleAccount",
          "docs": [
            "The role PDA being revoked. Closed and rent returned to admin."
          ],
          "writable": true
        }
      ],
      "args": []
    },
    {
      "name": "seize",
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
          "name": "seizer",
          "signer": true
        },
        {
          "name": "config",
          "docs": [
            "NO pause check — seizure works during emergencies."
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  115,
                  115,
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
          "name": "seizerRole",
          "docs": [
            "Seizer role PDA — its existence proves seizure authorization."
          ]
        },
        {
          "name": "mint"
        },
        {
          "name": "from",
          "writable": true
        },
        {
          "name": "to",
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
      "name": "thawAccount",
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
          "name": "freezer",
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  115,
                  115,
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
          "name": "freezerRole"
        },
        {
          "name": "mint"
        },
        {
          "name": "tokenAccount",
          "writable": true
        },
        {
          "name": "tokenProgram"
        }
      ],
      "args": []
    },
    {
      "name": "transferAuthority",
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
          "name": "admin",
          "writable": true,
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
                  115,
                  115,
                  115,
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
                "path": "config.mint",
                "account": "stablecoinConfig"
              }
            ]
          }
        },
        {
          "name": "adminRole",
          "docs": [
            "The caller's admin role PDA — will be closed."
          ],
          "writable": true
        },
        {
          "name": "newAuthority"
        },
        {
          "name": "newAdminRole",
          "docs": [
            "The new authority's admin role PDA — will be created."
          ],
          "writable": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "unpause",
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
                  115,
                  115,
                  115,
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
                "path": "config.mint",
                "account": "stablecoinConfig"
              }
            ]
          }
        },
        {
          "name": "pauserRole"
        }
      ],
      "args": []
    },
    {
      "name": "updateMinter",
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
          "name": "admin",
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  115,
                  115,
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
                "path": "config.mint",
                "account": "stablecoinConfig"
              }
            ]
          }
        },
        {
          "name": "adminRole",
          "docs": [
            "Admin role PDA — proves admin authorization."
          ]
        },
        {
          "name": "minterRole",
          "docs": [
            "The minter's role account to update. Must be a Minter role."
          ],
          "writable": true
        }
      ],
      "args": [
        {
          "name": "newQuota",
          "type": {
            "option": "u64"
          }
        }
      ]
    },
    {
      "name": "updateSupplyCap",
      "discriminator": [
        9,
        215,
        52,
        77,
        1,
        9,
        162,
        17
      ],
      "accounts": [
        {
          "name": "admin",
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
                  115,
                  115,
                  115,
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
                "path": "config.mint",
                "account": "stablecoinConfig"
              }
            ]
          }
        },
        {
          "name": "adminRole"
        }
      ],
      "args": [
        {
          "name": "newSupplyCap",
          "type": {
            "option": "u64"
          }
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "roleAccount",
      "discriminator": [
        142,
        236,
        135,
        197,
        214,
        3,
        244,
        226
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
  "events": [
    {
      "name": "accountFrozen",
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
      "name": "accountThawed",
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
      "name": "authorityTransferred",
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
      "name": "configUpdated",
      "discriminator": [
        40,
        241,
        230,
        122,
        11,
        19,
        198,
        194
      ]
    },
    {
      "name": "operationsPaused",
      "discriminator": [
        173,
        3,
        52,
        125,
        217,
        125,
        167,
        81
      ]
    },
    {
      "name": "operationsUnpaused",
      "discriminator": [
        54,
        216,
        228,
        170,
        9,
        168,
        101,
        17
      ]
    },
    {
      "name": "roleGranted",
      "discriminator": [
        220,
        183,
        89,
        228,
        143,
        63,
        246,
        58
      ]
    },
    {
      "name": "roleRevoked",
      "discriminator": [
        167,
        183,
        52,
        229,
        126,
        206,
        62,
        61
      ]
    },
    {
      "name": "stablecoinInitialized",
      "discriminator": [
        238,
        217,
        135,
        14,
        147,
        33,
        221,
        169
      ]
    },
    {
      "name": "tokensBurned",
      "discriminator": [
        230,
        255,
        34,
        113,
        226,
        53,
        227,
        9
      ]
    },
    {
      "name": "tokensMinted",
      "discriminator": [
        207,
        212,
        128,
        194,
        175,
        54,
        64,
        24
      ]
    },
    {
      "name": "tokensSeized",
      "discriminator": [
        51,
        129,
        131,
        114,
        206,
        234,
        140,
        122
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "paused",
      "msg": "Operations are paused"
    },
    {
      "code": 6001,
      "name": "notPaused",
      "msg": "Operations are not paused"
    },
    {
      "code": 6002,
      "name": "supplyCapExceeded",
      "msg": "Supply cap exceeded"
    },
    {
      "code": 6003,
      "name": "unauthorized",
      "msg": "Unauthorized: missing required role"
    },
    {
      "code": 6004,
      "name": "invalidPreset",
      "msg": "Invalid preset value"
    },
    {
      "code": 6005,
      "name": "lastAdmin",
      "msg": "Cannot remove the last admin"
    },
    {
      "code": 6006,
      "name": "arithmeticOverflow",
      "msg": "Overflow in arithmetic operation"
    },
    {
      "code": 6007,
      "name": "mintMismatch",
      "msg": "Mint mismatch"
    },
    {
      "code": 6008,
      "name": "invalidSupplyCap",
      "msg": "Invalid supply cap: must be >= current supply"
    },
    {
      "code": 6009,
      "name": "zeroAmount",
      "msg": "Amount must be greater than zero"
    },
    {
      "code": 6010,
      "name": "invalidRole",
      "msg": "Invalid role value"
    },
    {
      "code": 6011,
      "name": "invalidOracleData",
      "msg": "Invalid oracle price feed data"
    },
    {
      "code": 6012,
      "name": "invalidOraclePrice",
      "msg": "Oracle price is stale or non-positive"
    },
    {
      "code": 6013,
      "name": "quotaExceeded",
      "msg": "Minter quota exceeded"
    },
    {
      "code": 6014,
      "name": "nameTooLong",
      "msg": "Name exceeds maximum length of 32 characters"
    },
    {
      "code": 6015,
      "name": "symbolTooLong",
      "msg": "Symbol exceeds maximum length of 10 characters"
    },
    {
      "code": 6016,
      "name": "uriTooLong",
      "msg": "URI exceeds maximum length of 200 characters"
    }
  ],
  "types": [
    {
      "name": "accountFrozen",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "account",
            "type": "pubkey"
          },
          {
            "name": "freezer",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "accountThawed",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "account",
            "type": "pubkey"
          },
          {
            "name": "freezer",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "authorityTransferred",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "config",
            "type": "pubkey"
          },
          {
            "name": "from",
            "type": "pubkey"
          },
          {
            "name": "to",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "configUpdated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "config",
            "type": "pubkey"
          },
          {
            "name": "field",
            "type": "string"
          },
          {
            "name": "updater",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "initializeArgs",
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
          },
          {
            "name": "supplyCap",
            "type": {
              "option": "u64"
            }
          },
          {
            "name": "enablePermanentDelegate",
            "docs": [
              "Override preset default for permanent delegate. If None, derived from preset."
            ],
            "type": {
              "option": "bool"
            }
          },
          {
            "name": "enableTransferHook",
            "docs": [
              "Override preset default for transfer hook. If None, derived from preset."
            ],
            "type": {
              "option": "bool"
            }
          },
          {
            "name": "defaultAccountFrozen",
            "docs": [
              "Override preset default for default-frozen accounts. If None, derived from preset."
            ],
            "type": {
              "option": "bool"
            }
          }
        ]
      }
    },
    {
      "name": "operationsPaused",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "pauser",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "operationsUnpaused",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "pauser",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "role",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "admin"
          },
          {
            "name": "minter"
          },
          {
            "name": "freezer"
          },
          {
            "name": "pauser"
          },
          {
            "name": "burner"
          },
          {
            "name": "blacklister"
          },
          {
            "name": "seizer"
          }
        ]
      }
    },
    {
      "name": "roleAccount",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "config",
            "type": "pubkey"
          },
          {
            "name": "address",
            "type": "pubkey"
          },
          {
            "name": "role",
            "type": {
              "defined": {
                "name": "role"
              }
            }
          },
          {
            "name": "grantedBy",
            "type": "pubkey"
          },
          {
            "name": "grantedAt",
            "type": "i64"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "mintQuota",
            "docs": [
              "Per-minter quota: maximum amount this minter is allowed to mint.",
              "None means unlimited. Only meaningful for Role::Minter."
            ],
            "type": {
              "option": "u64"
            }
          },
          {
            "name": "amountMinted",
            "docs": [
              "Cumulative amount minted by this minter. Only tracked for Role::Minter."
            ],
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "roleGranted",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "config",
            "type": "pubkey"
          },
          {
            "name": "address",
            "type": "pubkey"
          },
          {
            "name": "role",
            "type": "u8"
          },
          {
            "name": "grantedBy",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "roleRevoked",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "config",
            "type": "pubkey"
          },
          {
            "name": "address",
            "type": "pubkey"
          },
          {
            "name": "role",
            "type": "u8"
          },
          {
            "name": "revokedBy",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "stablecoinConfig",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "authority",
            "type": "pubkey"
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
            "name": "paused",
            "type": "bool"
          },
          {
            "name": "supplyCap",
            "type": {
              "option": "u64"
            }
          },
          {
            "name": "totalMinted",
            "type": "u64"
          },
          {
            "name": "totalBurned",
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "name",
            "docs": [
              "Stablecoin name (max 32 chars)."
            ],
            "type": "string"
          },
          {
            "name": "symbol",
            "docs": [
              "Stablecoin ticker symbol (max 10 chars)."
            ],
            "type": "string"
          },
          {
            "name": "uri",
            "docs": [
              "Metadata URI (max 200 chars)."
            ],
            "type": "string"
          },
          {
            "name": "decimals",
            "docs": [
              "Token decimals (e.g. 6 for USDC-style)."
            ],
            "type": "u8"
          },
          {
            "name": "enablePermanentDelegate",
            "docs": [
              "Whether the config PDA is set as permanent delegate on token accounts."
            ],
            "type": "bool"
          },
          {
            "name": "enableTransferHook",
            "docs": [
              "Whether a transfer hook program is attached to the mint."
            ],
            "type": "bool"
          },
          {
            "name": "defaultAccountFrozen",
            "docs": [
              "Whether new token accounts are frozen by default (requires explicit thaw)."
            ],
            "type": "bool"
          },
          {
            "name": "reserved",
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
      "name": "stablecoinInitialized",
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
            "name": "preset",
            "type": "u8"
          },
          {
            "name": "supplyCap",
            "type": {
              "option": "u64"
            }
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
            "name": "decimals",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "tokensBurned",
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
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "burner",
            "type": "pubkey"
          },
          {
            "name": "newSupply",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "tokensMinted",
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
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "minter",
            "type": "pubkey"
          },
          {
            "name": "newSupply",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "tokensSeized",
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
            "name": "to",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "seizer",
            "type": "pubkey"
          }
        ]
      }
    }
  ]
};
