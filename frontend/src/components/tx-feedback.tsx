"use client";

export function TxFeedback({
  loading,
  error,
  signature,
}: {
  loading: boolean;
  error: string | null;
  signature: string | null;
}) {
  if (loading) {
    return (
      <div className="mt-3 flex items-center gap-2 rounded-lg bg-muted p-3">
        <svg className="h-4 w-4 animate-spin text-muted-foreground" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        <span className="text-sm text-muted-foreground">Sending transaction...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mt-3 rounded-lg bg-destructive/10 p-3">
        <p className="text-sm font-medium text-destructive">Transaction failed</p>
        <p className="mt-0.5 text-xs text-destructive/80 break-all">{error}</p>
      </div>
    );
  }

  if (signature) {
    return (
      <div className="mt-3 rounded-lg bg-success/10 p-3">
        <p className="text-sm font-medium text-success">Transaction confirmed</p>
        <p className="mt-0.5 text-xs text-success/80 font-mono">
          {signature.slice(0, 20)}...{signature.slice(-8)}
        </p>
      </div>
    );
  }

  return null;
}
