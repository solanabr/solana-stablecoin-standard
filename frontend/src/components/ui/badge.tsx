"use client";

interface BadgeProps {
  variant: "success" | "danger" | "warning" | "info" | "neutral";
  children: React.ReactNode;
  className?: string;
}

const variantStyles: Record<
  BadgeProps["variant"],
  { bg: string; text: string; border: string }
> = {
  success: {
    bg: "var(--success-muted)",
    text: "var(--success)",
    border: "rgba(34, 197, 94, 0.25)",
  },
  danger: {
    bg: "var(--danger-muted)",
    text: "var(--danger)",
    border: "rgba(239, 68, 68, 0.25)",
  },
  warning: {
    bg: "var(--warning-muted)",
    text: "var(--warning)",
    border: "rgba(245, 158, 11, 0.25)",
  },
  info: {
    bg: "var(--info-muted)",
    text: "var(--info)",
    border: "rgba(6, 182, 212, 0.25)",
  },
  neutral: {
    bg: "rgba(136, 136, 160, 0.1)",
    text: "var(--text-secondary)",
    border: "rgba(136, 136, 160, 0.2)",
  },
};

export function Badge({ variant, children, className = "" }: BadgeProps) {
  const styles = variantStyles[variant];

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium ${className}`}
      style={{
        backgroundColor: styles.bg,
        color: styles.text,
        border: `1px solid ${styles.border}`,
      }}
    >
      {children}
    </span>
  );
}
