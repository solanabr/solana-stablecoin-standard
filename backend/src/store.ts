import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

export interface MintRequestRecord {
  id: string;
  status: "pending" | "executing" | "completed" | "failed";
  body: Record<string, unknown>;
  txSignature?: string;
  error?: string;
  createdAt: string;
}

export interface AuditRecord {
  action: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface WebhookSubscription {
  id: string;
  url?: string;
  secret?: string;
  events?: string[];
  retryCount: number;
  nextAttemptAt: string | null;
}

export interface RegistryRecord {
  mint: string;
  config: string;
  authority: string;
  preset: string;
  standardVersion: string;
  configHash: string;
  name: string;
  symbol: string;
  uri: string;
  decimals: number;
  enablePermanentDelegate: boolean;
  enableTransferHook: boolean;
  defaultAccountFrozen: boolean;
  enableConfidentialTransfers: boolean;
  enableZkComplianceProofs: boolean;
  enableCompressedComplianceState: boolean;
  transferHookProgramId: string | null;
  proofVerifierProgramId: string | null;
  compressedComplianceRoot: string | null;
  complianceCircuit: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

interface SerializedStore {
  mintRequests: MintRequestRecord[];
  events: Array<Record<string, unknown>>;
  audit: AuditRecord[];
  blacklist: Array<[string, string]>;
  webhooks: WebhookSubscription[];
  registry: RegistryRecord[];
}

function createEmptyStore(): SerializedStore {
  return {
    mintRequests: [],
    events: [],
    audit: [],
    blacklist: [],
    webhooks: [],
    registry: []
  };
}

class PersistentStore {
  public readonly mintRequests = new Map<string, MintRequestRecord>();
  public readonly events: Array<Record<string, unknown>> = [];
  public readonly audit: AuditRecord[] = [];
  public readonly blacklist = new Map<string, string>();
  public readonly webhooks: WebhookSubscription[] = [];
  public readonly registry = new Map<string, RegistryRecord>();
  private loaded = false;

  public constructor(private readonly storePath = resolve(process.cwd(), process.env.STORE_PATH ?? "data/store.json")) {}

  public async ensureLoaded(): Promise<void> {
    if (!this.loaded) {
      await this.reload();
      this.loaded = true;
    }
  }

  public async read<T>(reader: (store: PersistentStore) => T | Promise<T>): Promise<T> {
    await this.ensureLoaded();
    await this.reload();
    return reader(this);
  }

  public async sync<T>(writer: (store: PersistentStore) => T | Promise<T>): Promise<T> {
    await this.ensureLoaded();
    await this.reload();
    const result = await writer(this);
    await this.persist();
    return result;
  }

  public async reload(): Promise<void> {
    try {
      const raw = await readFile(this.storePath, "utf8");
      this.hydrate(JSON.parse(raw) as SerializedStore);
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code !== "ENOENT") {
        throw error;
      }
      this.hydrate(createEmptyStore());
      await this.persist();
    }
  }

  public async persist(): Promise<void> {
    const directory = dirname(this.storePath);
    await mkdir(directory, { recursive: true });
    const nextPath = `${this.storePath}.tmp`;
    await writeFile(nextPath, JSON.stringify(this.snapshot(), null, 2), "utf8");
    await rename(nextPath, this.storePath);
  }

  public recordAudit(action: string, payload: Record<string, unknown>): AuditRecord {
    const row = {
      action,
      payload,
      createdAt: new Date().toISOString()
    };
    this.audit.push(row);
    return row;
  }

  private hydrate(state: SerializedStore): void {
    this.mintRequests.clear();
    for (const row of state.mintRequests) {
      this.mintRequests.set(row.id, row);
    }

    this.events.length = 0;
    this.events.push(...state.events);

    this.audit.length = 0;
    this.audit.push(...state.audit);

    this.blacklist.clear();
    for (const [address, reason] of state.blacklist) {
      this.blacklist.set(address, reason);
    }

    this.webhooks.length = 0;
    this.webhooks.push(...state.webhooks);

    this.registry.clear();
    for (const row of state.registry) {
      this.registry.set(row.mint, row);
    }
  }

  private snapshot(): SerializedStore {
    return {
      mintRequests: Array.from(this.mintRequests.values()),
      events: [...this.events],
      audit: [...this.audit],
      blacklist: Array.from(this.blacklist.entries()),
      webhooks: [...this.webhooks],
      registry: Array.from(this.registry.values())
    };
  }
}

export const store = new PersistentStore();

export function nextWebhookBackoffMs(retryCount: number): number {
  if (retryCount <= 0) {
    return 5_000;
  }
  if (retryCount === 1) {
    return 30_000;
  }
  return 300_000;
}
