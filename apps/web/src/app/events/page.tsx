import { Suspense } from "react";
import { DashboardPageClient } from "@/components/dashboard/dashboard-page-client";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <DashboardPageClient
        activePath="/events"
        title="Events"
        description="Dedicated event explorer for indexed mint activity."
      />
    </Suspense>
  );
}
