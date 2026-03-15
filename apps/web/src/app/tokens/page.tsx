import { Suspense } from "react";
import { Shell } from "@/components/layout/shell";
import { ShellSkeleton } from "@/components/layout/shell-skeleton";
import { TokenCreationClient } from "@/components/tokens/token-creation-client";

export default function TokensPage() {
  return (
    <Suspense fallback={<ShellSkeleton />}>
      <Shell>
        <Suspense fallback={<div className="h-64 bg-muted rounded-lg animate-pulse" />}>
          <TokenCreationClient />
        </Suspense>
      </Shell>
    </Suspense>
  );
}
