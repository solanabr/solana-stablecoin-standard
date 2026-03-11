import { query } from "@sss/shared";

export type RequestStatus = "pending" | "submitted" | "confirmed" | "failed";

export interface MintRequest {
  id: string;
  idempotency_key: string | null;
  mint: string;
  recipient: string;
  amount: string;
  status: RequestStatus;
  tx_signature: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

export interface BurnRequest {
  id: string;
  idempotency_key: string | null;
  mint: string;
  from_account: string;
  amount: string;
  status: RequestStatus;
  tx_signature: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

// ---- Mint Requests ----

export async function findMintRequestByIdempotencyKey(
  key: string,
): Promise<MintRequest | null> {
  const result = await query<MintRequest>(
    `SELECT * FROM mint_requests WHERE idempotency_key = $1`,
    [key],
  );
  return result.rows[0] ?? null;
}

export async function findMintRequestById(id: string): Promise<MintRequest | null> {
  const result = await query<MintRequest>(
    `SELECT * FROM mint_requests WHERE id = $1`,
    [id],
  );
  return result.rows[0] ?? null;
}

export async function createMintRequest(params: {
  idempotencyKey?: string;
  mint: string;
  recipient: string;
  amount: string;
}): Promise<MintRequest> {
  const result = await query<MintRequest>(
    `INSERT INTO mint_requests (idempotency_key, mint, recipient, amount, status)
     VALUES ($1, $2, $3, $4, 'pending')
     RETURNING *`,
    [params.idempotencyKey ?? null, params.mint, params.recipient, params.amount],
  );
  return result.rows[0];
}

export async function updateMintRequest(
  id: string,
  update: { status: RequestStatus; txSignature?: string; error?: string },
): Promise<void> {
  await query(
    `UPDATE mint_requests
     SET status = $1, tx_signature = COALESCE($2, tx_signature), error = $3, updated_at = now()
     WHERE id = $4`,
    [update.status, update.txSignature ?? null, update.error ?? null, id],
  );
}

// ---- Burn Requests ----

export async function findBurnRequestByIdempotencyKey(
  key: string,
): Promise<BurnRequest | null> {
  const result = await query<BurnRequest>(
    `SELECT * FROM burn_requests WHERE idempotency_key = $1`,
    [key],
  );
  return result.rows[0] ?? null;
}

export async function findBurnRequestById(id: string): Promise<BurnRequest | null> {
  const result = await query<BurnRequest>(
    `SELECT * FROM burn_requests WHERE id = $1`,
    [id],
  );
  return result.rows[0] ?? null;
}

export async function createBurnRequest(params: {
  idempotencyKey?: string;
  mint: string;
  fromAccount: string;
  amount: string;
}): Promise<BurnRequest> {
  const result = await query<BurnRequest>(
    `INSERT INTO burn_requests (idempotency_key, mint, from_account, amount, status)
     VALUES ($1, $2, $3, $4, 'pending')
     RETURNING *`,
    [params.idempotencyKey ?? null, params.mint, params.fromAccount, params.amount],
  );
  return result.rows[0];
}

export async function updateBurnRequest(
  id: string,
  update: { status: RequestStatus; txSignature?: string; error?: string },
): Promise<void> {
  await query(
    `UPDATE burn_requests
     SET status = $1, tx_signature = COALESCE($2, tx_signature), error = $3, updated_at = now()
     WHERE id = $4`,
    [update.status, update.txSignature ?? null, update.error ?? null, id],
  );
}
