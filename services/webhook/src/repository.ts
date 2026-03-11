import { query } from "@sss/shared";

export interface WebhookSubscription {
  id: string;
  url: string;
  secret: string;
  event_types: string[];
  mint_filter: string | null;
  active: boolean;
  created_at: string;
}

export interface WebhookDelivery {
  id: string;
  subscription_id: string;
  event_id: string;
  status: "pending" | "success" | "failed" | "exhausted";
  attempts: number;
  last_status_code: number | null;
  next_retry_at: string | null;
  created_at: string;
  updated_at: string;
}

// ---- Subscriptions ----

export async function createSubscription(params: {
  url: string;
  secret: string;
  eventTypes: string[];
  mintFilter?: string;
}): Promise<WebhookSubscription> {
  const result = await query<WebhookSubscription>(
    `INSERT INTO webhook_subscriptions (url, secret, event_types, mint_filter)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [params.url, params.secret, params.eventTypes, params.mintFilter ?? null],
  );
  return result.rows[0];
}

export async function listSubscriptions(activeOnly = true): Promise<WebhookSubscription[]> {
  const result = await query<WebhookSubscription>(
    `SELECT * FROM webhook_subscriptions ${activeOnly ? "WHERE active = true" : ""} ORDER BY created_at DESC`,
  );
  return result.rows;
}

export async function getSubscription(id: string): Promise<WebhookSubscription | null> {
  const result = await query<WebhookSubscription>(
    `SELECT * FROM webhook_subscriptions WHERE id = $1`,
    [id],
  );
  return result.rows[0] ?? null;
}

export async function updateSubscription(
  id: string,
  updates: Partial<Pick<WebhookSubscription, "url" | "secret" | "event_types" | "mint_filter" | "active">>,
): Promise<WebhookSubscription | null> {
  const sets: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (updates.url !== undefined) { sets.push(`url = $${idx++}`); values.push(updates.url); }
  if (updates.secret !== undefined) { sets.push(`secret = $${idx++}`); values.push(updates.secret); }
  if (updates.event_types !== undefined) { sets.push(`event_types = $${idx++}`); values.push(updates.event_types); }
  if (updates.mint_filter !== undefined) { sets.push(`mint_filter = $${idx++}`); values.push(updates.mint_filter); }
  if (updates.active !== undefined) { sets.push(`active = $${idx++}`); values.push(updates.active); }

  if (sets.length === 0) return getSubscription(id);

  values.push(id);
  const result = await query<WebhookSubscription>(
    `UPDATE webhook_subscriptions SET ${sets.join(", ")} WHERE id = $${idx} RETURNING *`,
    values,
  );
  return result.rows[0] ?? null;
}

export async function findMatchingSubscriptions(
  eventType: string,
  mint: string,
): Promise<WebhookSubscription[]> {
  const result = await query<WebhookSubscription>(
    `SELECT * FROM webhook_subscriptions
     WHERE active = true
       AND ($1 = ANY(event_types) OR '*' = ANY(event_types))
       AND (mint_filter IS NULL OR mint_filter = $2)`,
    [eventType, mint],
  );
  return result.rows;
}

// ---- Deliveries ----

export async function createDelivery(params: {
  subscriptionId: string;
  eventId: string;
}): Promise<WebhookDelivery> {
  const result = await query<WebhookDelivery>(
    `INSERT INTO webhook_deliveries (subscription_id, event_id, status)
     VALUES ($1, $2, 'pending')
     RETURNING *`,
    [params.subscriptionId, params.eventId],
  );
  return result.rows[0];
}

export async function updateDelivery(
  id: string,
  update: {
    status: WebhookDelivery["status"];
    attempts: number;
    lastStatusCode?: number;
    nextRetryAt?: Date;
  },
): Promise<void> {
  await query(
    `UPDATE webhook_deliveries
     SET status = $1, attempts = $2, last_status_code = $3, next_retry_at = $4, updated_at = now()
     WHERE id = $5`,
    [
      update.status,
      update.attempts,
      update.lastStatusCode ?? null,
      update.nextRetryAt?.toISOString() ?? null,
      id,
    ],
  );
}

export async function getPendingRetries(): Promise<
  (WebhookDelivery & { subscription: WebhookSubscription; event_payload: unknown })[]
> {
  const result = await query<
    WebhookDelivery & { subscription: WebhookSubscription; event_payload: unknown }
  >(
    `SELECT d.*, row_to_json(s.*) AS subscription, e.payload AS event_payload
     FROM webhook_deliveries d
     JOIN webhook_subscriptions s ON s.id = d.subscription_id
     JOIN sss_events e ON e.id = d.event_id
     WHERE d.status = 'pending'
       AND (d.next_retry_at IS NULL OR d.next_retry_at <= now())
     ORDER BY d.next_retry_at ASC NULLS FIRST
     LIMIT 100`,
  );
  return result.rows;
}

export async function listDeliveries(params: {
  subscriptionId?: string;
  status?: string;
  limit?: number;
}): Promise<WebhookDelivery[]> {
  const conditions: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (params.subscriptionId) {
    conditions.push(`subscription_id = $${idx++}`);
    values.push(params.subscriptionId);
  }
  if (params.status) {
    conditions.push(`status = $${idx++}`);
    values.push(params.status);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  values.push(params.limit ?? 50);

  const result = await query<WebhookDelivery>(
    `SELECT * FROM webhook_deliveries ${where} ORDER BY created_at DESC LIMIT $${idx}`,
    values,
  );
  return result.rows;
}
