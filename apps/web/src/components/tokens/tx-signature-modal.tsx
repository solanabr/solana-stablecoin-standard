"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { env } from "@/lib/env";
import { ExternalLink, Copy, Check } from "lucide-react";
import { useState } from "react";

function explorerUrl(signature: string): string {
  const base = "https://explorer.solana.com/tx";
  const cluster = env.solanaCluster === "devnet" ? "?cluster=devnet" : "";
  return `${base}/${signature}${cluster}`;
}

interface TxSignatureModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  signature: string;
  title?: string;
}

export function TxSignatureModal({
  open,
  onOpenChange,
  signature,
  title = "Transaction confirmed",
}: TxSignatureModalProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(signature);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const url = explorerUrl(signature);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="rounded-lg bg-muted p-3 font-mono text-sm break-all">
            {signature}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleCopy}>
              {copied ? (
                <Check className="h-4 w-4 mr-2 text-green-500" />
              ) : (
                <Copy className="h-4 w-4 mr-2" />
              )}
              {copied ? "Copied" : "Copy"}
            </Button>
            <Button size="sm" asChild>
              <a href={url} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4 mr-2" />
                View on {env.solanaCluster === "devnet" ? "Devnet" : "Explorer"}
              </a>
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
