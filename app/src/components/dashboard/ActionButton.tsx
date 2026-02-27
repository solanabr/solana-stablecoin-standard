"use client";

import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

interface ActionButtonProps {
  icon: ReactNode;
  label: string;
  desc: string;
  danger?: boolean;
  onClick?: () => void;
  disabled?: boolean;
}

export default function ActionButton({
  icon,
  label,
  desc,
  danger,
  onClick,
  disabled,
}: ActionButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`hover-trigger group w-full flex items-center gap-5 p-5 rounded-xl border transition-all duration-300 disabled:opacity-30 disabled:pointer-events-none ${
        danger
          ? "border-[#FF3366]/20 bg-[#FF3366]/5 hover:bg-[#FF3366] hover:border-[#FF3366]"
          : "border-[#2a2a2a] bg-[#0A0A0A] hover:bg-[#D4FF00] hover:border-[#D4FF00]"
      }`}
    >
      <div
        className={`w-11 h-11 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
          danger
            ? "border-[#FF3366]/40 text-[#FF3366] group-hover:border-white group-hover:text-white"
            : "border-[#D4FF00]/30 text-[#D4FF00] group-hover:border-[#030303] group-hover:text-[#030303]"
        }`}
      >
        {icon}
      </div>
      <div className="flex-1 text-left min-w-0">
        <div
          className={`text-sm font-semibold uppercase tracking-wider mb-0.5 transition-colors ${
            danger
              ? "text-white group-hover:text-white"
              : "text-white group-hover:text-[#030303]"
          }`}
          style={{ fontFamily: "var(--font-space-grotesk)" }}
        >
          {label}
        </div>
        <div
          className={`text-[11px] transition-colors truncate ${
            danger
              ? "text-[#FF3366]/70 group-hover:text-white/80"
              : "text-[#666] group-hover:text-[#030303]/60"
          }`}
          style={{ fontFamily: "var(--font-jetbrains-mono)" }}
        >
          {desc}
        </div>
      </div>
      <ChevronRight
        size={16}
        className={`shrink-0 opacity-0 group-hover:opacity-100 transition-all ${
          danger ? "text-white" : "text-[#030303]"
        }`}
      />
    </button>
  );
}
