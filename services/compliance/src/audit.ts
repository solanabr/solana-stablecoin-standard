import { Response } from "express";
import { queryAuditTrail } from "./repository";

interface AuditParams {
  mint?: string;
  from?: string;
  to?: string;
  limit?: number;
  format?: "json" | "csv";
}

export async function exportAuditTrail(
  params: AuditParams,
  res: Response,
): Promise<void> {
  const rows = await queryAuditTrail({
    mint: params.mint,
    from: params.from,
    to: params.to,
    limit: params.limit ?? 500,
  });

  if (params.format === "csv") {
    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="audit-${Date.now()}.csv"`,
    );
    res.send(toCSV(rows as AuditRow[]));
  } else {
    res.json({ rows, count: rows.length });
  }
}

interface AuditRow {
  event_id: string;
  signature: string;
  slot: string;
  block_time: string | null;
  event_type: string;
  mint: string;
  payload: unknown;
  created_at: string;
  alerts: unknown[];
}

function toCSV(rows: AuditRow[]): string {
  const headers = [
    "event_id",
    "signature",
    "slot",
    "block_time",
    "event_type",
    "mint",
    "payload",
    "created_at",
    "alert_count",
  ].join(",");

  const lines = rows.map((r) =>
    [
      r.event_id,
      r.signature,
      r.slot,
      r.block_time ?? "",
      r.event_type,
      r.mint,
      `"${JSON.stringify(r.payload).replace(/"/g, '""')}"`,
      r.created_at,
      Array.isArray(r.alerts) ? r.alerts.length : 0,
    ].join(","),
  );

  return [headers, ...lines].join("\n");
}
