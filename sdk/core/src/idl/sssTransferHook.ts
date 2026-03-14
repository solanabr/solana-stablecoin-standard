import type { Idl } from "@coral-xyz/anchor";

export const SSS_TRANSFER_HOOK_IDL = {
  "address": "CHfiQPpbATb9qDbYMA8sRKPxRu3sYHdMW4s4JG4xJt1H",
  "metadata": {
    "name": "sss_transfer_hook",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Transfer hook program for Solana Stablecoin Standard"
  },
  "instructions": [
    {
      "name": "execute",
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
          "name": "source_token"
        },
        {
          "name": "mint"
        },
        {
          "name": "destination_token"
        },
        {
          "name": "authority"
        },
        {
          "name": "extra_account_meta_list",
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
          "name": "hook_config",
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
          "name": "stablecoin_program"
        },
        {
          "name": "stablecoin_config"
        },
        {
          "name": "source_compliance_record"
        },
        {
          "name": "destination_compliance_record"
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
      "name": "initialize_extra_account_meta_list",
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
          "name": "hook_config",
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
          "name": "extra_account_meta_list",
          "writable": true
        },
        {
          "name": "mint",
          "relations": [
            "hook_config"
          ]
        },
        {
          "name": "system_program",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "initialize_hook",
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
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "hook_config",
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
          "name": "mint"
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
              "name": "InitializeHookArgs"
            }
          }
        }
      ]
    },
    {
      "name": "update_hook_config",
      "discriminator": [
        238,
        90,
        242,
        7,
        243,
        85,
        69,
        32
      ],
      "accounts": [
        {
          "name": "authority",
          "signer": true
        },
        {
          "name": "hook_config",
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
          "name": "mint",
          "relations": [
            "hook_config"
          ]
        },
        {
          "name": "stablecoin_config"
        }
      ],
      "args": [
        {
          "name": "args",
          "type": {
            "defined": {
              "name": "UpdateHookConfigArgs"
            }
          }
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "HookConfig",
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
    }
  ],
  "events": [
    {
      "name": "ExtraMetaListInitialized",
      "discriminator": [
        13,
        53,
        210,
        210,
        51,
        75,
        18,
        193
      ]
    },
    {
      "name": "HookConfigUpdated",
      "discriminator": [
        124,
        57,
        60,
        231,
        221,
        95,
        253,
        85
      ]
    },
    {
      "name": "HookInitialized",
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
      "name": "TransferHookAllowlisted",
      "discriminator": [
        192,
        197,
        142,
        131,
        45,
        184,
        134,
        229
      ]
    },
    {
      "name": "TransferValidated",
      "discriminator": [
        171,
        133,
        176,
        35,
        131,
        74,
        31,
        221
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "InvalidMint",
      "msg": "Mint mismatch"
    },
    {
      "code": 6001,
      "name": "InvalidValidationPda",
      "msg": "Invalid validation PDA"
    },
    {
      "code": 6002,
      "name": "DecodeFailed",
      "msg": "Unable to decode account data"
    },
    {
      "code": 6003,
      "name": "AccountDataTooSmall",
      "msg": "Anchor account payload is too small"
    },
    {
      "code": 6004,
      "name": "SourceBlacklisted",
      "msg": "Source owner is blacklisted"
    },
    {
      "code": 6005,
      "name": "DestinationBlacklisted",
      "msg": "Destination owner is blacklisted"
    },
    {
      "code": 6006,
      "name": "TransfersPaused",
      "msg": "Transfers are paused"
    },
    {
      "code": 6007,
      "name": "InvalidComplianceRecord",
      "msg": "Invalid compliance record PDA"
    },
    {
      "code": 6008,
      "name": "InvalidStablecoinProgram",
      "msg": "Invalid stablecoin program account"
    },
    {
      "code": 6009,
      "name": "InvalidStablecoinConfig",
      "msg": "Invalid stablecoin config account"
    },
    {
      "code": 6010,
      "name": "InvalidTokenAccount",
      "msg": "Invalid token account"
    },
    {
      "code": 6011,
      "name": "Unauthorized",
      "msg": "Unauthorized"
    },
    {
      "code": 6012,
      "name": "InvalidFallbackData",
      "msg": "Invalid fallback payload"
    }
  ],
  "types": [
    {
      "name": "ExtraMetaListInitialized",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "validation_pda",
            "type": "pubkey"
          },
          {
            "name": "entry_count",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "HookAllowReason",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "SeizeRoute"
          }
        ]
      }
    },
    {
      "name": "HookConfig",
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
            "name": "stablecoin_program",
            "type": "pubkey"
          },
          {
            "name": "stablecoin_config",
            "type": "pubkey"
          },
          {
            "name": "treasury_token_account",
            "type": "pubkey"
          },
          {
            "name": "enforce_pause",
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "HookConfigUpdated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "stablecoin_config",
            "type": "pubkey"
          },
          {
            "name": "treasury_token_account",
            "type": "pubkey"
          },
          {
            "name": "enforce_pause",
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "HookInitialized",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "stablecoin_program",
            "type": "pubkey"
          },
          {
            "name": "stablecoin_config",
            "type": "pubkey"
          },
          {
            "name": "treasury_token_account",
            "type": "pubkey"
          },
          {
            "name": "enforce_pause",
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "InitializeHookArgs",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "stablecoin_program",
            "type": "pubkey"
          },
          {
            "name": "stablecoin_config",
            "type": "pubkey"
          },
          {
            "name": "treasury_token_account",
            "type": "pubkey"
          },
          {
            "name": "enforce_pause",
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "TransferHookAllowlisted",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "reason",
            "type": {
              "defined": {
                "name": "HookAllowReason"
              }
            }
          }
        ]
      }
    },
    {
      "name": "TransferValidated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "source_owner",
            "type": "pubkey"
          },
          {
            "name": "destination_owner",
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
      "name": "UpdateHookConfigArgs",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "stablecoin_config",
            "type": {
              "option": "pubkey"
            }
          },
          {
            "name": "treasury_token_account",
            "type": {
              "option": "pubkey"
            }
          },
          {
            "name": "enforce_pause",
            "type": {
              "option": "bool"
            }
          }
        ]
      }
    }
  ]
} as const satisfies Idl;
