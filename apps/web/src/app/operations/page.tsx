import { Suspense } from "react";
import { Shell } from "@/components/layout/shell";
import { ShellSkeleton } from "@/components/layout/shell-skeleton";
import { OperationsClient } from "@/components/operations/operations-client";

export default function Page() {
  return (
    <Suspense fallback={<ShellSkeleton />}>
      <Shell>
        <Suspense fallback={<OperationsSkeleton />}>
          <OperationsClient />
        </Suspense>
      </Shell>
    </Suspense>
  );
}

function OperationsSkeleton() {
  return (
    <div className="space-y-6">
      <div className="h-64 bg-muted rounded-lg animate-pulse" />
      <div className="h-48 bg-muted rounded-lg animate-pulse" />
    </div>
  );
}
