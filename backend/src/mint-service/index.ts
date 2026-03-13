import { PublicKey } from "@solana/web3.js";

import { connectConfiguredStablecoin } from "../chain.js";
import { getServiceConfig } from "../config.js";
import { buildService } from "../shared.js";
import { store } from "../store.js";

function parseMintAmount(value: unknown): bigint {
  if (typeof value === "bigint") {
    return value;
  }
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return BigInt(value);
  }
  if (typeof value === "string" && /^[0-9]+$/u.test(value)) {
    return BigInt(value);
  }
  throw new Error("InvalidAmount");
}

export async function startMintService(port = 3001): Promise<void> {
  const config = getServiceConfig("mint-service", port);
  const app = buildService(config);
  await store.ensureLoaded();

  app.post("/mint/request", async (request) => {
    return store.sync((state) => {
      const id = `req-${Date.now()}`;
      state.mintRequests.set(id, {
        id,
        status: "pending",
        body: (request.body as Record<string, unknown>) ?? {},
        createdAt: new Date().toISOString()
      });
      state.recordAudit("mint_request_created", { requestId: id });
      return { requestId: id, status: "pending" };
    });
  });

  app.post<{ Params: { requestId: string } }>("/mint/execute/:requestId", async (request, reply) => {
    const requestRecord = await store.read((state) => state.mintRequests.get(request.params.requestId));
    if (!requestRecord) {
      reply.code(404);
      return { status: "missing" };
    }

    await store.sync((state) => {
      const row = state.mintRequests.get(request.params.requestId);
      if (row) {
        row.status = "executing";
        delete row.error;
      }
    });

    try {
      const body = requestRecord.body;
      const destination = new PublicKey(String(body.destination));
      const amount = parseMintAmount(body.amount);
      const { stablecoin, authority } = await connectConfiguredStablecoin(config);
      const txSignature = await stablecoin.mintOnChain({
        destination,
        amount,
        minter: authority
      });

      return store.sync((state) => {
        const row = state.mintRequests.get(request.params.requestId);
        if (!row) {
          throw new Error("MissingMintRequest");
        }
        row.status = "completed";
        row.txSignature = txSignature;
        state.recordAudit("mint_request_executed", {
          requestId: request.params.requestId,
          txSignature
        });
        return {
          requestId: row.id,
          status: row.status,
          txSignature: row.txSignature
        };
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await store.sync((state) => {
        const row = state.mintRequests.get(request.params.requestId);
        if (row) {
          row.status = "failed";
          row.error = message;
        }
        state.recordAudit("mint_request_failed", {
          requestId: request.params.requestId,
          error: message
        });
      });
      reply.code(500);
      return {
        requestId: request.params.requestId,
        status: "failed",
        error: message
      };
    }
  });

  app.get<{ Params: { requestId: string } }>("/mint/status/:requestId", async (request) => {
    return store.read(
      (state) => state.mintRequests.get(request.params.requestId) ?? { status: "missing" }
    );
  });

  app.get("/mint/history", async () => store.read((state) => Array.from(state.mintRequests.values())));

  await app.listen({ port: config.port, host: config.host });
}
