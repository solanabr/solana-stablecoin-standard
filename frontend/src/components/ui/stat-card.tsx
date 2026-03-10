"use client";

import type { ReactNode } from "react";

interface StatCardProps {
  label: string;
  value: string;
  icon: ReactNode;
  color?: "accent" | "success" | "danger" | "warning" | "info";
}

const colorMap = {
  accent: {
    iconBg: "var(--accent-muted)",
    iconColor: "var(--accent)",
  },
  success: {
    iconBg: "var(--success-muted)",
    iconColor: "var(--success)",
  },
  danger: {
    iconBg: "var(--danger-muted)",
    iconColor: "var(--danger)",
  },
  warning: {
    iconBg: "var(--warning-muted)",
    iconColor: "var(--warning)",
  },
  info: {
    iconBg: "var(--info-muted)",
    iconColor: "var(--info)",
  },
};

export function StatCard({ label, value, icon, color = "accent" }: StatCardProps) {
  const colors = colorMap[color];

  return (
    <div className="rounded-xl bg-[var(--bg-card)] border border-[var(--border)] p-5">
      <div className="flex items-center gap-2.5 mb-3">
        <div
          className="flex items-center justify-center w-8 h-8 rounded-lg"
          style={{ backgroundColor: colors.iconBg }}
        >
          <span style={{ color: colors.iconColor }}>{icon}</span>
        </div>
        <span className="text-sm text-[var(--text-secondary)]">{label}</span>
      </div>
      <div className="text-2xl font-[family-name:var(--font-jetbrains)] font-semibold text-[var(--text-primary)] tabular-nums">
        {value}
      </div>
    </div>
  );
}
