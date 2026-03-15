"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  approveOperation,
  createBurnRequest,
  createMintRequest,
  executeOperation,
  getOperation,
  getOperations,
} from "@/lib/api";
import { getAssociatedTokenAddress } from "@/lib/ata";
import {
  formatAmount,
  formatDate,
  getOperationLabel,
  getStatusTone,
  truncateMiddle,
} from "@/lib/format";
import type { OperationStatus, OperationType } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

export function OperationsClient() {
  const searchParams = useSearchParams();
  const mintFromUrl = searchParams.get("mint") ?? "";
  const typeFromUrl = (searchParams.get("type") as OperationType | null) ?? "";
  const queryClient = useQueryClient();
  const [mint, setMint] = useState(mintFromUrl);
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [requestedBy, setRequestedBy] = useState("operator@local");
  const [approvedBy, setApprovedBy] = useState("operator@local");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    setMint(mintFromUrl);
  }, [mintFromUrl]);

  const operationsQuery = useQuery({
    queryKey: [
      "operations",
      {
        mint: mintFromUrl || undefined,
        type: typeFromUrl || undefined,
        limit: "50",
      },
    ],
    queryFn: () =>
      getOperations({
        mint: mintFromUrl || undefined,
        type: typeFromUrl || undefined,
        limit: "50",
      }),
  });

  const detailQuery = useQuery({
    queryKey: ["operation", selectedId ?? ""],
    queryFn: () => getOperation(selectedId!),
    enabled: !!selectedId,
  });

  const createMintMutation = useMutation({
    mutationFn: createMintRequest,
    onSuccess: () => {
      toast.success("Mint request created");
      queryClient.invalidateQueries({ queryKey: ["operations"] });
      setRecipient("");
      setAmount("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const createBurnMutation = useMutation({
    mutationFn: createBurnRequest,
    onSuccess: () => {
      toast.success("Burn request created");
      queryClient.invalidateQueries({ queryKey: ["operations"] });
      setRecipient("");
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

  function deriveTokenAccount(): string | null {
    if (!mint.trim() || !recipient.trim()) return null;
    try {
      return getAssociatedTokenAddress(mint.trim(), recipient.trim());
    } catch {
      return null;
    }
  }

  function onSubmitMint(e: React.FormEvent) {
    e.preventDefault();
    if (!mint.trim() || !recipient.trim() || !amount.trim() || !requestedBy.trim()) {
      toast.error("Mint, recipient, amount, and requested_by are required");
      return;
    }
    const tokenAccount = deriveTokenAccount();
    if (!tokenAccount) {
      toast.error("Invalid mint or recipient address");
      return;
    }
    createMintMutation.mutate({
      mint: mint.trim(),
      recipient: recipient.trim(),
      token_account: tokenAccount,
      amount: amount.trim(),
      requested_by: requestedBy.trim(),
    });
  }

  function onSubmitBurn(e: React.FormEvent) {
    e.preventDefault();
    if (!mint.trim() || !recipient.trim() || !amount.trim() || !requestedBy.trim()) {
      toast.error("Mint, recipient, amount, and requested_by are required");
      return;
    }
    const tokenAccount = deriveTokenAccount();
    if (!tokenAccount) {
      toast.error("Invalid mint or recipient address");
      return;
    }
    createBurnMutation.mutate({
      mint: mint.trim(),
      recipient: recipient.trim(),
      token_account: tokenAccount,
      amount: amount.trim(),
      requested_by: requestedBy.trim(),
    });
  }

  const tokenAccountDerived = deriveTokenAccount();

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold">Operations</h1>
      <p className="text-sm text-muted-foreground">
        Create mint and burn requests, approve operator actions, and queue execution.
      </p>

      <Tabs defaultValue="mint" className="w-full">
        <TabsList className="w-full max-w-md">
          <TabsTrigger value="mint" className="flex-1">
            Mint
          </TabsTrigger>
          <TabsTrigger value="burn" className="flex-1">
            Burn
          </TabsTrigger>
        </TabsList>
        <TabsContent value="mint" className="mt-4">
          <Card className="w-full">
            <CardHeader>
              <h2 className="text-sm font-medium">New mint request</h2>
              <p className="text-xs text-muted-foreground">
                Token account is derived from recipient wallet and mint (ATA).
              </p>
            </CardHeader>
            <CardContent>
              <form onSubmit={onSubmitMint} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
                    <label className="text-xs text-muted-foreground">Recipient wallet</label>
                    <Input
                      value={recipient}
                      onChange={(e) => setRecipient(e.target.value)}
                      placeholder="Wallet address"
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
                {tokenAccountDerived && (
                  <p className="text-xs text-muted-foreground">
                    Derived ATA: <span className="font-mono">{truncateMiddle(tokenAccountDerived, 12)}</span>
                  </p>
                )}
                <Button type="submit" disabled={createMintMutation.isPending}>
                  {createMintMutation.isPending ? "Creating…" : "Create mint request"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="burn" className="mt-4">
          <Card className="w-full">
            <CardHeader>
              <h2 className="text-sm font-medium">New burn request</h2>
              <p className="text-xs text-muted-foreground">
                Token account is derived from owner wallet and mint (ATA).
              </p>
            </CardHeader>
            <CardContent>
              <form onSubmit={onSubmitBurn} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
                    <label className="text-xs text-muted-foreground">Owner wallet</label>
                    <Input
                      value={recipient}
                      onChange={(e) => setRecipient(e.target.value)}
                      placeholder="Owner of token account to burn from"
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
                {tokenAccountDerived && (
                  <p className="text-xs text-muted-foreground">
                    Derived ATA: <span className="font-mono">{truncateMiddle(tokenAccountDerived, 12)}</span>
                  </p>
                )}
                <Button type="submit" disabled={createBurnMutation.isPending}>
                  {createBurnMutation.isPending ? "Creating…" : "Create burn request"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Card>
        <CardHeader>
          <h2 className="text-sm font-medium">Requests</h2>
          <p className="text-xs text-muted-foreground">
            Total: {operationsQuery.data?.total ?? 0}. Select a row to view details and actions.
          </p>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-6 lg:flex-row">
            <div className="min-h-0 flex-1 overflow-auto">
              <div className="max-h-[420px] overflow-auto rounded-lg border">
                {operationsQuery.isPending && (
                  <div className="p-8 text-center text-sm text-muted-foreground">
                    Loading…
                  </div>
                )}
                {operationsQuery.isError && (
                  <div className="p-4 text-sm text-destructive">
                    {operationsQuery.error.message}
                  </div>
                )}
                {operationsQuery.data?.requests.length === 0 && !operationsQuery.isPending && (
                  <div className="p-8 text-center text-sm text-muted-foreground">
                    No operations yet
                  </div>
                )}
                {operationsQuery.data && operationsQuery.data.requests.length > 0 && (
                  <Table>
                    <TableHeader>
                      <TableRow className="border-border hover:bg-transparent">
                        <TableHead>Type</TableHead>
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
                            {(op.type ?? "unknown").toUpperCase()}
                          </TableCell>
                          <TableCell className="font-medium">
                            {formatAmount(op.amount)}
                          </TableCell>
                          <TableCell className="font-mono text-sm">
                            {truncateMiddle(op.mint)}
                          </TableCell>
                          <TableCell>
                            <Badge variant={getStatusTone(op.status)}>{op.status}</Badge>
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
            </div>

            <div className="min-w-0 shrink-0 lg:w-80">
              <div className="rounded-lg border p-4">
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
                    <div className="space-y-3 text-sm">
                      <div>
                        <p className="font-medium">{getOperationLabel(detail.type)}</p>
                        <p className="text-muted-foreground font-mono text-xs">{detail.id}</p>
                      </div>
                      <dl className="grid gap-2">
                        <div>
                          <dt className="text-muted-foreground">Mint</dt>
                          <dd className="font-mono text-xs">{truncateMiddle(detail.mint)}</dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground">Amount</dt>
                          <dd>{formatAmount(detail.amount)}</dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground">Recipient</dt>
                          <dd className="font-mono text-xs">{truncateMiddle(detail.recipient)}</dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground">Token account</dt>
                          <dd className="font-mono text-xs">{truncateMiddle(detail.token_account)}</dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground">Requested by</dt>
                          <dd>{detail.requested_by}</dd>
                        </div>
                      </dl>
                      <Badge variant={getStatusTone(detail.status)}>{detail.status}</Badge>
                    </div>
                    <div className="mt-4 space-y-2 border-t border-border pt-4">
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
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
