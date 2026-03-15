import { Suspense } from "react";
import { Shell } from "@/components/layout/shell";
import { ShellSkeleton } from "@/components/layout/shell-skeleton";
import { DashboardClient } from "@/components/dashboard/dashboard-client";

export default function Page() {
  return (
    <Suspense fallback={<ShellSkeleton />}>
      <Shell>
        <Suspense fallback={<DashboardSkeleton />}>
          <DashboardClient />
        </Suspense>
      </Shell>
    </Suspense>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="h-8 w-48 bg-muted rounded animate-pulse" />
      <div className="grid gap-4 md:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-24 bg-muted rounded-lg animate-pulse" />
        ))}
      </div>
      <div className="h-64 bg-muted rounded-lg animate-pulse" />
    </div>
  );
}
