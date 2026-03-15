"use client";

import { useMemo, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Search, SlidersHorizontal } from "lucide-react";
import { getMintEvents } from "@/lib/api";
import { formatCount, formatDate, formatSlot, getEventSummary, truncateMiddle } from "@/lib/format";
import { isMintAddress, normalizeMint } from "@/lib/mint";
import type { EventSort, EventsQuery, SortOrder } from "@/lib/types";
import { AppShell } from "@/components/dashboard/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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

const PAGE_SIZE_OPTIONS = ["25", "50", "100"];

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

function updateSearchParams(current: URLSearchParams, values: Record<string, string | undefined>) {
  const next = new URLSearchParams(current);

  for (const [key, value] of Object.entries(values)) {
    if (value && value.length > 0) {
      next.set(key, value);
    } else {
      next.delete(key);
    }
  }

  return next;
}

interface DashboardPageClientProps {
  activePath?: "/" | "/events";
  title?: string;
  description?: string;
}

export function DashboardPageClient({
  activePath = "/",
  title = "Events Dashboard",
  description = "Inspect mint-level activity and filter indexed events directly from the backend API.",
}: DashboardPageClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const currentQuery = useMemo(() => getQuery(new URLSearchParams(searchParams)), [searchParams]);
  const [mintInput, setMintInput] = useState(currentQuery.mint);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const hasMint = currentQuery.mint.length > 0;
  const mintIsValid = !hasMint || isMintAddress(currentQuery.mint);

  const eventsQuery = useQuery({
    queryKey: ["mint-events", currentQuery],
    queryFn: () => getMintEvents(currentQuery),
    enabled: mintIsValid && hasMint,
  });

  const summary = useMemo(() => getEventSummary(eventsQuery.data?.events ?? []), [eventsQuery.data]);
  const total = eventsQuery.data?.total ?? 0;
  const limit = Number(currentQuery.limit ?? "25");
  const offset = Number(currentQuery.offset ?? "0");
  const page = Math.floor(offset / limit) + 1;
  const maxPage = total === 0 ? 1 : Math.ceil(total / limit);

  function replaceParams(values: Record<string, string | undefined>) {
    const next = updateSearchParams(new URLSearchParams(searchParams), values);
    startTransition(() => {
      router.replace(`${pathname}?${next.toString()}`);
    });
  }

  function onMintSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const rawMint = String(formData.get("mint") ?? "");
    const mint = normalizeMint(rawMint);

    replaceParams({
      mint: mint || undefined,
      offset: "0",
    });
  }

  return (
    <AppShell
      activePath={activePath}
      title={title}
      description={description}
    >
      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Mint lookup</CardTitle>
            <CardDescription>
              Enter a mint address to load its indexed events and inspect recent activity.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <form onSubmit={onMintSubmit} className="flex flex-col gap-3 md:flex-row">
              <Input
                name="mint"
                value={mintInput}
                onChange={(event) => setMintInput(event.target.value)}
                placeholder="Enter mint address"
                aria-label="Mint address"
              />
              <Button type="submit" className="md:w-auto">
                <Search className="h-4 w-4" />
                Load mint
              </Button>
            </form>
            {hasMint && !mintIsValid ? (
              <p className="text-sm text-destructive">Enter a valid base58 mint address.</p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              {currentQuery.mint ? <Badge variant="outline">{truncateMiddle(currentQuery.mint, 8)}</Badge> : null}
              {currentQuery.event_type ? <Badge variant="secondary">{currentQuery.event_type}</Badge> : null}
              {currentQuery.program_id ? <Badge variant="secondary">{truncateMiddle(currentQuery.program_id)}</Badge> : null}
              {currentQuery.tx_signature ? <Badge variant="secondary">{truncateMiddle(currentQuery.tx_signature)}</Badge> : null}
            </div>
          </CardContent>
        </Card>

        <section className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader>
              <CardDescription>Total indexed events</CardDescription>
              <CardTitle>{formatCount(total)}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <CardDescription>Latest event</CardDescription>
              <CardTitle>{summary.latestType}</CardTitle>
              <CardDescription>{formatDate(summary.latestTimestamp)}</CardDescription>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <CardDescription>Unique event types</CardDescription>
              <CardTitle>{formatCount(summary.uniqueEventTypes)}</CardTitle>
            </CardHeader>
          </Card>
        </section>

        <Card>
          <CardHeader className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle>Event filters</CardTitle>
              <CardDescription>Filters map directly to the API query parameters.</CardDescription>
            </div>
            <Button
              variant="outline"
              type="button"
              onClick={() => setFiltersOpen((open) => !open)}
              aria-expanded={filtersOpen}
            >
              <SlidersHorizontal className="h-4 w-4" />
              {filtersOpen ? "Hide filters" : "Show filters"}
            </Button>
          </CardHeader>
          <CardContent className={filtersOpen ? "grid gap-4 md:grid-cols-4" : "hidden"}>
            <Input
              placeholder="Event type"
              value={currentQuery.event_type ?? ""}
              onChange={(event) => replaceParams({ event_type: event.target.value || undefined, offset: "0" })}
              aria-label="Event type filter"
            />
            <Input
              placeholder="Program ID"
              value={currentQuery.program_id ?? ""}
              onChange={(event) => replaceParams({ program_id: event.target.value || undefined, offset: "0" })}
              aria-label="Program id filter"
            />
            <Input
              placeholder="Transaction signature"
              value={currentQuery.tx_signature ?? ""}
              onChange={(event) =>
                replaceParams({ tx_signature: event.target.value || undefined, offset: "0" })
              }
              aria-label="Transaction signature filter"
            />
            <Select
              value={currentQuery.sort ?? "slot"}
              onValueChange={(value) => replaceParams({ sort: value, offset: "0" })}
            >
              <SelectTrigger aria-label="Sort field">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="slot">Sort by slot</SelectItem>
                <SelectItem value="block_time">Sort by block time</SelectItem>
                <SelectItem value="created_at">Sort by created at</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={currentQuery.order ?? "desc"}
              onValueChange={(value) => replaceParams({ order: value, offset: "0" })}
            >
              <SelectTrigger aria-label="Sort order">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="desc">Newest first</SelectItem>
                <SelectItem value="asc">Oldest first</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={currentQuery.limit ?? "25"}
              onValueChange={(value) => replaceParams({ limit: value, offset: "0" })}
            >
              <SelectTrigger aria-label="Page size">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZE_OPTIONS.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option} rows
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="number"
              placeholder="Min slot"
              value={currentQuery.slot_min ?? ""}
              onChange={(event) => replaceParams({ slot_min: event.target.value || undefined, offset: "0" })}
              aria-label="Minimum slot filter"
            />
            <Input
              type="number"
              placeholder="Max slot"
              value={currentQuery.slot_max ?? ""}
              onChange={(event) => replaceParams({ slot_max: event.target.value || undefined, offset: "0" })}
              aria-label="Maximum slot filter"
            />
            <Input
              type="datetime-local"
              value={currentQuery.from ?? ""}
              onChange={(event) => replaceParams({ from: event.target.value || undefined, offset: "0" })}
              aria-label="From timestamp filter"
            />
            <Input
              type="datetime-local"
              value={currentQuery.to ?? ""}
              onChange={(event) => replaceParams({ to: event.target.value || undefined, offset: "0" })}
              aria-label="To timestamp filter"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Events</CardTitle>
            <CardDescription>
              {hasMint
                ? "Event rows come directly from the backend API response."
                : "Load a mint to view its event feed."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!hasMint ? (
              <div className="rounded-lg border border-dashed p-8 text-sm text-muted-foreground">
                No mint selected yet.
              </div>
            ) : null}
            {hasMint && mintIsValid && eventsQuery.isPending ? (
              <div className="rounded-lg border border-dashed p-8 text-sm text-muted-foreground">
                Loading events...
              </div>
            ) : null}
            {hasMint && mintIsValid && eventsQuery.isError ? (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
                {eventsQuery.error.message}
              </div>
            ) : null}
            {hasMint && mintIsValid && !eventsQuery.isPending && !eventsQuery.isError ? (
              <>
                {eventsQuery.data?.events.length ? (
                  <div data-slot="table-container" className="overflow-x-auto rounded-lg border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Type</TableHead>
                          <TableHead>Slot</TableHead>
                          <TableHead>Program</TableHead>
                          <TableHead>Transaction</TableHead>
                          <TableHead>Block time</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {eventsQuery.data.events.map((event) => (
                          <TableRow key={event.id}>
                            <TableCell className="font-medium">{event.event_type}</TableCell>
                            <TableCell>{formatSlot(event.slot)}</TableCell>
                            <TableCell>{truncateMiddle(event.program_id)}</TableCell>
                            <TableCell>{truncateMiddle(event.tx_signature)}</TableCell>
                            <TableCell>{formatDate(event.block_time ?? event.created_at)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed p-8 text-sm text-muted-foreground">
                    No events found for the current filters.
                  </div>
                )}

                <div className="flex flex-col gap-3 border-t pt-4 text-sm md:flex-row md:items-center md:justify-between">
                  <div className="text-muted-foreground">
                    Page {page} of {maxPage}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      type="button"
                      disabled={offset === 0 || isPending}
                      onClick={() => replaceParams({ offset: String(Math.max(0, offset - limit)) })}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      type="button"
                      disabled={offset + limit >= total || isPending}
                      onClick={() => replaceParams({ offset: String(offset + limit) })}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              </>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
