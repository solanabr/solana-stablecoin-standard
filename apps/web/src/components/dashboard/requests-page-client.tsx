"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { createBurnRequest, createMintRequest, getOperations } from "@/lib/api";
import { getAssociatedTokenAddress } from "@/lib/ata";
import { formatAmount, formatDate, getStatusTone, truncateMiddle } from "@/lib/format";
import type { CreateLifecycleRequestInput } from "@/lib/types";
import { AppShell } from "@/components/dashboard/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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

function useMintParam() {
  const searchParams = useSearchParams();
  return useMemo(() => searchParams.get("mint") ?? "", [searchParams]);
}

export function RequestsPageClient() {
  const queryClient = useQueryClient();
  const mintFromUrl = useMintParam();
  const [mint, setMint] = useState(mintFromUrl);
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [requestedBy, setRequestedBy] = useState("operator@local");

  useEffect(() => {
    setMint(mintFromUrl);
  }, [mintFromUrl]);

  const requestsQuery = useQuery({
    queryKey: ["requests", { mint: mintFromUrl || undefined, limit: "25" }],
    queryFn: () => getOperations({ mint: mintFromUrl || undefined, limit: "25" }),
  });

  function resetForm() {
    setRecipient("");
    setAmount("");
    setReason("");
  }

  const mintMutation = useMutation({
    mutationFn: createMintRequest,
    onSuccess: async () => {
      toast.success("Mint request created");
      resetForm();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["requests"] }),
        queryClient.invalidateQueries({ queryKey: ["operations"] }),
      ]);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const burnMutation = useMutation({
    mutationFn: createBurnRequest,
    onSuccess: async () => {
      toast.success("Burn request created");
      resetForm();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["requests"] }),
        queryClient.invalidateQueries({ queryKey: ["operations"] }),
      ]);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  function deriveTokenAccount(): string | null {
    if (!mint.trim() || !recipient.trim()) return null;
    try {
      return getAssociatedTokenAddress(mint.trim(), recipient.trim());
    } catch {
      return null;
    }
  }

  function onCreateMintRequest(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!mint.trim() || !recipient.trim() || !amount.trim() || !requestedBy.trim()) {
      toast.error("Mint, recipient, amount, and requested by are required.");
      return;
    }
    const tokenAccount = deriveTokenAccount();
    if (!tokenAccount) {
      toast.error("Invalid mint or recipient address");
      return;
    }
    mintMutation.mutate({
      mint: mint.trim(),
      recipient: recipient.trim(),
      token_account: tokenAccount,
      amount: amount.trim(),
      reason: reason.trim() || undefined,
      requested_by: requestedBy.trim(),
    });
  }

  function onCreateBurnRequest(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!mint.trim() || !recipient.trim() || !amount.trim() || !requestedBy.trim()) {
      toast.error("Mint, recipient, amount, and requested by are required.");
      return;
    }
    const tokenAccount = deriveTokenAccount();
    if (!tokenAccount) {
      toast.error("Invalid mint or recipient address");
      return;
    }
    const payload: CreateLifecycleRequestInput = {
      mint: mint.trim(),
      recipient: recipient.trim(),
      token_account: tokenAccount,
      amount: amount.trim(),
      requested_by: requestedBy.trim(),
    };
    if (reason.trim()) payload.reason = reason.trim();
    burnMutation.mutate(payload);
  }

  const tokenAccountDerived = deriveTokenAccount();

  return (
    <AppShell
      activePath="/requests"
      title="Requests"
      description="Create mint and burn requests against the live lifecycle API and monitor recent submissions."
    >
      <div className="space-y-6">
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
                <CardTitle>Create mint request</CardTitle>
                <CardDescription>
                  Token account is derived from recipient wallet and mint (ATA). Queue for review and execution.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" onSubmit={onCreateMintRequest}>
                  <Input
                    aria-label="Mint address"
                    placeholder="Mint address"
                    value={mint}
                    onChange={(event) => setMint(event.target.value)}
                  />
                  <Input
                    aria-label="Recipient wallet"
                    placeholder="Recipient wallet"
                    value={recipient}
                    onChange={(event) => setRecipient(event.target.value)}
                  />
                  <Input
                    aria-label="Amount"
                    placeholder="Amount"
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                  />
                  <Input
                    aria-label="Requested by"
                    placeholder="Requested by"
                    value={requestedBy}
                    onChange={(event) => setRequestedBy(event.target.value)}
                  />
                  <Input
                    aria-label="Reason"
                    placeholder="Reason (optional)"
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    className="sm:col-span-2"
                  />
                  {tokenAccountDerived && (
                    <p className="sm:col-span-2 text-xs text-muted-foreground">
                      Derived ATA: <span className="font-mono">{truncateMiddle(tokenAccountDerived, 12)}</span>
                    </p>
                  )}
                  <Button disabled={mintMutation.isPending} type="submit">
                    {mintMutation.isPending ? "Creating..." : "Create mint request"}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="burn" className="mt-4">
            <Card className="w-full">
              <CardHeader>
                <CardTitle>Create burn request</CardTitle>
                <CardDescription>
                  Token account is derived from owner wallet and mint (ATA). Queue for review.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" onSubmit={onCreateBurnRequest}>
                  <Input
                    aria-label="Burn mint address"
                    placeholder="Mint address"
                    value={mint}
                    onChange={(event) => setMint(event.target.value)}
                  />
                  <Input
                    aria-label="Owner wallet"
                    placeholder="Owner of token account"
                    value={recipient}
                    onChange={(event) => setRecipient(event.target.value)}
                  />
                  <Input
                    aria-label="Burn amount"
                    placeholder="Amount"
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                  />
                  <Input
                    aria-label="Burn requested by"
                    placeholder="Requested by"
                    value={requestedBy}
                    onChange={(event) => setRequestedBy(event.target.value)}
                  />
                  <Input
                    aria-label="Burn reason"
                    placeholder="Reason (optional)"
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    className="sm:col-span-2"
                  />
                  {tokenAccountDerived && (
                    <p className="sm:col-span-2 text-xs text-muted-foreground">
                      Derived ATA: <span className="font-mono">{truncateMiddle(tokenAccountDerived, 12)}</span>
                    </p>
                  )}
                  <Button disabled={burnMutation.isPending} type="submit" variant="outline">
                    {burnMutation.isPending ? "Creating..." : "Create burn request"}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <Card>
          <CardHeader>
            <CardTitle>Recent requests</CardTitle>
            <CardDescription>
              {mintFromUrl
                ? `Showing requests for ${truncateMiddle(mintFromUrl, 8)}`
                : "Latest lifecycle requests from the API."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {requestsQuery.isPending ? (
              <div className="rounded-lg border border-dashed p-8 text-sm text-muted-foreground">
                Loading requests...
              </div>
            ) : null}
            {requestsQuery.isError ? (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
                {requestsQuery.error.message}
              </div>
            ) : null}
            {requestsQuery.data && requestsQuery.data.requests.length === 0 ? (
              <div className="rounded-lg border border-dashed p-8 text-sm text-muted-foreground">
                No requests found.
              </div>
            ) : null}
            {requestsQuery.data && requestsQuery.data.requests.length > 0 ? (
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
                    {requestsQuery.data.requests.map((request) => (
                      <TableRow key={request.id}>
                        <TableCell className="font-medium">{request.type.toUpperCase()}</TableCell>
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
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
