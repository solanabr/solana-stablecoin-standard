import type { OpenApiSpec } from "@sss/shared";

export const complianceOpenApiSpec: OpenApiSpec = {
  openapi: "3.0.3",
  info: {
    title: "SSS Compliance API",
    version: "0.1.0",
    description: "SSS-2 compliance: on-chain blacklist, sanctions screening, transaction monitoring alerts, and audit export.",
  },
  paths: {
    "/blacklist/add": {
      post: {
        summary: "Add to blacklist",
        description: "Add a wallet to the on-chain blacklist (SSS-2). Requires blacklister role.",
        operationId: "blacklistAdd",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["wallet", "reason"],
                properties: {
                  wallet: { type: "string", description: "Wallet public key to blacklist" },
                  reason: { type: "string", maxLength: 100 },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Success",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { success: { type: "boolean" }, txSignature: { type: "string" } },
                },
              },
            },
          },
          "400": { description: "Validation failed" },
          "500": { description: "Blacklist add failed" },
        },
      },
    },
    "/blacklist/remove": {
      post: {
        summary: "Remove from blacklist",
        operationId: "blacklistRemove",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["wallet"],
                properties: { wallet: { type: "string" } },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Success",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { success: { type: "boolean" }, txSignature: { type: "string" } },
                },
              },
            },
          },
          "500": { description: "Blacklist remove failed" },
        },
      },
    },
    "/blacklist": {
      get: {
        summary: "List blacklist",
        description: "Return all on-chain blacklisted entries for the mint.",
        operationId: "getBlacklist",
        responses: {
          "200": {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    entries: {
                      type: "array",
                      items: { $ref: "#/components/schemas/BlacklistEntry" },
                    },
                    count: { type: "integer" },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/blacklist/check/{wallet}": {
      get: {
        summary: "Check if blacklisted",
        operationId: "blacklistCheck",
        parameters: [{ name: "wallet", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    wallet: { type: "string" },
                    isBlacklisted: { type: "boolean" },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/screen": {
      post: {
        summary: "Screen address",
        description: "Run sanctions screening on an address. Returns pass, flag, or block. Results are persisted.",
        operationId: "screen",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["address"],
                properties: { address: { type: "string" } },
              },
            },
          },
        },
        responses: {
          "200": {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    result: { type: "string", enum: ["pass", "flag", "block"] },
                    details: { type: "object" },
                  },
                },
              },
            },
          },
          "500": { description: "Screening failed" },
        },
      },
    },
    "/alerts": {
      get: {
        summary: "List compliance alerts",
        parameters: [
          { name: "mint", in: "query", schema: { type: "string" } },
          { name: "severity", in: "query", schema: { type: "string" } },
          { name: "resolved", in: "query", schema: { type: "boolean" } },
          { name: "limit", in: "query", schema: { type: "integer" } },
        ],
        responses: {
          "200": {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    alerts: {
                      type: "array",
                      items: { $ref: "#/components/schemas/Alert" },
                    },
                    count: { type: "integer" },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/alerts/{id}/resolve": {
      patch: {
        summary: "Mark alert resolved",
        operationId: "resolveAlert",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: {
          "200": {
            description: "Success",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { success: { type: "boolean" } },
                },
              },
            },
          },
        },
      },
    },
    "/audit": {
      get: {
        summary: "Export audit trail",
        description: "Events and alerts filtered by mint and time. Format json or csv.",
        parameters: [
          { name: "mint", in: "query", schema: { type: "string" } },
          { name: "from", in: "query", schema: { type: "string" } },
          { name: "to", in: "query", schema: { type: "string" } },
          { name: "limit", in: "query", schema: { type: "integer" } },
          { name: "format", in: "query", schema: { type: "string", enum: ["json", "csv"] } },
        ],
        responses: {
          "200": { description: "JSON array or CSV file" },
        },
      },
    },
  },
  components: {
    schemas: {
      BlacklistEntry: {
        type: "object",
        properties: {
          pubkey: { type: "string" },
          wallet: { type: "string" },
          reason: { type: "string" },
        },
      },
      Alert: {
        type: "object",
        properties: {
          id: { type: "integer" },
          event_id: { type: "integer", nullable: true },
          mint: { type: "string" },
          rule: { type: "string" },
          severity: { type: "string", enum: ["info", "warning", "critical"] },
          details: { type: "object" },
          resolved: { type: "boolean" },
          created_at: { type: "string" },
        },
      },
    },
  },
};
