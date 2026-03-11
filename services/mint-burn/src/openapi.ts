import type { OpenApiSpec } from "@sss/shared";

export const mintBurnOpenApiSpec: OpenApiSpec = {
  openapi: "3.0.3",
  info: {
    title: "SSS Mint/Burn API",
    version: "0.1.0",
    description: "Fiat-to-stablecoin lifecycle: request mint or burn, optional idempotency and pre-mint screening.",
  },
  paths: {
    "/mint": {
      post: {
        summary: "Request mint",
        description: "Mint stablecoin to a recipient. Supports idempotency key. Optionally screens recipient via compliance service.",
        operationId: "mint",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["recipient", "amount"],
                properties: {
                  recipient: { type: "string", description: "Recipient wallet public key" },
                  amount: { type: "string", description: "Amount in base units" },
                  idempotencyKey: { type: "string", description: "Optional idempotency key" },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Mint request",
            content: { "application/json": { schema: { $ref: "#/components/schemas/MintRequest" } } },
          },
          "400": { description: "Validation failed" },
          "500": { description: "Mint failed or screening blocked" },
        },
      },
    },
    "/burn": {
      post: {
        summary: "Request burn",
        description: "Burn stablecoin from a token account.",
        operationId: "burn",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["from", "amount"],
                properties: {
                  from: { type: "string", description: "Source token account ATA public key" },
                  amount: { type: "string", description: "Amount in base units" },
                  idempotencyKey: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Burn request",
            content: { "application/json": { schema: { $ref: "#/components/schemas/BurnRequest" } } },
          },
          "400": { description: "Validation failed" },
          "500": { description: "Burn failed" },
        },
      },
    },
    "/mint/{id}": {
      get: {
        summary: "Get mint request",
        operationId: "getMintRequest",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": {
            description: "Mint request",
            content: { "application/json": { schema: { $ref: "#/components/schemas/MintRequest" } } },
          },
          "404": { description: "Not found" },
        },
      },
    },
    "/burn/{id}": {
      get: {
        summary: "Get burn request",
        operationId: "getBurnRequest",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": {
            description: "Burn request",
            content: { "application/json": { schema: { $ref: "#/components/schemas/BurnRequest" } } },
          },
          "404": { description: "Not found" },
        },
      },
    },
  },
  components: {
    schemas: {
      MintRequest: {
        type: "object",
        properties: {
          id: { type: "string" },
          idempotency_key: { type: "string", nullable: true },
          mint: { type: "string" },
          recipient: { type: "string" },
          amount: { type: "string" },
          status: { type: "string", enum: ["pending", "submitted", "confirmed", "failed"] },
          tx_signature: { type: "string", nullable: true },
          error: { type: "string", nullable: true },
          created_at: { type: "string" },
          updated_at: { type: "string" },
        },
      },
      BurnRequest: {
        type: "object",
        properties: {
          id: { type: "string" },
          idempotency_key: { type: "string", nullable: true },
          mint: { type: "string" },
          from_account: { type: "string" },
          amount: { type: "string" },
          status: { type: "string", enum: ["pending", "submitted", "confirmed", "failed"] },
          tx_signature: { type: "string", nullable: true },
          error: { type: "string", nullable: true },
          created_at: { type: "string" },
          updated_at: { type: "string" },
        },
      },
    },
  },
};
