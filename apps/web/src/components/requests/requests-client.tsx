"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  approveOperation,
  createMintRequest,
  executeOperation,
  getOperation,
  getOperations,
} from "@/lib/api";
import { formatAmount, formatDate, truncateMiddle } from "@/lib/format";
import type { OperationStatus } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const APPROVEABLE: OperationStatus[] = ["requested"];
const EXECUTABLE: OperationStatus[] = ["approved", "submitted"];

function getStatusColor(status: OperationStatus): string {
  switch (status) {
    case "finalized":
      return "bg-success/20 text-success";
    case "failed":
    case "cancelled":
      return "bg-destructive/20 text-destructive";
    default:
      return "bg-warning/20 text-warning";
  }
}

export function RequestsClient() {
  const searchParams = useSearchParams();
  const mintFromUrl = searchParams.get("mint") ?? "";
  const queryClient = useQueryClient();
  const [mint, setMint] = useState(mintFromUrl);
  const [recipient, setRecipient] = useState("");
  const [tokenAccount, setTokenAccount] = useState("");

  useEffect(() => {
    setMint(mintFromUrl);
  }, [mintFromUrl]);
  const [amount, setAmount] = useState("");
  const [requestedBy, setRequestedBy] = useState("operator@local");
  const [approvedBy, setApprovedBy] = useState("operator@local");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const hasMint = !!mintFromUrl.trim();
  const operationsQuery = useQuery({
    queryKey: ["operations", { mint: mintFromUrl || undefined, type: "mint", limit: "50" }],
    queryFn: () => getOperations({ mint: mintFromUrl || undefined, type: "mint", limit: "50" }),
    enabled: hasMint,
  });

  const detailQuery = useQuery({
    queryKey: ["operation", selectedId ?? ""],
    queryFn: () => getOperation(selectedId!),
    enabled: !!selectedId,
  });

  const createMutation = useMutation({
    mutationFn: createMintRequest,
    onSuccess: () => {
      toast.success("Request created");
      queryClient.invalidateQueries({ queryKey: ["operations"] });
      setMint(mintFromUrl);
      setRecipient("");
      setTokenAccount("");
      setAmount("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const approveMutation = useMutation({
    mutationFn: ({ id }: { id: string }) =>
      approveOperation(id, { approved_by: approvedBy }),
    onSuccess: (_, { id }) => {
      toast.success("Approved");
      queryClient.invalidateQueries({ queryKey: ["operations"] });
      queryClient.invalidateQueries({ queryKey: ["operation", id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const executeMutation = useMutation({
    mutationFn: executeOperation,
    onSuccess: (_, id) => {
      toast.success("Execution queued");
      queryClient.invalidateQueries({ queryKey: ["operations"] });
      queryClient.invalidateQueries({ queryKey: ["operation", id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const detail = detailQuery.data?.request;
  const canApprove = detail && APPROVEABLE.includes(detail.status);
  const canExecute = detail && EXECUTABLE.includes(detail.status);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!mint.trim() || !recipient.trim() || !tokenAccount.trim() || !amount.trim() || !requestedBy.trim()) {
      toast.error("Mint, recipient, token account, amount, and requested_by are required");
      return;
    }
    createMutation.mutate({
      mint: mint.trim(),
      recipient: recipient.trim(),
      token_account: tokenAccount.trim(),
      amount: amount.trim(),
      requested_by: requestedBy.trim(),
    });
  }

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold">Fiat → Stablecoin</h1>

      {!hasMint && (
        <p className="text-sm text-muted-foreground">
          Enter a mint address in the navbar to filter requests, or create a new one below.
        </p>
      )}

      <Card className="max-w-xl">
        <CardHeader>
          <h2 className="text-sm font-medium">New mint request</h2>
        </CardHeader>
        <CardContent>
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="text-xs text-muted-foreground">Mint address</label>
            <Input
              value={mint}
              onChange={(e) => setMint(e.target.value)}
              placeholder="Base58 mint pubkey"
              className="mt-1 bg-input border-border"
              required
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Recipient</label>
            <Input
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              placeholder="Wallet address"
              className="mt-1 bg-input border-border"
              required
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Token account</label>
            <Input
              value={tokenAccount}
              onChange={(e) => setTokenAccount(e.target.value)}
              placeholder="Destination token account (ATA)"
              className="mt-1 bg-input border-border"
              required
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Amount</label>
            <Input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="e.g. 1000"
              className="mt-1 bg-input border-border"
              required
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Requested by</label>
            <Input
              value={requestedBy}
              onChange={(e) => setRequestedBy(e.target.value)}
              placeholder="Identity"
              className="mt-1 bg-input border-border"
              required
            />
          </div>
        </div>
        <Button type="submit" disabled={createMutation.isPending}>
          {createMutation.isPending ? "Creating…" : "Create request"}
        </Button>
      </form>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <Card>
          <CardHeader>
            <h2 className="text-sm font-medium">Mint requests</h2>
          </CardHeader>
          <CardContent className="pt-0">
          <div className="max-h-[400px] overflow-auto">
            {!hasMint && (
              <div className="p-8 text-center text-sm text-muted-foreground">
                Enter a mint address in the navbar to view requests
              </div>
            )}
            {hasMint && operationsQuery.isPending && (
              <div className="p-8 text-center text-sm text-muted-foreground">
                Loading…
              </div>
            )}
            {hasMint && operationsQuery.data?.requests.length === 0 && !operationsQuery.isPending && (
              <div className="p-8 text-center text-sm text-muted-foreground">
                No mint requests
              </div>
            )}
            {operationsQuery.data && operationsQuery.data.requests.length > 0 && (
              <Table>
                <TableHeader>
                  <TableRow className="border-border hover:bg-transparent">
                    <TableHead>Amount</TableHead>
                    <TableHead>Mint</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Updated</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {operationsQuery.data.requests.map((op) => (
                    <TableRow
                      key={op.id}
                      className={`cursor-pointer border-border ${
                        selectedId === op.id ? "bg-accent" : ""
                      }`}
                      onClick={() => setSelectedId(op.id)}
                    >
                      <TableCell className="font-medium">
                        {formatAmount(op.amount)}
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {truncateMiddle(op.mint)}
                      </TableCell>
                      <TableCell>
                        <span
                          className={`rounded px-2 py-0.5 text-xs font-medium ${getStatusColor(op.status)}`}
                        >
                          {op.status}
                        </span>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {formatDate(op.updated_at)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="text-sm font-medium">Request detail</h2>
          </CardHeader>
          <CardContent>
          {!selectedId && (
            <p className="text-sm text-muted-foreground">
              Select a request from the list
            </p>
          )}
          {selectedId && detailQuery.isPending && (
            <p className="text-sm text-muted-foreground">Loading…</p>
          )}
          {detail && (
            <>
              <div className="space-y-2 text-sm">
                <p>
                  <span className="text-muted-foreground">ID:</span> {detail.id}
                </p>
                <p>
                  <span className="text-muted-foreground">Mint:</span>{" "}
                  {truncateMiddle(detail.mint)}
                </p>
                <p>
                  <span className="text-muted-foreground">Amount:</span>{" "}
                  {formatAmount(detail.amount)}
                </p>
                <p>
                  <span className="text-muted-foreground">Recipient:</span>{" "}
                  {detail.recipient}
                </p>
                <p>
                  <span className="text-muted-foreground">Requested by:</span>{" "}
                  {detail.requested_by}
                </p>
              </div>
              <div className="space-y-2 pt-2 border-t border-border">
                <Input
                  value={approvedBy}
                  onChange={(e) => setApprovedBy(e.target.value)}
                  placeholder="Approver identity"
                  className="bg-input border-border"
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    disabled={!canApprove || approveMutation.isPending || !approvedBy.trim()}
                    onClick={() => approveMutation.mutate({ id: detail.id })}
                  >
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!canExecute || executeMutation.isPending}
                    onClick={() => executeMutation.mutate(detail.id)}
                  >
                    Execute
                  </Button>
                </div>
              </div>
            </>
          )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
