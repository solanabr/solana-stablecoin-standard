import React from "react";

interface LoadingSpinnerProps {
  /** Size in pixels. Defaults to 24. */
  size?: number;
  /** Tailwind color class for the spinner track. Defaults to "border-indigo-500". */
  color?: string;
  /** Optional accessible label */
  label?: string;
  /** Center horizontally and vertically inside a flex container */
  centered?: boolean;
}

export function LoadingSpinner({
  size = 24,
  color = "border-indigo-500",
  label = "Loading…",
  centered = false,
}: LoadingSpinnerProps) {
  const spinner = (
    <span
      role="status"
      aria-label={label}
      className={`inline-block rounded-full border-2 border-t-transparent animate-spin ${color}`}
      style={{ width: size, height: size, flexShrink: 0 }}
    />
  );

  if (centered) {
    return (
      <div className="flex items-center justify-center w-full h-full min-h-[120px]">
        {spinner}
      </div>
    );
  }

  return spinner;
}

/** Full-page loading overlay */
export function PageLoader({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#0f1224]/80 backdrop-blur-sm">
      <LoadingSpinner size={40} />
      <p className="mt-4 text-sm text-slate-400">{label}</p>
    </div>
  );
}
