import React from "react";

export function TxResult({ error, txSig }: { error: string | null; txSig: string | null }) {
  if (!error && !txSig) return null;
  return (
    <div
      className={`text-xs rounded-lg px-3 py-2 mt-2 ${
        error
          ? "bg-red-900/40 text-red-300 border border-red-700/40"
          : "bg-emerald-900/40 text-emerald-300 border border-emerald-700/40"
      }`}
    >
      {error ? (
        <span>Error: {error}</span>
      ) : (
        <span>
          Success!{" "}
          <a
            href={`https://explorer.solana.com/tx/${txSig}?cluster=devnet`}
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            View tx →
          </a>
        </span>
      )}
    </div>
  );
}
