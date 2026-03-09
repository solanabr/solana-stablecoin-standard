import React, { useState } from "react";
import { truncateAddress, copyToClipboard, explorerAddressUrl } from "../../utils/format";

interface AddressDisplayProps {
  address: string;
  /** How many chars to show at start/end. Defaults to 4 */
  startChars?: number;
  endChars?: number;
  /** Show a clickable explorer link icon */
  showExplorer?: boolean;
  /** Tailwind classes added to the outer wrapper */
  className?: string;
  /** Font size class. Defaults to "text-sm" */
  textSize?: string;
  /** If true, shows full address (no truncation) */
  full?: boolean;
  /** Solana cluster for explorer links */
  cluster?: string;
}

/**
 * Displays a Solana address with truncation and a one-click copy button.
 * Optionally links to Solana Explorer.
 */
export function AddressDisplay({
  address,
  startChars = 4,
  endChars = 4,
  showExplorer = false,
  className = "",
  textSize = "text-sm",
  full = false,
  cluster = "devnet",
}: AddressDisplayProps) {
  const [copied, setCopied] = useState(false);

  const display = full
    ? address
    : truncateAddress(address, startChars, endChars);

  const handleCopy = async () => {
    const ok = await copyToClipboard(address);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (!address) {
    return <span className={`text-slate-500 ${textSize} ${className}`}>—</span>;
  }

  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <span
        className={`font-mono ${textSize} text-slate-300 break-all`}
        title={address}
      >
        {display}
      </span>

      {/* Copy button */}
      <button
        onClick={handleCopy}
        title={copied ? "Copied!" : "Copy address"}
        className="text-slate-500 hover:text-slate-300 transition-colors flex-shrink-0"
        aria-label="Copy address"
      >
        {copied ? (
          <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        ) : (
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
        )}
      </button>

      {/* Explorer link */}
      {showExplorer && (
        <a
          href={explorerAddressUrl(address, cluster)}
          target="_blank"
          rel="noopener noreferrer"
          title="View on Explorer"
          className="text-slate-500 hover:text-indigo-400 transition-colors flex-shrink-0"
          aria-label="View on Solana Explorer"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </a>
      )}
    </span>
  );
}
