import { CircleHelp } from 'lucide-react';
import type { InputHTMLAttributes } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  helper?: string;
  info?: string;
}

export function Input({ label, helper, info, className = '', ...props }: InputProps) {
  return (
    <label className="block w-full">
      {label ? (
        <span className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-zinc-300">
          <span>{label}</span>
          {info ? (
            <span
              className="inline-flex text-zinc-500 transition-colors hover:text-emerald-300"
              title={info}
              aria-label={info}
            >
              <CircleHelp className="h-3.5 w-3.5" />
            </span>
          ) : null}
        </span>
      ) : null}
      <input
        className={`w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 font-mono text-sm text-zinc-100 shadow-[inset_0_2px_4px_rgba(0,0,0,0.22)] transition-all placeholder:text-zinc-500 focus:border-emerald-400/60 focus:outline-none focus:ring-1 focus:ring-emerald-400/60 ${className}`}
        {...props}
      />
      {helper ? <span className="mt-2 block text-xs text-zinc-500">{helper}</span> : null}
    </label>
  );
}
