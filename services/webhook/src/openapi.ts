import type { OpenApiSpec } from "@sss/shared";

export const webhookOpenApiSpec: OpenApiSpec = {
  openapi: "3.0.3",
  info: {
    title: "SSS Webhook API",
    version: "0.1.0",
    description: "Configurable event notifications. Subscribe to SSS events and receive HTTP callbacks with retry.",
  },
  paths: {
    "/subscriptions": {
      get: {
        summary: "List subscriptions",
        operationId: "listSubscriptions",
        responses: {
          "200": {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    subscriptions: {
                      type: "array",
                      items: { $ref: "#/components/schemas/Subscription" },
                    },
                    count: { type: "integer" },
                  },
                },
              },
            },
          },
        },
      },
      post: {
        summary: "Create subscription",
        operationId: "createSubscription",
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["url"],
                properties: {
                  url: { type: "string", format: "uri" },
                  secret: { type: "string", minLength: 16, description: "HMAC secret (optional, generated if omitted)" },
                  eventTypes: { type: "array", items: { type: "string" }, default: ["*"] },
                  mintFilter: { type: "string", description: "Only events for this mint" },
                },
              },
            },
          },
        },
        responses: {
          "201": {
            description: "Created",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Subscription" } } },
          },
          "400": { description: "Validation failed" },
        },
      },
    },
    "/subscriptions/{id}": {
      get: {
        summary: "Get subscription",
        operationId: "getSubscription",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        responses: {
          "200": {
            description: "Subscription",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Subscription" } } },
          },
          "404": { description: "Not found" },
        },
      },
      patch: {
        summary: "Update subscription",
        operationId: "updateSubscription",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  url: { type: "string", format: "uri" },
                  secret: { type: "string" },
                  eventTypes: { type: "array", items: { type: "string" } },
                  mintFilter: { type: "string", nullable: true },
                  active: { type: "boolean" },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Updated subscription",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Subscription" } } },
          },
          "404": { description: "Not found" },
        },
      },
      delete: {
        summary: "Deactivate subscription",
        operationId: "deleteSubscription",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        responses: {
          "200": { description: "Deactivated" },
          "404": { description: "Not found" },
        },
      },
    },
    "/deliveries": {
      get: {
        summary: "List deliveries",
        operationId: "listDeliveries",
        parameters: [
          { name: "subscription_id", in: "query", schema: { type: "string", format: "uuid" } },
          { name: "status", in: "query", schema: { type: "string" } },
          { name: "limit", in: "query", schema: { type: "integer" } },
        ],
        responses: {
          "200": {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    deliveries: {
                      type: "array",
                      items: { $ref: "#/components/schemas/Delivery" },
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
  },
  components: {
    schemas: {
      Subscription: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          url: { type: "string" },
          secret: { type: "string" },
          event_types: { type: "array", items: { type: "string" } },
          mint_filter: { type: "string", nullable: true },
          active: { type: "boolean" },
          created_at: { type: "string" },
        },
      },
      Delivery: {
        type: "object",
        properties: {
          id: { type: "integer" },
          subscription_id: { type: "string" },
          event_id: { type: "string" },
          status: { type: "string", enum: ["pending", "success", "failed", "exhausted"] },
          attempts: { type: "integer" },
          last_status_code: { type: "integer", nullable: true },
          next_retry_at: { type: "string", nullable: true },
          created_at: { type: "string" },
          updated_at: { type: "string" },
        },
      },
    },
  },
};
