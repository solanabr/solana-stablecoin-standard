"use client";

import { useMemo, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { approveOperation, executeOperation, getOperation, getOperations } from "@/lib/api";
import {
  formatAmount,
  formatDate,
  getOperationLabel,
  getStatusTone,
  truncateMiddle,
} from "@/lib/format";
import type { OperationStatus, OperationType, OperationsQuery } from "@/lib/types";
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

const APPROVEABLE_STATUSES: OperationStatus[] = ["requested"];
const EXECUTABLE_STATUSES: OperationStatus[] = ["approved", "submitted"];

function getOperationsQuery(searchParams: URLSearchParams): OperationsQuery {
  return {
    mint: searchParams.get("mint") ?? undefined,
    status: (searchParams.get("status") as OperationStatus | null) ?? "",
    type: (searchParams.get("type") as OperationType | null) ?? "",
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

export function canApprove(status: OperationStatus) {
  return APPROVEABLE_STATUSES.includes(status);
}

export function canExecute(status: OperationStatus) {
  return EXECUTABLE_STATUSES.includes(status);
}

export function OperationsPageClient() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const queryClient = useQueryClient();
  const currentQuery = useMemo(
    () => getOperationsQuery(new URLSearchParams(searchParams)),
    [searchParams],
  );
  const [approvedBy, setApprovedBy] = useState("operator@local");
  const selectedId = searchParams.get("selected") ?? "";

  const operationsQuery = useQuery({
    queryKey: ["operations", currentQuery],
    queryFn: () => getOperations(currentQuery),
  });

  const detailQuery = useQuery({
    queryKey: ["operation", selectedId],
    queryFn: () => getOperation(selectedId),
    enabled: selectedId.length > 0,
  });

  function replaceParams(values: Record<string, string | undefined>) {
    const next = updateSearchParams(new URLSearchParams(searchParams), values);
    startTransition(() => {
      router.replace(`${pathname}?${next.toString()}`);
    });
  }

  const approveMutation = useMutation({
    mutationFn: async (id: string) => approveOperation(id, { approved_by: approvedBy }),
    onSuccess: async (_, id) => {
      toast.success("Operation approved");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["operations"] }),
        queryClient.invalidateQueries({ queryKey: ["operation", id] }),
      ]);
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const executeMutation = useMutation({
    mutationFn: executeOperation,
    onSuccess: async (_, id) => {
      toast.success("Operation execution queued");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["operations"] }),
        queryClient.invalidateQueries({ queryKey: ["operation", id] }),
      ]);
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const detail = detailQuery.data?.request;

  return (
    <AppShell
      activePath="/operations"
      title="Operations"
      description="Review lifecycle requests, approve operator actions, and queue execution."
    >
      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Request queue</CardTitle>
            <CardDescription>Filter mint and burn requests using the live operations API.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-4">
              <Input
                value={currentQuery.mint ?? ""}
                onChange={(event) => replaceParams({ mint: event.target.value || undefined, offset: "0" })}
                placeholder="Filter by mint"
                aria-label="Mint filter"
              />
              <Select
                value={currentQuery.status || "all"}
                onValueChange={(value) =>
                  replaceParams({ status: value === "all" ? undefined : value, offset: "0" })
                }
              >
                <SelectTrigger aria-label="Status filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="requested">Requested</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="submitted">Submitted</SelectItem>
                  <SelectItem value="finalized">Finalized</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={currentQuery.type || "all"}
                onValueChange={(value) =>
                  replaceParams({ type: value === "all" ? undefined : value, offset: "0" })
                }
              >
                <SelectTrigger aria-label="Type filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  <SelectItem value="mint">Mint</SelectItem>
                  <SelectItem value="burn">Burn</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={currentQuery.limit ?? "25"}
                onValueChange={(value) => replaceParams({ limit: value, offset: "0" })}
              >
                <SelectTrigger aria-label="Limit filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="25">25 rows</SelectItem>
                  <SelectItem value="50">50 rows</SelectItem>
                  <SelectItem value="100">100 rows</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {operationsQuery.isPending ? (
              <div className="rounded-lg border border-dashed p-8 text-sm text-muted-foreground">
                Loading operations...
              </div>
            ) : null}
            {operationsQuery.isError ? (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
                {operationsQuery.error.message}
              </div>
            ) : null}
            {operationsQuery.data && operationsQuery.data.requests.length === 0 ? (
              <div className="rounded-lg border border-dashed p-8 text-sm text-muted-foreground">
                No operations matched the current filters.
              </div>
            ) : null}
            {operationsQuery.data && operationsQuery.data.requests.length > 0 ? (
              <div data-slot="table-container" className="overflow-x-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Type</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Mint</TableHead>
                      <TableHead>Updated</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {operationsQuery.data.requests.map((request) => (
                      <TableRow
                        key={request.id}
                        className={selectedId === request.id ? "bg-muted/50" : undefined}
                        onClick={() => replaceParams({ selected: request.id })}
                      >
                        <TableCell className="font-medium">{(request.type ?? "unknown").toUpperCase()}</TableCell>
                        <TableCell>
                          <Badge variant={getStatusTone(request.status)}>{request.status}</Badge>
                        </TableCell>
                        <TableCell>{formatAmount(request.amount)}</TableCell>
                        <TableCell>{truncateMiddle(request.mint)}</TableCell>
                        <TableCell>{formatDate(request.updated_at)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : null}
            <div className="text-sm text-muted-foreground">
              Total requests: {operationsQuery.data?.total ?? 0}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Request detail</CardTitle>
            <CardDescription>
              Select a row to inspect the latest request status and available actions.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!selectedId ? (
              <div className="rounded-lg border border-dashed p-8 text-sm text-muted-foreground">
                Select a request from the queue.
              </div>
            ) : null}
            {selectedId && detailQuery.isPending ? (
              <div className="rounded-lg border border-dashed p-8 text-sm text-muted-foreground">
                Loading request detail...
              </div>
            ) : null}
            {selectedId && detailQuery.isError ? (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
                {detailQuery.error.message}
              </div>
            ) : null}
            {detail ? (
              <>
                <div className="space-y-3 text-sm">
                  <div>
                    <p className="font-medium">{getOperationLabel(detail.type)}</p>
                    <p className="text-muted-foreground">{detail.id}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant={getStatusTone(detail.status)}>{detail.status}</Badge>
                    {detail.tx_signature ? <Badge variant="outline">{truncateMiddle(detail.tx_signature)}</Badge> : null}
                  </div>
                  <dl className="grid gap-3">
                    <div>
                      <dt className="text-muted-foreground">Mint</dt>
                      <dd>{detail.mint}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Recipient</dt>
                      <dd>{detail.recipient}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Token account</dt>
                      <dd>{detail.token_account}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Amount</dt>
                      <dd>{formatAmount(detail.amount)}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Requested by</dt>
                      <dd>{detail.requested_by}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Approved by</dt>
                      <dd>{detail.approved_by ?? "N/A"}</dd>
                    </div>
                    {detail.reason ? (
                      <div>
                        <dt className="text-muted-foreground">Reason</dt>
                        <dd>{detail.reason}</dd>
                      </div>
                    ) : null}
                    {detail.error ? (
                      <div>
                        <dt className="text-muted-foreground">Error</dt>
                        <dd className="text-destructive">{detail.error}</dd>
                      </div>
                    ) : null}
                  </dl>
                </div>

                <div className="space-y-3 border-t pt-4">
                  <Input
                    value={approvedBy}
                    onChange={(event) => setApprovedBy(event.target.value)}
                    placeholder="Approver identity"
                    aria-label="Approver identity"
                  />
                  <div className="flex flex-col gap-2">
                    <Button
                      type="button"
                      disabled={!canApprove(detail.status) || approveMutation.isPending || approvedBy.trim().length === 0}
                      onClick={() => approveMutation.mutate(detail.id)}
                    >
                      Approve request
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={!canExecute(detail.status) || executeMutation.isPending}
                      onClick={() => executeMutation.mutate(detail.id)}
                    >
                      Execute request
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
