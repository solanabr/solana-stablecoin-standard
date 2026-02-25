/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/sss_token.json`.
 */
export type SssToken = {
  "address": "E7iCiXrkudyt5j1nVHHmbuqCEyLP2hD4VGNJyuPAdWwP",
  "metadata": {
    "name": "sssToken",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "SSS Token: Solana Stablecoin Standard — SSS-1 and SSS-2 preset support"
  },
  "instructions": [
    {
      "name": "addMinter",
      "docs": [
        "Add a new minter with associated MinterInfo PDA (quota tracking).",
        "Only master authority can call this."
      ],
      "discriminator": [
        75,
        86,
        218,
        40,
        219,
        6,
        141,
        29
      ],
      "accounts": [
        {
          "name": "authority",
          "writable": true,
          "signer": true,
          "relations": [
            "stablecoinConfig"
          ]
        },
        {
          "name": "stablecoinConfig",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  116,
                  97,
                  98,
                  108,
                  101,
                  99,
                  111,
                  105,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "stablecoin_config.mint",
                "account": "stablecoinConfig"
              }
            ]
          }
        },
        {
          "name": "roleManager",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  111,
                  108,
                  101,
                  115
                ]
              },
              {
                "kind": "account",
                "path": "stablecoinConfig"
              }
            ]
          }
        },
        {
          "name": "minterInfo",
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
                "path": "stablecoinConfig"
              },
              {
                "kind": "arg",
                "path": "minter"
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
          "name": "minter",
          "type": "pubkey"
        },
        {
          "name": "quota",
          "type": "u64"
        }
      ]
    },
    {
      "name": "addRole",
      "docs": [
        "Add an address to a role (Burner, Pauser, Blacklister, Seizer).",
        "For Minter role, use add_minter instead (creates MinterInfo PDA)."
      ],
      "discriminator": [
        45,
        20,
        52,
        132,
        56,
        24,
        179,
        37
      ],
      "accounts": [
        {
          "name": "authority",
          "signer": true,
          "relations": [
            "stablecoinConfig"
          ]
        },
        {
          "name": "stablecoinConfig",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  116,
                  97,
                  98,
                  108,
                  101,
                  99,
                  111,
                  105,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "stablecoin_config.mint",
                "account": "stablecoinConfig"
              }
            ]
          }
        },
        {
          "name": "roleManager",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  111,
                  108,
                  101,
                  115
                ]
              },
              {
                "kind": "account",
                "path": "stablecoinConfig"
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
          "name": "address",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "addToBlacklist",
      "docs": [
        "Add an address to the compliance blacklist (SSS-2 only).",
        "Creates a BlacklistEntry PDA — transfer hook rejects transfers involving this address."
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
          "writable": true,
          "signer": true
        },
        {
          "name": "stablecoinConfig",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  116,
                  97,
                  98,
                  108,
                  101,
                  99,
                  111,
                  105,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "stablecoin_config.mint",
                "account": "stablecoinConfig"
              }
            ]
          }
        },
        {
          "name": "roleManager",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  111,
                  108,
                  101,
                  115
                ]
              },
              {
                "kind": "account",
                "path": "stablecoinConfig"
              }
            ]
          }
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
                "path": "stablecoin_config.mint",
                "account": "stablecoinConfig"
              },
              {
                "kind": "arg",
                "path": "address"
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
          "name": "address",
          "type": "pubkey"
        },
        {
          "name": "reason",
          "type": "string"
        }
      ]
    },
    {
      "name": "burnTokens",
      "docs": [
        "Burn tokens from the caller's own token account.",
        "Caller must hold the Burner role."
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
          "writable": true,
          "signer": true
        },
        {
          "name": "stablecoinConfig",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  116,
                  97,
                  98,
                  108,
                  101,
                  99,
                  111,
                  105,
                  110
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
          "name": "roleManager",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  111,
                  108,
                  101,
                  115
                ]
              },
              {
                "kind": "account",
                "path": "stablecoinConfig"
              }
            ]
          }
        },
        {
          "name": "mint",
          "writable": true
        },
        {
          "name": "burnerTokenAccount",
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
      "docs": [
        "Freeze a specific token account (blocks all transfers from/to it).",
        "Caller must be master authority or hold the Pauser role."
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
          "name": "stablecoinConfig",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  116,
                  97,
                  98,
                  108,
                  101,
                  99,
                  111,
                  105,
                  110
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
          "name": "roleManager",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  111,
                  108,
                  101,
                  115
                ]
              },
              {
                "kind": "account",
                "path": "stablecoinConfig"
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
          "writable": true
        },
        {
          "name": "tokenProgram"
        }
      ],
      "args": []
    },
    {
      "name": "initialize",
      "docs": [
        "Create a new stablecoin (Token-2022 mint + config + role accounts).",
        "preset: \"sss-1\" (minimal) or \"sss-2\" (compliant with permanent delegate + transfer hook)"
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
          "writable": true,
          "signer": true
        },
        {
          "name": "mint",
          "writable": true,
          "signer": true
        },
        {
          "name": "stablecoinConfig",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  116,
                  97,
                  98,
                  108,
                  101,
                  99,
                  111,
                  105,
                  110
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
          "name": "roleManager",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  111,
                  108,
                  101,
                  115
                ]
              },
              {
                "kind": "account",
                "path": "stablecoinConfig"
              }
            ]
          }
        },
        {
          "name": "token2022Program",
          "address": "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "rent",
          "address": "SysvarRent111111111111111111111111111111111"
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
        "Mint tokens to a recipient. Caller must hold the Minter role.",
        "Enforces per-minter quota (0 = unlimited) and global pause."
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
          "writable": true,
          "signer": true
        },
        {
          "name": "stablecoinConfig",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  116,
                  97,
                  98,
                  108,
                  101,
                  99,
                  111,
                  105,
                  110
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
          "name": "roleManager",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  111,
                  108,
                  101,
                  115
                ]
              },
              {
                "kind": "account",
                "path": "stablecoinConfig"
              }
            ]
          }
        },
        {
          "name": "minterInfo",
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
                "path": "stablecoinConfig"
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
          "writable": true
        },
        {
          "name": "recipientTokenAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "recipient"
              },
              {
                "kind": "account",
                "path": "tokenProgram"
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "recipient"
        },
        {
          "name": "tokenProgram"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
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
        "Globally pause all mint, burn, and transfer operations.",
        "Caller must be master authority or hold the Pauser role."
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
          "name": "stablecoinConfig",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  116,
                  97,
                  98,
                  108,
                  101,
                  99,
                  111,
                  105,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "stablecoin_config.mint",
                "account": "stablecoinConfig"
              }
            ]
          }
        },
        {
          "name": "roleManager",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  111,
                  108,
                  101,
                  115
                ]
              },
              {
                "kind": "account",
                "path": "stablecoinConfig"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "removeFromBlacklist",
      "docs": [
        "Remove an address from the compliance blacklist (SSS-2 only).",
        "Closes the BlacklistEntry PDA — address can transact again."
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
          "writable": true,
          "signer": true
        },
        {
          "name": "stablecoinConfig",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  116,
                  97,
                  98,
                  108,
                  101,
                  99,
                  111,
                  105,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "stablecoin_config.mint",
                "account": "stablecoinConfig"
              }
            ]
          }
        },
        {
          "name": "roleManager",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  111,
                  108,
                  101,
                  115
                ]
              },
              {
                "kind": "account",
                "path": "stablecoinConfig"
              }
            ]
          }
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
                "path": "stablecoin_config.mint",
                "account": "stablecoinConfig"
              },
              {
                "kind": "arg",
                "path": "address"
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
          "name": "address",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "removeRole",
      "docs": [
        "Remove an address from a role."
      ],
      "discriminator": [
        74,
        69,
        168,
        163,
        248,
        3,
        130,
        0
      ],
      "accounts": [
        {
          "name": "authority",
          "signer": true,
          "relations": [
            "stablecoinConfig"
          ]
        },
        {
          "name": "stablecoinConfig",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  116,
                  97,
                  98,
                  108,
                  101,
                  99,
                  111,
                  105,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "stablecoin_config.mint",
                "account": "stablecoinConfig"
              }
            ]
          }
        },
        {
          "name": "roleManager",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  111,
                  108,
                  101,
                  115
                ]
              },
              {
                "kind": "account",
                "path": "stablecoinConfig"
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
          "name": "address",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "seize",
      "docs": [
        "Seize tokens from a frozen account to a treasury (SSS-2 only).",
        "Uses the PermanentDelegate extension — no token owner signature required.",
        "Pass hook program + ExtraAccountMetaList as remaining_accounts."
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
          "name": "seizer",
          "signer": true
        },
        {
          "name": "stablecoinConfig",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  116,
                  97,
                  98,
                  108,
                  101,
                  99,
                  111,
                  105,
                  110
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
          "name": "roleManager",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  111,
                  108,
                  101,
                  115
                ]
              },
              {
                "kind": "account",
                "path": "stablecoinConfig"
              }
            ]
          }
        },
        {
          "name": "mint",
          "writable": true
        },
        {
          "name": "sourceTokenAccount",
          "docs": [
            "The account to seize tokens FROM (must be frozen)"
          ],
          "writable": true
        },
        {
          "name": "destinationTokenAccount",
          "docs": [
            "The treasury/destination account to receive seized tokens"
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
      "name": "thawAccount",
      "docs": [
        "Unfreeze a previously frozen token account."
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
          "name": "stablecoinConfig",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  116,
                  97,
                  98,
                  108,
                  101,
                  99,
                  111,
                  105,
                  110
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
          "name": "roleManager",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  111,
                  108,
                  101,
                  115
                ]
              },
              {
                "kind": "account",
                "path": "stablecoinConfig"
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
      "docs": [
        "Transfer master authority to a new keypair.",
        "This is irreversible without the new authority's cooperation."
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
          "signer": true,
          "relations": [
            "stablecoinConfig"
          ]
        },
        {
          "name": "stablecoinConfig",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  116,
                  97,
                  98,
                  108,
                  101,
                  99,
                  111,
                  105,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "stablecoin_config.mint",
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
        "Resume normal operations after a global pause."
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
          "name": "stablecoinConfig",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  116,
                  97,
                  98,
                  108,
                  101,
                  99,
                  111,
                  105,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "stablecoin_config.mint",
                "account": "stablecoinConfig"
              }
            ]
          }
        },
        {
          "name": "roleManager",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  111,
                  108,
                  101,
                  115
                ]
              },
              {
                "kind": "account",
                "path": "stablecoinConfig"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "updateMinterQuota",
      "docs": [
        "Update the minting quota for an existing minter.",
        "Set quota to 0 for unlimited minting."
      ],
      "discriminator": [
        221,
        28,
        229,
        118,
        214,
        28,
        220,
        247
      ],
      "accounts": [
        {
          "name": "authority",
          "signer": true,
          "relations": [
            "stablecoinConfig"
          ]
        },
        {
          "name": "stablecoinConfig",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  116,
                  97,
                  98,
                  108,
                  101,
                  99,
                  111,
                  105,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "stablecoin_config.mint",
                "account": "stablecoinConfig"
              }
            ]
          }
        },
        {
          "name": "minterInfo",
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
                "path": "stablecoinConfig"
              },
              {
                "kind": "arg",
                "path": "minter"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "minter",
          "type": "pubkey"
        },
        {
          "name": "newQuota",
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
      "name": "minterInfo",
      "discriminator": [
        158,
        4,
        176,
        199,
        251,
        15,
        209,
        131
      ]
    },
    {
      "name": "roleManager",
      "discriminator": [
        149,
        48,
        206,
        85,
        167,
        34,
        114,
        212
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
      "name": "blacklistAdded",
      "discriminator": [
        214,
        13,
        214,
        145,
        233,
        250,
        4,
        236
      ]
    },
    {
      "name": "blacklistRemoved",
      "discriminator": [
        56,
        84,
        216,
        61,
        23,
        245,
        29,
        236
      ]
    },
    {
      "name": "minterQuotaUpdated",
      "discriminator": [
        43,
        253,
        204,
        147,
        16,
        231,
        219,
        151
      ]
    },
    {
      "name": "roleUpdated",
      "discriminator": [
        155,
        222,
        44,
        187,
        5,
        65,
        10,
        212
      ]
    },
    {
      "name": "tokenInitialized",
      "discriminator": [
        77,
        70,
        233,
        124,
        236,
        92,
        204,
        0
      ]
    },
    {
      "name": "tokenPaused",
      "discriminator": [
        126,
        54,
        76,
        161,
        125,
        151,
        148,
        59
      ]
    },
    {
      "name": "tokenUnpaused",
      "discriminator": [
        225,
        17,
        68,
        81,
        129,
        134,
        145,
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
      "msg": "Token operations are paused"
    },
    {
      "code": 6001,
      "name": "unauthorized",
      "msg": "Unauthorized: caller does not have the required role"
    },
    {
      "code": 6002,
      "name": "quotaExceeded",
      "msg": "Minter quota exceeded"
    },
    {
      "code": 6003,
      "name": "complianceNotEnabled",
      "msg": "Compliance module not enabled for this token"
    },
    {
      "code": 6004,
      "name": "alreadyBlacklisted",
      "msg": "Address is already blacklisted"
    },
    {
      "code": 6005,
      "name": "notBlacklisted",
      "msg": "Address is not blacklisted"
    },
    {
      "code": 6006,
      "name": "invalidPreset",
      "msg": "Invalid preset configuration"
    },
    {
      "code": 6007,
      "name": "roleCapacityReached",
      "msg": "Maximum role capacity reached"
    },
    {
      "code": 6008,
      "name": "accountNotFrozen",
      "msg": "Cannot seize from an account that is not frozen"
    },
    {
      "code": 6009,
      "name": "nameTooLong",
      "msg": "Token name too long (max 32 chars)"
    },
    {
      "code": 6010,
      "name": "symbolTooLong",
      "msg": "Token symbol too long (max 10 chars)"
    },
    {
      "code": 6011,
      "name": "uriTooLong",
      "msg": "Token URI too long (max 200 chars)"
    },
    {
      "code": 6012,
      "name": "reasonTooLong",
      "msg": "Blacklist reason too long (max 64 chars)"
    },
    {
      "code": 6013,
      "name": "zeroAmount",
      "msg": "Amount must be greater than zero"
    },
    {
      "code": 6014,
      "name": "mathOverflow",
      "msg": "Arithmetic overflow"
    },
    {
      "code": 6015,
      "name": "roleNotFound",
      "msg": "Role not found"
    },
    {
      "code": 6016,
      "name": "useDedicatedAddMinter",
      "msg": "Use add_minter instruction to add minters (requires MinterInfo PDA)"
    },
    {
      "code": 6017,
      "name": "alreadyHasRole",
      "msg": "Address already holds this role"
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
            "name": "by",
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
            "name": "by",
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
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "previousAuthority",
            "type": "pubkey"
          },
          {
            "name": "newAuthority",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "blacklistAdded",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "address",
            "type": "pubkey"
          },
          {
            "name": "reason",
            "type": "string"
          },
          {
            "name": "by",
            "type": "pubkey"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "blacklistEntry",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "address",
            "type": "pubkey"
          },
          {
            "name": "stablecoin",
            "type": "pubkey"
          },
          {
            "name": "reason",
            "type": "string"
          },
          {
            "name": "blacklistedAt",
            "type": "i64"
          },
          {
            "name": "blacklistedBy",
            "type": "pubkey"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "blacklistRemoved",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "address",
            "type": "pubkey"
          },
          {
            "name": "by",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "initializeParams",
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
            "name": "enablePermanentDelegate",
            "type": "bool"
          },
          {
            "name": "enableTransferHook",
            "type": "bool"
          },
          {
            "name": "enableDefaultFrozen",
            "type": "bool"
          },
          {
            "name": "transferHookProgramId",
            "type": {
              "option": "pubkey"
            }
          }
        ]
      }
    },
    {
      "name": "minterInfo",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "minter",
            "type": "pubkey"
          },
          {
            "name": "stablecoin",
            "type": "pubkey"
          },
          {
            "name": "quota",
            "type": "u64"
          },
          {
            "name": "minted",
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "minterQuotaUpdated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "minter",
            "type": "pubkey"
          },
          {
            "name": "newQuota",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "roleManager",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "stablecoin",
            "type": "pubkey"
          },
          {
            "name": "minters",
            "type": {
              "vec": "pubkey"
            }
          },
          {
            "name": "burners",
            "type": {
              "vec": "pubkey"
            }
          },
          {
            "name": "pausers",
            "type": {
              "vec": "pubkey"
            }
          },
          {
            "name": "blacklisters",
            "type": {
              "vec": "pubkey"
            }
          },
          {
            "name": "seizers",
            "type": {
              "vec": "pubkey"
            }
          },
          {
            "name": "bump",
            "type": "u8"
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
      "name": "roleType",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "minter"
          },
          {
            "name": "burner"
          },
          {
            "name": "pauser"
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
      "name": "roleUpdated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "role",
            "type": "string"
          },
          {
            "name": "address",
            "type": "pubkey"
          },
          {
            "name": "action",
            "type": "string"
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
            "name": "enablePermanentDelegate",
            "type": "bool"
          },
          {
            "name": "enableTransferHook",
            "type": "bool"
          },
          {
            "name": "enableDefaultFrozen",
            "type": "bool"
          },
          {
            "name": "paused",
            "type": "bool"
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
            "name": "reserved",
            "type": {
              "array": [
                "u8",
                64
              ]
            }
          }
        ]
      }
    },
    {
      "name": "tokenInitialized",
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
            "type": "string"
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
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "tokenPaused",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "by",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "tokenUnpaused",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "by",
            "type": "pubkey"
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
            "name": "recipient",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "minter",
            "type": "pubkey"
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
            "name": "by",
            "type": "pubkey"
          }
        ]
      }
    }
  ]
};
