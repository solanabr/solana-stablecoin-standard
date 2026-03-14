import type { ButtonHTMLAttributes, ReactNode } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'danger' | 'outline';
  isLoading?: boolean;
}

export function Button({
  children,
  variant = 'primary',
  isLoading = false,
  className = '',
  disabled,
  ...props
}: ButtonProps) {
  const base =
    'relative inline-flex items-center justify-center rounded-xl px-5 py-2.5 text-sm font-medium transition-all duration-300 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50';
  const variants = {
    primary:
      'border border-emerald-300/50 bg-gradient-to-b from-emerald-400 to-emerald-600 text-white shadow-[0_0_20px_rgba(16,185,129,0.28)] hover:brightness-110',
    secondary:
      'border border-white/10 bg-white/5 text-zinc-100 hover:border-white/20 hover:bg-white/10',
    danger:
      'border border-red-400/40 bg-gradient-to-b from-red-500/80 to-red-700/80 text-white hover:brightness-110',
    outline:
      'border border-emerald-500/40 bg-transparent text-emerald-300 hover:bg-emerald-500/10',
  };

  return (
    <button
      className={`${base} ${variants[variant]} ${className}`}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? (
        <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
      ) : null}
      {children}
    </button>
  );
}
