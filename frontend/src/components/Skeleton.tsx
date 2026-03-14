import { motion } from "framer-motion";

export function SkeletonLine({ className = "" }: { className?: string }) {
  return (
    <div className={`bg-surface-3 rounded-lg animate-pulse ${className}`} />
  );
}

export function SkeletonCard() {
  return (
    <div className="glass-card p-5 space-y-3">
      <div className="flex items-center justify-between">
        <SkeletonLine className="h-3 w-20" />
        <SkeletonLine className="h-8 w-8 rounded-lg" />
      </div>
      <SkeletonLine className="h-7 w-28" />
    </div>
  );
}

export function SkeletonTable({ rows = 5 }: { rows?: number }) {
  return (
    <div className="glass-card overflow-hidden">
      <div className="px-5 py-4 border-b border-border/50 flex gap-12">
        <SkeletonLine className="h-3 w-16" />
        <SkeletonLine className="h-3 w-24" />
        <SkeletonLine className="h-3 w-20" />
        <SkeletonLine className="h-3 w-16" />
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="px-5 py-4 border-b border-border/30 flex gap-12 items-center">
          <SkeletonLine className="h-3 w-24" />
          <SkeletonLine className="h-3 w-32" />
          <SkeletonLine className="h-3 w-20" />
          <SkeletonLine className="h-5 w-16 rounded-full" />
        </div>
      ))}
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-6"
    >
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <SkeletonLine className="h-7 w-40" />
          <SkeletonLine className="h-4 w-56" />
        </div>
        <SkeletonLine className="h-10 w-24 rounded-xl" />
      </div>
      <div className="flex gap-3">
        <SkeletonLine className="h-7 w-16 rounded-full" />
        <SkeletonLine className="h-7 w-28 rounded-full" />
        <SkeletonLine className="h-7 w-24 rounded-full" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
      <div className="glass-card p-5 space-y-3">
        <SkeletonLine className="h-3 w-32" />
        <SkeletonLine className="h-2.5 w-full rounded-full" />
        <SkeletonLine className="h-3 w-48" />
      </div>
    </motion.div>
  );
}
