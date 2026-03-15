import type { EventRecord, OperationStatus, OperationType } from "@/lib/types";

const numberFormatter = new Intl.NumberFormat("en-US");

export function formatCount(value: number) {
  return numberFormatter.format(value);
}

export function pluralize(count: number, singular: string, plural?: string) {
  const word = count === 1 ? singular : (plural ?? `${singular}s`);
  return `${numberFormatter.format(count)} ${word}`;
}

export function formatSlot(value: number) {
  return numberFormatter.format(value);
}

export function formatAmount(value: string) {
  return numberFormatter.format(Number(value));
}

export function formatWithDecimals(value: string, decimals: number) {
  const n = Number(value) / 10 ** decimals;
  return numberFormatter.format(n);
}

export function formatDate(value: string | null) {
  if (!value) return "N/A";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function truncateMiddle(value: string | null, size = 6) {
  if (!value) return "N/A";
  if (value.length <= size * 2) return value;
  return `${value.slice(0, size)}...${value.slice(-size)}`;
}

export function getStatusTone(status: OperationStatus) {
  switch (status) {
    case "finalized":
      return "success";
    case "failed":
    case "cancelled":
      return "destructive";
    case "approved":
    case "submitted":
    case "signing":
      return "warning";
    default:
      return "secondary";
  }
}

export function getOperationLabel(type: OperationType) {
  return type === "mint" ? "Mint request" : "Burn request";
}

export function getEventSummary(events: EventRecord[]) {
  const latest = events[0] ?? null;
  const eventTypes = new Set(events.map((event) => event.event_type));

  return {
    latestType: latest?.event_type ?? "No events",
    latestTimestamp: latest?.block_time ?? latest?.created_at ?? null,
    uniqueEventTypes: eventTypes.size,
  };
}
