/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/sss_transfer_hook.json`.
 */
export type SssTransferHook = {
  "address": "hookXMsC9txN6T8hyS9GCyubBL4nvp9XPWg5wW3z3pH",
  "metadata": {
    "name": "sssTransferHook",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Solana Stablecoin Standard - Transfer Hook Program"
  },
  "instructions": [
    {
      "name": "addToBlacklist",
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
          "name": "adminRole",
          "docs": [
            "Verified by checking owner == sss-core program ID and re-deriving the",
            "expected PDA address from known seeds using the mint key."
          ]
        },
        {
          "name": "mint"
        },
        {
          "name": "address"
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
          "name": "reason",
          "type": "string"
        }
      ]
    },
    {
      "name": "initializeExtraAccountMetas",
      "discriminator": [
        22,
        213,
        130,
        114,
        1,
        174,
        121,
        36
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "extraAccountMetas",
          "docs": [
            "for this mint. Created and initialized in this instruction."
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
          "name": "mint"
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
          "name": "adminRole",
          "docs": [
            "Verified by checking owner == sss-core program ID and re-deriving the",
            "expected PDA address from known seeds using the mint key."
          ]
        },
        {
          "name": "mint"
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
                "path": "blacklist_entry.address",
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
      "discriminator": [
        220,
        57,
        220,
        152,
        126,
        125,
        97,
        168
      ],
      "accounts": [
        {
          "name": "source"
        },
        {
          "name": "mint"
        },
        {
          "name": "destination"
        },
        {
          "name": "authority"
        },
        {
          "name": "extraAccountMetas",
          "docs": [
            "[b\"extra-account-metas\", mint]. Not validated here since Token-2022",
            "handles resolution."
          ]
        },
        {
          "name": "senderBlacklist",
          "docs": [
            "ExtraAccountMetaList. If this account exists (has data, owned by this",
            "program), the sender is blacklisted and the transfer is rejected."
          ]
        },
        {
          "name": "receiverBlacklist",
          "docs": [
            "ExtraAccountMetaList. If this account exists (has data, owned by this",
            "program), the receiver is blacklisted and the transfer is rejected."
          ]
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
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "senderBlacklisted",
      "msg": "Sender is blacklisted"
    },
    {
      "code": 6001,
      "name": "receiverBlacklisted",
      "msg": "Receiver is blacklisted"
    },
    {
      "code": 6002,
      "name": "reasonTooLong",
      "msg": "Reason exceeds maximum length"
    },
    {
      "code": 6003,
      "name": "unauthorized",
      "msg": "Unauthorized: not an admin"
    }
  ],
  "types": [
    {
      "name": "blacklistEntry",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "docs": [
              "The stablecoin mint this entry applies to."
            ],
            "type": "pubkey"
          },
          {
            "name": "address",
            "docs": [
              "The wallet address that is blacklisted."
            ],
            "type": "pubkey"
          },
          {
            "name": "addedBy",
            "docs": [
              "The admin who added this entry."
            ],
            "type": "pubkey"
          },
          {
            "name": "addedAt",
            "docs": [
              "Unix timestamp when the entry was created."
            ],
            "type": "i64"
          },
          {
            "name": "reason",
            "docs": [
              "Compliance reason for blacklisting (max 128 chars)."
            ],
            "type": "string"
          },
          {
            "name": "bump",
            "docs": [
              "PDA bump seed."
            ],
            "type": "u8"
          }
        ]
      }
    }
  ]
};
