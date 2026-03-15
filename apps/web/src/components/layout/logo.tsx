export function Logo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
    >
      {/* Peg mark: coin with horizontal bar — stable, pegged value */}
      <circle cx="16" cy="16" r="10" stroke="currentColor" strokeWidth="2" fill="none" />
      <rect x="6" y="14" width="20" height="4" rx="2" fill="currentColor" />
    </svg>
  );
}
