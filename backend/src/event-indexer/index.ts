import { getServiceConfig } from "../config.js";
import { buildService } from "../shared.js";
import { store, type RegistryRecord } from "../store.js";

function isRegistryPreset(value: unknown): value is "sss-1" | "sss-2" | "sss-3" {
  return value === "sss-1" || value === "sss-2" || value === "sss-3";
}

function isValidConfigHash(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
}

export async function startEventIndexer(port = 3002): Promise<void> {
  const config = getServiceConfig("event-indexer", port);
  const app = buildService(config);
  await store.ensureLoaded();

  app.get("/events", async () => store.read((state) => state.events));
  app.post("/events", async (request) => {
    return store.sync((state) => {
      const event = {
        id: `evt-${Date.now()}`,
        createdAt: new Date().toISOString(),
        ...(request.body as Record<string, unknown>)
      };
      state.events.push(event);
      state.recordAudit("event_recorded", event);
      return event;
    });
  });

  app.post("/webhooks/subscribe", async (request) => {
    return store.sync((state) => {
      const body = (request.body as Record<string, unknown>) ?? {};
      const subscription = {
        id: `sub-${Date.now()}`,
        url: typeof body.url === "string" ? body.url : undefined,
        secret: typeof body.secret === "string" ? body.secret : undefined,
        events: Array.isArray(body.events) ? (body.events as string[]) : [],
        retryCount: 0,
        nextAttemptAt: null
      };
      state.webhooks.push(subscription);
      state.recordAudit("webhook_subscribed", { id: subscription.id, url: subscription.url });
      return subscription;
    });
  });

  app.get("/registry", async () => store.read((state) => Array.from(state.registry.values())));
  app.post("/registry", async (request, reply) => {
    const body = (request.body as Record<string, unknown>) ?? {};
    const decimals = typeof body.decimals === "number" ? body.decimals : Number.NaN;
    if (
      typeof body.mint !== "string" ||
      typeof body.config !== "string" ||
      typeof body.authority !== "string" ||
      !isRegistryPreset(body.preset) ||
      typeof body.standardVersion !== "string" ||
      !isValidConfigHash(body.configHash) ||
      typeof body.name !== "string" ||
      typeof body.symbol !== "string" ||
      typeof body.uri !== "string" ||
      !Number.isInteger(decimals) ||
      decimals < 0
    ) {
      reply.code(400);
      return {
        error: "InvalidRegistryEntry"
      };
    }

    return store.sync((state) => {
      const entry: RegistryRecord = {
        mint: String(body.mint),
        config: String(body.config),
        authority: String(body.authority),
        preset: body.preset as "sss-1" | "sss-2" | "sss-3",
        standardVersion: String(body.standardVersion),
        configHash: String(body.configHash),
        name: String(body.name),
        symbol: String(body.symbol),
        uri: String(body.uri),
        decimals,
        enablePermanentDelegate: Boolean(body.enablePermanentDelegate),
        enableTransferHook: Boolean(body.enableTransferHook),
        defaultAccountFrozen: Boolean(body.defaultAccountFrozen),
        enableConfidentialTransfers: Boolean(body.enableConfidentialTransfers),
        enableZkComplianceProofs: Boolean(body.enableZkComplianceProofs),
        enableCompressedComplianceState: Boolean(body.enableCompressedComplianceState),
        transferHookProgramId:
          typeof body.transferHookProgramId === "string" ? body.transferHookProgramId : null,
        proofVerifierProgramId:
          typeof body.proofVerifierProgramId === "string" ? body.proofVerifierProgramId : null,
        compressedComplianceRoot:
          typeof body.compressedComplianceRoot === "string" ? body.compressedComplianceRoot : null,
        complianceCircuit:
          typeof body.complianceCircuit === "string" ? body.complianceCircuit : null,
        metadata:
          body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)
            ? (body.metadata as Record<string, unknown>)
            : {},
        createdAt: new Date().toISOString()
      };
      state.registry.set(entry.mint, entry);
      state.recordAudit("registry_registered", {
        mint: entry.mint,
        preset: String(entry.preset),
        configHash: entry.configHash
      });
      return entry;
    });
  });

  await app.listen({ port: config.port, host: config.host });
}
