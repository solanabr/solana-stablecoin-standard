import { query } from "@sss/shared";

export interface ComplianceAlert {
  id: string;
  event_id: string | null;
  mint: string;
  rule: string;
  severity: "info" | "warning" | "critical";
  details: unknown;
  resolved: boolean;
  created_at: string;
}

export async function createAlert(params: {
  eventId?: string;
  mint: string;
  rule: string;
  severity: ComplianceAlert["severity"];
  details?: unknown;
}): Promise<ComplianceAlert> {
  const result = await query<ComplianceAlert>(
    `INSERT INTO compliance_alerts (event_id, mint, rule, severity, details)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [
      params.eventId ?? null,
      params.mint,
      params.rule,
      params.severity,
      JSON.stringify(params.details ?? null),
    ],
  );
  return result.rows[0];
}

export async function listAlerts(params: {
  mint?: string;
  severity?: string;
  resolved?: boolean;
  limit?: number;
}): Promise<ComplianceAlert[]> {
  const conditions: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (params.mint) { conditions.push(`mint = $${idx++}`); values.push(params.mint); }
  if (params.severity) { conditions.push(`severity = $${idx++}`); values.push(params.severity); }
  if (params.resolved !== undefined) {
    conditions.push(`resolved = $${idx++}`);
    values.push(params.resolved);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  values.push(params.limit ?? 100);

  const result = await query<ComplianceAlert>(
    `SELECT * FROM compliance_alerts ${where} ORDER BY created_at DESC LIMIT $${idx}`,
    values,
  );
  return result.rows;
}

export async function resolveAlert(id: string): Promise<void> {
  await query(`UPDATE compliance_alerts SET resolved = true WHERE id = $1`, [id]);
}

// Audit query — joins events + alerts + screenings
export async function queryAuditTrail(params: {
  mint?: string;
  from?: string;
  to?: string;
  limit?: number;
}): Promise<unknown[]> {
  const conditions: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (params.mint) { conditions.push(`e.mint = $${idx++}`); values.push(params.mint); }
  if (params.from) { conditions.push(`e.created_at >= $${idx++}`); values.push(params.from); }
  if (params.to) { conditions.push(`e.created_at <= $${idx++}`); values.push(params.to); }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  values.push(params.limit ?? 500);

  const result = await query(
    `SELECT
       e.id AS event_id,
       e.signature,
       e.slot,
       e.block_time,
       e.event_type,
       e.mint,
       e.payload,
       e.created_at,
       COALESCE(json_agg(a.*) FILTER (WHERE a.id IS NOT NULL), '[]') AS alerts
     FROM sss_events e
     LEFT JOIN compliance_alerts a ON a.event_id = e.id
     ${where}
     GROUP BY e.id
     ORDER BY e.slot DESC, e.id DESC
     LIMIT $${idx}`,
    values,
  );
  return result.rows;
}
