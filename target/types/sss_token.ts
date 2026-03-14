/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/sss_token.json`.
 */
export type SssToken = {
  "address": "6NMdvUa2n4WSLPx9yz7V9edFx9VQqWr5KUDZQGPK3GDL",
  "metadata": {
    "name": "sssToken",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Solana Stablecoin Standard — core program (SSS-1 & SSS-2)"
  },
  "instructions": [
    {
      "name": "acceptAuthority",
      "docs": [
        "Accept a pending authority transfer."
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
          "signer": true
        },
        {
          "name": "state",
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
                "path": "state.mint",
                "account": "stablecoinState"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "addMinter",
      "docs": [
        "Add or update a minter with a lifetime quota (0 = unlimited)."
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
          "signer": true
        },
        {
          "name": "state",
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
                "path": "state.mint",
                "account": "stablecoinState"
              }
            ]
          }
        },
        {
          "name": "minter"
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
                "path": "state"
              },
              {
                "kind": "account",
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
          "name": "quota",
          "type": "u64"
        }
      ]
    },
    {
      "name": "addToBlacklist",
      "docs": [
        "Add an address to the blacklist. Fails if compliance was not enabled."
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
          "name": "state",
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
                "path": "state.mint",
                "account": "stablecoinState"
              }
            ]
          }
        },
        {
          "name": "target"
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
                "path": "state"
              },
              {
                "kind": "account",
                "path": "target"
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
          "name": "reason",
          "type": "string"
        }
      ]
    },
    {
      "name": "burn",
      "docs": [
        "Burn tokens.",
        "- Token-account owners can always burn from their own account.",
        "- Burner role can burn from any account when permanent delegate is enabled."
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
          "docs": [
            "Must be burner, or token account owner burning their own tokens"
          ],
          "signer": true
        },
        {
          "name": "state",
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
          "name": "mint",
          "writable": true
        },
        {
          "name": "fromTokenAccount",
          "writable": true
        },
        {
          "name": "permanentDelegate",
          "docs": [
            "not the token-account owner."
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  101,
                  114,
                  109,
                  97,
                  110,
                  101,
                  110,
                  116,
                  95,
                  100,
                  101,
                  108,
                  101,
                  103,
                  97,
                  116,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "state"
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
      "name": "freezeAccount",
      "docs": [
        "Freeze a token account (prevents transfers). Caller must hold Freezer role."
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
          "name": "state",
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
          "name": "mint",
          "writable": true
        },
        {
          "name": "tokenAccount",
          "writable": true
        },
        {
          "name": "freezeAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  102,
                  114,
                  101,
                  101,
                  122,
                  101,
                  95,
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
                "path": "state"
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
      "name": "increaseMinterQuota",
      "docs": [
        "Increase an active minter's lifetime quota by `additional_quota`."
      ],
      "discriminator": [
        102,
        87,
        42,
        217,
        237,
        250,
        91,
        70
      ],
      "accounts": [
        {
          "name": "authority",
          "writable": true,
          "signer": true
        },
        {
          "name": "state",
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
                "path": "state.mint",
                "account": "stablecoinState"
              }
            ]
          }
        },
        {
          "name": "minter"
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
                "path": "state"
              },
              {
                "kind": "account",
                "path": "minter"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "additionalQuota",
          "type": "u64"
        }
      ]
    },
    {
      "name": "initialize",
      "docs": [
        "Initialize a new stablecoin mint with chosen extensions.",
        "Pass `enable_permanent_delegate = true` and `enable_transfer_hook = true`",
        "to activate SSS-2 compliance features."
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
          "name": "masterAuthority",
          "writable": true,
          "signer": true
        },
        {
          "name": "state",
          "docs": [
            "The stablecoin's global state PDA"
          ],
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
          "name": "mint",
          "docs": [
            "Token-2022 mint — created externally with correct extensions pre-allocated,",
            "then passed here for authority assignment."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "tokenProgram",
          "address": "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
        },
        {
          "name": "rent",
          "address": "SysvarRent111111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "config",
          "type": {
            "defined": {
              "name": "stablecoinConfig"
            }
          }
        }
      ]
    },
    {
      "name": "mint",
      "docs": [
        "Mint tokens to a recipient. Caller must hold the Minter role and",
        "respect their lifetime minter quota (0 = unlimited)."
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
          "name": "minter",
          "signer": true
        },
        {
          "name": "state",
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
          "name": "mint",
          "writable": true
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
                "path": "state"
              },
              {
                "kind": "account",
                "path": "minter"
              }
            ]
          }
        },
        {
          "name": "recipientTokenAccount",
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
                  95,
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
                "path": "state"
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
      "name": "pause",
      "docs": [
        "Pause all minting and burning globally. Only Pauser."
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
          "name": "state",
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
                "path": "state.mint",
                "account": "stablecoinState"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "proposeAuthority",
      "docs": [
        "Transfer master authority to a new key (two-step: propose then accept)."
      ],
      "discriminator": [
        20,
        148,
        236,
        198,
        76,
        119,
        99,
        142
      ],
      "accounts": [
        {
          "name": "currentAuthority",
          "signer": true
        },
        {
          "name": "proposedAuthority"
        },
        {
          "name": "state",
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
                "path": "state.mint",
                "account": "stablecoinState"
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
        "Remove an address from the blacklist."
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
          "signer": true
        },
        {
          "name": "state",
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
                "path": "state.mint",
                "account": "stablecoinState"
              }
            ]
          }
        },
        {
          "name": "target"
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
                "path": "state"
              },
              {
                "kind": "account",
                "path": "target"
              }
            ]
          }
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
      "name": "removeMinter",
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
          "name": "authority",
          "writable": true,
          "signer": true
        },
        {
          "name": "state",
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
                "path": "state.mint",
                "account": "stablecoinState"
              }
            ]
          }
        },
        {
          "name": "minter"
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
                "path": "state"
              },
              {
                "kind": "account",
                "path": "minter"
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
        "Seize tokens from a blacklisted account to treasury via permanent delegate."
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
          "name": "state",
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
                "path": "state.mint",
                "account": "stablecoinState"
              }
            ]
          }
        },
        {
          "name": "mint"
        },
        {
          "name": "targetWallet",
          "docs": [
            "Must be blacklisted"
          ]
        },
        {
          "name": "blacklistEntry",
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
                "path": "state"
              },
              {
                "kind": "account",
                "path": "targetWallet"
              }
            ]
          }
        },
        {
          "name": "fromTokenAccount",
          "writable": true
        },
        {
          "name": "treasuryTokenAccount",
          "writable": true
        },
        {
          "name": "permanentDelegate",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  101,
                  114,
                  109,
                  97,
                  110,
                  101,
                  110,
                  116,
                  95,
                  100,
                  101,
                  108,
                  101,
                  103,
                  97,
                  116,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "state"
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
          "name": "state",
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
          "name": "mint",
          "writable": true
        },
        {
          "name": "tokenAccount",
          "writable": true
        },
        {
          "name": "freezeAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  102,
                  114,
                  101,
                  101,
                  122,
                  101,
                  95,
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
                "path": "state"
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
      "name": "unpause",
      "docs": [
        "Unpause the protocol."
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
          "name": "state",
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
                "path": "state.mint",
                "account": "stablecoinState"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "updateRoles",
      "docs": [
        "Update role assignments (pauser, freezer, burner, blacklister, seizer)."
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
          "name": "state",
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
                "path": "state.mint",
                "account": "stablecoinState"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "roleUpdate",
          "type": {
            "defined": {
              "name": "roleUpdate"
            }
          }
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
      "name": "stablecoinState",
      "discriminator": [
        107,
        33,
        134,
        54,
        129,
        13,
        187,
        151
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
      "name": "addressBlacklisted",
      "discriminator": [
        170,
        43,
        25,
        117,
        253,
        193,
        194,
        231
      ]
    },
    {
      "name": "addressUnblacklisted",
      "discriminator": [
        134,
        21,
        136,
        106,
        41,
        41,
        247,
        233
      ]
    },
    {
      "name": "authorityProposed",
      "discriminator": [
        244,
        117,
        94,
        112,
        53,
        151,
        35,
        89
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
      "name": "minterUpdated",
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
      "name": "protocolPaused",
      "discriminator": [
        35,
        111,
        245,
        138,
        237,
        199,
        79,
        223
      ]
    },
    {
      "name": "protocolUnpaused",
      "discriminator": [
        248,
        204,
        112,
        239,
        72,
        67,
        127,
        216
      ]
    },
    {
      "name": "rolesUpdated",
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
      "name": "unauthorized",
      "msg": "Unauthorized: caller does not hold required role"
    },
    {
      "code": 6001,
      "name": "noPendingAuthority",
      "msg": "No pending authority transfer"
    },
    {
      "code": 6002,
      "name": "wrongPendingAuthority",
      "msg": "Only the pending authority can accept this transfer"
    },
    {
      "code": 6003,
      "name": "protocolPaused",
      "msg": "Protocol is paused — all minting and burning is suspended"
    },
    {
      "code": 6004,
      "name": "minterInactive",
      "msg": "Minter is inactive or has been removed"
    },
    {
      "code": 6005,
      "name": "quotaExceeded",
      "msg": "Minter quota exceeded — request amount is above remaining lifetime quota"
    },
    {
      "code": 6006,
      "name": "cannotIncreaseUnlimitedQuota",
      "msg": "Cannot increase quota for an unlimited minter"
    },
    {
      "code": 6007,
      "name": "complianceNotEnabled",
      "msg": "Compliance module is not enabled on this stablecoin"
    },
    {
      "code": 6008,
      "name": "alreadyBlacklisted",
      "msg": "Address is already on the blacklist"
    },
    {
      "code": 6009,
      "name": "notBlacklisted",
      "msg": "Address is not on the blacklist"
    },
    {
      "code": 6010,
      "name": "seizeRequiresBlacklist",
      "msg": "Cannot seize tokens — account is not blacklisted"
    },
    {
      "code": 6011,
      "name": "permanentDelegateNotEnabled",
      "msg": "Permanent delegate not enabled — seize is unavailable"
    },
    {
      "code": 6012,
      "name": "senderBlacklisted",
      "msg": "Transfer blocked — sender is blacklisted"
    },
    {
      "code": 6013,
      "name": "recipientBlacklisted",
      "msg": "Transfer blocked — recipient is blacklisted"
    },
    {
      "code": 6014,
      "name": "zeroAmount",
      "msg": "Amount must be greater than zero"
    },
    {
      "code": 6015,
      "name": "stringTooLong",
      "msg": "String field exceeds maximum length"
    },
    {
      "code": 6016,
      "name": "overflow",
      "msg": "Arithmetic overflow"
    },
    {
      "code": 6017,
      "name": "minterNotFound",
      "msg": "Minter not found"
    },
    {
      "code": 6018,
      "name": "minterAlreadyInactive",
      "msg": "Minter is already inactive"
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
            "name": "authority",
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
            "name": "authority",
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
      "name": "addressBlacklisted",
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
            "name": "blacklister",
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
      "name": "addressUnblacklisted",
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
            "name": "blacklister",
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
      "name": "authorityProposed",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "current",
            "type": "pubkey"
          },
          {
            "name": "proposed",
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
      "name": "authorityTransferred",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "oldAuthority",
            "type": "pubkey"
          },
          {
            "name": "newAuthority",
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
            "name": "stablecoin",
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
            "name": "addedAt",
            "type": "i64"
          },
          {
            "name": "addedBy",
            "type": "pubkey"
          },
          {
            "name": "active",
            "type": "bool"
          },
          {
            "name": "bump",
            "type": "u8"
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
            "name": "stablecoin",
            "type": "pubkey"
          },
          {
            "name": "minter",
            "type": "pubkey"
          },
          {
            "name": "quota",
            "docs": [
              "0 = unlimited"
            ],
            "type": "u64"
          },
          {
            "name": "mintedTotal",
            "type": "u64"
          },
          {
            "name": "active",
            "type": "bool"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "minterUpdated",
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
            "name": "quota",
            "type": "u64"
          },
          {
            "name": "active",
            "type": "bool"
          },
          {
            "name": "authority",
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
      "name": "protocolPaused",
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
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "protocolUnpaused",
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
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "roleUpdate",
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
            "name": "freezer",
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
          }
        ]
      }
    },
    {
      "name": "rolesUpdated",
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
            "name": "timestamp",
            "type": "i64"
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
            "name": "defaultAccountFrozen",
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
      "name": "stablecoinInitialized",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "masterAuthority",
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
            "name": "decimals",
            "type": "u8"
          },
          {
            "name": "complianceEnabled",
            "type": "bool"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "stablecoinState",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "masterAuthority",
            "docs": [
              "Master authority — governance/admin authority (role updates, minter updates, authority transfer)"
            ],
            "type": "pubkey"
          },
          {
            "name": "pendingAuthority",
            "docs": [
              "Pending authority for two-step transfer"
            ],
            "type": {
              "option": "pubkey"
            }
          },
          {
            "name": "mint",
            "docs": [
              "Token-2022 mint address"
            ],
            "type": "pubkey"
          },
          {
            "name": "name",
            "docs": [
              "Human-readable name"
            ],
            "type": "string"
          },
          {
            "name": "symbol",
            "docs": [
              "Ticker symbol"
            ],
            "type": "string"
          },
          {
            "name": "uri",
            "docs": [
              "Metadata URI"
            ],
            "type": "string"
          },
          {
            "name": "decimals",
            "docs": [
              "Decimal places"
            ],
            "type": "u8"
          },
          {
            "name": "complianceEnabled",
            "type": "bool"
          },
          {
            "name": "permanentDelegateEnabled",
            "type": "bool"
          },
          {
            "name": "transferHookEnabled",
            "type": "bool"
          },
          {
            "name": "defaultAccountFrozen",
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
            "name": "pauser",
            "type": {
              "option": "pubkey"
            }
          },
          {
            "name": "freezer",
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
            "docs": [
              "SSS-2 only"
            ],
            "type": {
              "option": "pubkey"
            }
          },
          {
            "name": "seizer",
            "docs": [
              "SSS-2 only"
            ],
            "type": {
              "option": "pubkey"
            }
          },
          {
            "name": "transferHookProgramId",
            "docs": [
              "Transfer hook program ID (SSS-2)"
            ],
            "type": {
              "option": "pubkey"
            }
          },
          {
            "name": "bump",
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
            "name": "totalSupply",
            "type": "u64"
          },
          {
            "name": "timestamp",
            "type": "i64"
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
          },
          {
            "name": "totalSupply",
            "type": "u64"
          },
          {
            "name": "timestamp",
            "type": "i64"
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
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    }
  ]
};
