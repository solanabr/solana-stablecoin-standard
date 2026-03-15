"use client";

import { useMemo, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { getMintEvents } from "@/lib/api";
import { formatDate, formatSlot, pluralize, truncateMiddle } from "@/lib/format";
import { isMintAddress } from "@/lib/mint";
import type { EventSort, EventsQuery, SortOrder } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function getQuery(searchParams: URLSearchParams): EventsQuery {
  return {
    mint: searchParams.get("mint") ?? "",
    event_type: searchParams.get("event_type") ?? undefined,
    program_id: searchParams.get("program_id") ?? undefined,
    tx_signature: searchParams.get("tx_signature") ?? undefined,
    slot_min: searchParams.get("slot_min") ?? undefined,
    slot_max: searchParams.get("slot_max") ?? undefined,
    from: searchParams.get("from") ?? undefined,
    to: searchParams.get("to") ?? undefined,
    sort: (searchParams.get("sort") as EventSort | null) ?? "slot",
    order: (searchParams.get("order") as SortOrder | null) ?? "desc",
    limit: searchParams.get("limit") ?? "25",
    offset: searchParams.get("offset") ?? "0",
  };
}

function updateParams(current: URLSearchParams, values: Record<string, string | undefined>) {
  const next = new URLSearchParams(current);
  for (const [key, value] of Object.entries(values)) {
    if (value) next.set(key, value);
    else next.delete(key);
  }
  return next;
}

export function EventsClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const currentQuery = useMemo(() => getQuery(new URLSearchParams(searchParams)), [searchParams]);

  const hasMint = (currentQuery.mint ?? "").length > 0;
  const mintIsValid = !hasMint || isMintAddress(currentQuery.mint);

  const eventsQuery = useQuery({
    queryKey: ["mint-events", currentQuery],
    queryFn: () => getMintEvents(currentQuery),
    enabled: mintIsValid && hasMint,
  });

  const total = eventsQuery.data?.total ?? 0;
  const limit = Number(currentQuery.limit ?? "25");
  const offset = Number(currentQuery.offset ?? "0");
  const page = Math.floor(offset / limit) + 1;
  const maxPage = total === 0 ? 1 : Math.ceil(total / limit);

  function replaceParams(values: Record<string, string | undefined>) {
    const next = updateParams(new URLSearchParams(searchParams), values);
    startTransition(() => router.replace(`/events?${next.toString()}`));
  }

  if (!hasMint) {
    return (
      <div className="space-y-6">
        <h1 className="text-lg font-semibold">Events</h1>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <p className="text-sm text-muted-foreground">
              Enter a mint address in the navbar to view events
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!mintIsValid) {
    return (
      <div className="space-y-6">
        <h1 className="text-lg font-semibold">Events</h1>
        <Card className="border-destructive/50">
          <CardContent className="py-6">
            <p className="text-sm text-destructive">Invalid mint address. Use a valid base58 address.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold">Events</h1>
        <p className="text-sm text-muted-foreground font-mono">
          {truncateMiddle(currentQuery.mint, 12)}
        </p>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Sort by</span>
              <Select
                value={currentQuery.sort ?? "slot"}
                onValueChange={(v) => replaceParams({ sort: v, offset: "0" })}
              >
                <SelectTrigger className="w-[140px] whitespace-nowrap">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="slot">Slot</SelectItem>
                  <SelectItem value="block_time">Block time</SelectItem>
                  <SelectItem value="created_at">Created</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Order</span>
              <Select
                value={currentQuery.order ?? "desc"}
                onValueChange={(v) => replaceParams({ order: v, offset: "0" })}
              >
                <SelectTrigger className="min-w-[145px] whitespace-nowrap">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="desc">Newest first</SelectItem>
                  <SelectItem value="asc">Oldest first</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Per page</span>
              <Select
                value={currentQuery.limit ?? "25"}
                onValueChange={(v) => replaceParams({ limit: v, offset: "0" })}
              >
                <SelectTrigger className="w-[80px] whitespace-nowrap">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="25">25</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <span className="text-sm text-muted-foreground ml-auto">
              {pluralize(total, "event")}
            </span>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {eventsQuery.isPending && (
            <div className="py-12 text-center text-sm text-muted-foreground">
              Loading events…
            </div>
          )}
          {eventsQuery.isError && (
            <div className="py-12 text-center text-sm text-destructive">
              {eventsQuery.error.message}
            </div>
          )}
          {eventsQuery.data?.events.length === 0 && !eventsQuery.isPending && !eventsQuery.isError && (
            <div className="py-12 text-center text-sm text-muted-foreground">
              No events for this mint
            </div>
          )}
          {eventsQuery.data && eventsQuery.data.events.length > 0 && (
            <>
              <div className="rounded-md border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border hover:bg-transparent">
                      <TableHead>Type</TableHead>
                      <TableHead>Slot</TableHead>
                      <TableHead>Program</TableHead>
                      <TableHead>Transaction</TableHead>
                      <TableHead>Block time</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {eventsQuery.data.events.map((ev) => (
                      <TableRow key={ev.id} className="border-border">
                        <TableCell className="font-medium">{ev.event_type}</TableCell>
                        <TableCell>{formatSlot(ev.slot)}</TableCell>
                        <TableCell className="font-mono text-sm">
                          {truncateMiddle(ev.program_id)}
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {truncateMiddle(ev.tx_signature)}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatDate(ev.block_time ?? ev.created_at)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {total > limit && (
                <div className="flex items-center justify-between pt-4">
                  <span className="text-sm text-muted-foreground">
                    Page {page} of {maxPage}
                  </span>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={offset === 0 || eventsQuery.isPending}
                      onClick={() =>
                        replaceParams({ offset: String(Math.max(0, offset - limit)) })
                      }
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={offset + limit >= total || eventsQuery.isPending}
                      onClick={() => replaceParams({ offset: String(offset + limit) })}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
