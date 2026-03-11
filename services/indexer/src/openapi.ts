import type { OpenApiSpec } from "@sss/shared";

export const indexerOpenApiSpec: OpenApiSpec = {
  openapi: "3.0.3",
  info: {
    title: "SSS Indexer API",
    version: "0.1.0",
    description: "Event indexer for the Solana Stablecoin Standard program. Exposes indexed events and per-mint off-chain state.",
  },
  paths: {
    "/events": {
      get: {
        summary: "List events",
        description: "Query indexed SSS program events with optional filters.",
        operationId: "getEvents",
        parameters: [
          { name: "mint", in: "query", schema: { type: "string" }, description: "Filter by mint public key" },
          { name: "type", in: "query", schema: { type: "string" }, description: "Filter by event type (e.g. MintTokensEvent)" },
          { name: "after", in: "query", schema: { type: "integer" }, description: "Return events with id greater than this" },
          { name: "limit", in: "query", schema: { type: "integer", default: 50 }, description: "Max results (default 50, max 500)" },
        ],
        responses: {
          "200": {
            description: "List of events",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    events: { type: "array", items: { $ref: "#/components/schemas/SssEvent" } },
                    count: { type: "integer" },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/state/{mint}": {
      get: {
        summary: "Get mint state",
        description: "Return off-chain state for a mint (total supply, pause status, last slot).",
        operationId: "getState",
        parameters: [
          { name: "mint", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: {
          "200": {
            description: "Mint state",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/MintState" },
              },
            },
          },
          "404": { description: "Mint state not found" },
        },
      },
    },
  },
  components: {
    schemas: {
      SssEvent: {
        type: "object",
        properties: {
          id: { type: "string" },
          signature: { type: "string" },
          slot: { type: "integer" },
          block_time: { type: "string", format: "date-time", nullable: true },
          event_type: { type: "string" },
          mint: { type: "string" },
          payload: { type: "object" },
          created_at: { type: "string", format: "date-time" },
        },
      },
      MintState: {
        type: "object",
        properties: {
          mint: { type: "string" },
          total_supply: { type: "string" },
          is_paused: { type: "boolean" },
          last_slot: { type: "string" },
          updated_at: { type: "string", format: "date-time" },
        },
      },
    },
  },
};
