import { env } from "@/lib/env";
import type {
  ApproveOperationInput,
  CreateLifecycleRequestInput,
  EventRecord,
  EventsQuery,
  EventsResponse,
  OperationDetailsResponse,
  OperationRequest,
  OperationsQuery,
  OperationsResponse,
} from "@/lib/types";

export class ApiError extends Error {
  status: number;
  details: unknown;

  constructor(message: string, status: number, details: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }
}

function toSearchParams(values: Record<string, string | undefined>) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(values)) {
    if (value) {
      params.set(key, value);
    }
  }

  return params;
}

export function serializeEventsQuery(query: EventsQuery) {
  const rest = {
    event_type: query.event_type,
    program_id: query.program_id,
    tx_signature: query.tx_signature,
    slot_min: query.slot_min,
    slot_max: query.slot_max,
    from: query.from,
    to: query.to,
    sort: query.sort,
    order: query.order,
    limit: query.limit,
    offset: query.offset,
  };

  return toSearchParams(rest).toString();
}

export function serializeOperationsQuery(query: OperationsQuery) {
  return toSearchParams({
    mint: query.mint,
    status: query.status || undefined,
    type: query.type || undefined,
    limit: query.limit,
    offset: query.offset,
  }).toString();
}

async function readJson<T>(response: Response): Promise<T> {
  if (response.ok) {
    return response.json() as Promise<T>;
  }

  let payload: unknown = null;

  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  const message =
    typeof payload === "object" && payload !== null && "message" in payload
      ? String(payload.message)
      : `Request failed with status ${response.status}`;

  throw new ApiError(message, response.status, payload);
}

function normalizeEvent(event: EventRecord): EventRecord {
  return {
    ...event,
    data: event.data ?? {},
  };
}

function normalizeOperation(operation: OperationRequest): OperationRequest {
  return {
    ...operation,
    amount: String(operation.amount),
  };
}

export async function getMintEvents(query: EventsQuery) {
  const search = serializeEventsQuery(query);
  const response = await fetch(
    `${env.apiBasePath}/v1/mints/${query.mint}/events${search ? `?${search}` : ""}`,
    {
      cache: "no-store",
    },
  );
  const payload = await readJson<EventsResponse>(response);

  return {
    total: payload.total,
    events: payload.events.map(normalizeEvent),
  };
}

export async function getOperations(query: OperationsQuery = {}) {
  const search = serializeOperationsQuery(query);
  const response = await fetch(`${env.apiBasePath}/v1/operations${search ? `?${search}` : ""}`, {
    cache: "no-store",
  });
  const payload = await readJson<OperationsResponse>(response);

  return {
    total: payload.total,
    requests: payload.requests.map(normalizeOperation),
  };
}

export async function getOperation(id: string) {
  const response = await fetch(`${env.apiBasePath}/v1/operations/${id}`, {
    cache: "no-store",
  });
  const payload = await readJson<OperationDetailsResponse>(response);

  return {
    request: normalizeOperation(payload.request),
  };
}

export async function approveOperation(id: string, input: ApproveOperationInput) {
  const response = await fetch(`${env.apiBasePath}/v1/operations/${id}/approve`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  return normalizeOperation(await readJson<OperationRequest>(response));
}

export async function executeOperation(id: string) {
  const response = await fetch(`${env.apiBasePath}/v1/operations/${id}/execute`, {
    method: "POST",
  });

  return normalizeOperation(await readJson<OperationRequest>(response));
}

export async function createMintRequest(input: CreateLifecycleRequestInput) {
  const response = await fetch(`${env.apiBasePath}/v1/mint-requests`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  return normalizeOperation(await readJson<OperationRequest>(response));
}

export async function createBurnRequest(input: CreateLifecycleRequestInput) {
  const response = await fetch(`${env.apiBasePath}/v1/burn-requests`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  return normalizeOperation(await readJson<OperationRequest>(response));
}
