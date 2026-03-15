export function ShellSkeleton() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-border px-4 py-3">
        <div className="flex items-center gap-2.5 max-w-6xl mx-auto">
          <div className="h-8 w-8 bg-muted rounded animate-pulse" />
          <div className="h-6 w-44 bg-muted rounded animate-pulse" />
        </div>
      </header>
      <div className="border-b border-border bg-muted/30 px-4 py-3">
        <div className="flex items-center justify-between gap-6 max-w-6xl mx-auto">
          <div className="h-9 w-64 bg-muted rounded animate-pulse" />
          <div className="h-9 w-48 bg-muted rounded animate-pulse" />
        </div>
      </div>
      <main className="flex-1 p-4 max-w-6xl w-full mx-auto">
        <div className="h-64 bg-muted rounded-lg animate-pulse" />
      </main>
    </div>
  );
}
