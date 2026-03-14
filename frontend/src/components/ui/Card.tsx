import type { ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  className?: string;
  title?: string;
  icon?: ReactNode;
}

export function Card({ children, className = '', title, icon }: CardProps) {
  return (
    <section
      className={`relative overflow-hidden rounded-2xl border border-white/10 bg-black/40 shadow-[0_8px_32px_rgba(0,0,0,0.35)] backdrop-blur-2xl ${className}`}
    >
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/5 to-transparent" />
      {title ? (
        <div className="relative z-10 flex items-center gap-3 border-b border-white/5 bg-white/[0.02] px-6 py-5">
          {icon ? <span className="text-emerald-400">{icon}</span> : null}
          <h3 className="text-sm font-semibold tracking-wide text-zinc-100">{title}</h3>
        </div>
      ) : null}
      <div className="relative z-10 p-6">{children}</div>
    </section>
  );
}
