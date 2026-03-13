import { getServiceConfig } from "../config.js";
import { buildService } from "../shared.js";
import { store } from "../store.js";

export async function startComplianceService(port = 3003): Promise<void> {
  const config = getServiceConfig("compliance-service", port);
  const app = buildService(config);
  await store.ensureLoaded();

  app.get(
    "/blacklist",
    async () => store.read((state) => Array.from(state.blacklist.entries()).map(([address, reason]) => ({
      address,
      reason
    })))
  );

  app.post("/blacklist", async (request) => {
    const body = request.body as { address: string; reason: string };
    return store.sync((state) => {
      state.blacklist.set(body.address, body.reason);
      state.recordAudit("blacklist_add", body);
      return { status: "recorded" };
    });
  });

  app.delete<{ Params: { address: string } }>("/blacklist/:address", async (request) => {
    return store.sync((state) => {
      state.blacklist.delete(request.params.address);
      state.recordAudit("blacklist_remove", { address: request.params.address });
      return { status: "removed" };
    });
  });

  app.get("/audit-log", async () => store.read((state) => state.audit));
  app.post("/sanctions-screen", async (request) => {
    const body = (request.body as Record<string, unknown>) ?? {};
    const addresses = Array.isArray(body.addresses)
      ? body.addresses.filter((value): value is string => typeof value === "string")
      : typeof body.address === "string"
        ? [body.address]
        : [];

    const localMatches = await store.read((state) => addresses.filter((address) => state.blacklist.has(address)));
    if (config.sanctionsScreeningUrl) {
      const response = await fetch(config.sanctionsScreeningUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(config.sanctionsScreeningApiKey
            ? { authorization: `Bearer ${config.sanctionsScreeningApiKey}` }
            : {})
        },
        body: JSON.stringify(body)
      });
      const providerPayload = (await response.json()) as Record<string, unknown>;
      return {
        isMatch: localMatches.length > 0 || Boolean(providerPayload.isMatch),
        source: "provider",
        localMatches,
        provider: providerPayload
      };
    }

    return {
      isMatch: localMatches.length > 0,
      source: "local-blacklist",
      matches: localMatches
    };
  });

  await app.listen({ port: config.port, host: config.host });
}
