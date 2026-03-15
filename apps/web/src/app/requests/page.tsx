import { Suspense } from "react";
import { RequestsPageClient } from "@/components/dashboard/requests-page-client";

export default function RequestsPage() {
  return (
    <Suspense fallback={null}>
      <RequestsPageClient />
    </Suspense>
  );
}
