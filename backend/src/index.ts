import { startComplianceService } from "./compliance-service/index.js";
import { startEventIndexer } from "./event-indexer/index.js";
import { startMintService } from "./mint-service/index.js";
import { startWebhookService } from "./webhook-service/index.js";

export async function startAll(): Promise<void> {
  await Promise.all([
    startMintService(3001),
    startEventIndexer(3002),
    startComplianceService(3003),
    startWebhookService(3004)
  ]);
}

if (process.argv[1]?.endsWith("index.js")) {
  void startAll();
}
