export type EventSort = "slot" | "block_time" | "created_at";
export type SortOrder = "asc" | "desc";
export type OperationType = "mint" | "burn";
export type OperationStatus =
  | "requested"
  | "approved"
  | "signing"
  | "submitted"
  | "finalized"
  | "failed"
  | "cancelled";

export interface EventRecord {
  id: number;
  event_type: string;
  program_id: string;
  mint: string;
  tx_signature: string;
  slot: number;
  block_time: string | null;
  instruction_index: number;
  data: Record<string, unknown>;
  created_at: string;
}

export interface EventsQuery {
  mint: string;
  event_type?: string;
  program_id?: string;
  tx_signature?: string;
  slot_min?: string;
  slot_max?: string;
  from?: string;
  to?: string;
  sort?: EventSort;
  order?: SortOrder;
  limit?: string;
  offset?: string;
}

export interface EventsResponse {
  events: EventRecord[];
  total: number;
}

export interface OperationRequest {
  id: string;
  type: OperationType;
  status: OperationStatus;
  mint: string;
  recipient: string;
  token_account: string;
  amount: string;
  minter: string | null;
  reason: string | null;
  idempotency_key: string | null;
  requested_by: string;
  approved_by: string | null;
  tx_signature: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

export interface OperationsQuery {
  mint?: string;
  status?: OperationStatus | "";
  type?: OperationType | "";
  limit?: string;
  offset?: string;
}

export interface OperationsResponse {
  requests: OperationRequest[];
  total: number;
}

export interface OperationDetailsResponse {
  request: OperationRequest;
}

export interface CreateLifecycleRequestInput {
  mint: string;
  recipient: string;
  token_account: string;
  amount: string;
  minter?: string;
  reason?: string;
  idempotency_key?: string;
  requested_by: string;
}

export interface ApproveOperationInput {
  approved_by: string;
}
