"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Button } from "@/components/ui/button";
import { env } from "@/lib/env";
import { ExternalLink, Copy, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
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
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <DialogPrimitive.Content
          className={cn(
            "fixed top-1/2 left-1/2 z-50 grid w-full max-w-lg -translate-x-1/2 -translate-y-1/2 gap-4 rounded-lg border bg-background p-6 shadow-lg",
          )}
        >
          <DialogPrimitive.Title className="text-lg font-semibold leading-none tracking-tight">
            {title}
          </DialogPrimitive.Title>
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
          <DialogPrimitive.Close className="absolute top-4 right-4 rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring">
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
