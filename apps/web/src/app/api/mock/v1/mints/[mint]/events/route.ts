import { NextRequest, NextResponse } from "next/server";

const events = [
  {
    id: 1,
    event_type: "TokensMinted",
    program_id: "Gbq8ZoZ4fE2J8wywFDYgSREPWL5qhtaneAX9PwQuQyCC",
    mint: "Mint111111111111111111111111111111111111111",
    tx_signature: "3V3rmN3uQpP4i5q8Ka8v1qY9px1mQy91nVbs5a8Qm6Cb5x4TgWmH4gGd4Ns",
    slot: 120001,
    block_time: "2026-03-15T06:30:00Z",
    instruction_index: 0,
    data: { amount: "1000000" },
    created_at: "2026-03-15T06:30:00Z",
  },
  {
    id: 2,
    event_type: "LifecycleRequestApproved",
    program_id: "Gbq8ZoZ4fE2J8wywFDYgSREPWL5qhtaneAX9PwQuQyCC",
    mint: "Mint111111111111111111111111111111111111111",
    tx_signature: "5XP6uB3R3Kc6kGJuwL2Mm5eVxG5m95uEDuQ8sZtVuCEXB3u3Yw5f2LQ8dS8",
    slot: 120050,
    block_time: "2026-03-15T07:10:00Z",
    instruction_index: 1,
    data: { request_id: "req-1" },
    created_at: "2026-03-15T07:10:00Z",
  },
];

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ mint: string }> },
) {
  const { mint } = await context.params;
  const url = new URL(_request.url);
  const eventType = url.searchParams.get("event_type");
  const limit = Number(url.searchParams.get("limit") ?? "25");
  const offset = Number(url.searchParams.get("offset") ?? "0");
  const sort = url.searchParams.get("sort") ?? "slot";
  const order = url.searchParams.get("order") ?? "desc";

  let filtered = events.filter((event) => event.mint === mint);

  if (eventType) {
    filtered = filtered.filter((event) => event.event_type === eventType);
  }

  filtered = filtered.toSorted((left, right) => {
    const key = sort === "created_at" ? "created_at" : sort === "block_time" ? "block_time" : "slot";
    const leftValue = left[key] ?? "";
    const rightValue = right[key] ?? "";

    if (leftValue < rightValue) return order === "asc" ? -1 : 1;
    if (leftValue > rightValue) return order === "asc" ? 1 : -1;
    return 0;
  });

  return NextResponse.json({
    total: filtered.length,
    events: filtered.slice(offset, offset + limit),
  });
}
