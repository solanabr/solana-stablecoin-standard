"use client";

import { useState, useCallback } from "react";
import { Copy, Check, ExternalLink } from "lucide-react";
import { truncateAddress, explorerUrl } from "@/lib/utils";

interface AddressProps {
  address: string;
  chars?: number;
  showExplorer?: boolean;
  className?: string;
}

export function Address({
  address,
  chars = 4,
  showExplorer = false,
  className = "",
}: AddressProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [address]);

  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <span className="font-[family-name:var(--font-jetbrains)] text-sm">
        {truncateAddress(address, chars)}
      </span>
      <button
        onClick={handleCopy}
        className="text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors"
        title="Copy address"
      >
        {copied ? (
          <Check className="w-3.5 h-3.5 text-[var(--success)]" />
        ) : (
          <Copy className="w-3.5 h-3.5" />
        )}
      </button>
      {showExplorer && (
        <a
          href={explorerUrl(address, "address")}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors"
          title="View on Explorer"
        >
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      )}
    </span>
  );
}
