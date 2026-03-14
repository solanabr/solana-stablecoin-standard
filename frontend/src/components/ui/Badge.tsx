import type { ReactNode } from 'react';

interface BadgeProps {
  children: ReactNode;
  variant?: 'success' | 'warning' | 'error' | 'neutral';
}

export function Badge({ children, variant = 'neutral' }: BadgeProps) {
  const variants = {
    success: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
    warning: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
    error: 'border-red-500/30 bg-red-500/10 text-red-300',
    neutral: 'border-white/10 bg-white/5 text-zinc-300',
  };

  return (
    <span
      className={`inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold tracking-wide ${variants[variant]}`}
    >
      {children}
    </span>
  );
}
