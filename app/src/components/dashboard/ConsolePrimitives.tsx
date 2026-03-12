"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Zap } from "lucide-react";

const displayStyle = { fontFamily: "var(--font-space-grotesk)" } as const;
const monoStyle = { fontFamily: "var(--font-jetbrains-mono)" } as const;

export function SectionLabel({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`text-[#666] text-[11px] uppercase tracking-[0.25em] ${className}`}
      style={monoStyle}
    >
      {children}
    </div>
  );
}

export function FieldLabel({
  children,
  htmlFor,
}: {
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className="mb-2 block text-[11px] uppercase tracking-[0.15em] text-[#666]"
      style={monoStyle}
    >
      {children}
    </label>
  );
}

export function PageIntro({
  eyebrow,
  title,
  description,
  className = "",
}: {
  eyebrow: string;
  title: string;
  description: string;
  className?: string;
}) {
  return (
    <div className={`dark-card ${className}`}>
      <div className="mb-4 flex items-center gap-2">
        <Zap size={14} className="text-[#D4FF00]" />
        <span
          className="text-[11px] uppercase tracking-[0.3em] text-[#D4FF00]"
          style={monoStyle}
        >
          {eyebrow}
        </span>
      </div>
      <h1
        className="max-w-4xl text-3xl font-bold uppercase tracking-tight text-white md:text-5xl"
        style={displayStyle}
      >
        {title}
      </h1>
      <p className="mt-4 max-w-3xl text-sm leading-relaxed text-[#777]" style={monoStyle}>
        {description}
      </p>
    </div>
  );
}

export function MetricCard({
  label,
  value,
  hint,
  accent = "#D4FF00",
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  accent?: string;
}) {
  return (
    <div className="dark-card h-full">
      <div className="text-[11px] uppercase tracking-[0.2em]" style={{ ...monoStyle, color: accent }}>
        {label}
      </div>
      <div
        className="mt-4 break-words text-xl font-semibold uppercase tracking-tight text-white md:text-2xl"
        style={displayStyle}
      >
        {value}
      </div>
      {hint ? (
        <div className="mt-3 text-[11px] leading-relaxed text-[#555]" style={monoStyle}>
          {hint}
        </div>
      ) : null}
    </div>
  );
}

export function StatusBanner({
  message,
  tone = "success",
  children,
}: {
  message: string;
  tone?: "success" | "error";
  children?: ReactNode;
}) {
  return (
    <div className={`status-banner ${tone === "error" ? "error" : "success"}`} style={monoStyle}>
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <span>{message}</span>
        {children ? <div className="shrink-0">{children}</div> : null}
      </div>
    </div>
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  className?: string;
  danger?: boolean;
};

export function PrimaryButton({
  children,
  className = "",
  danger = false,
  ...props
}: ButtonProps) {
  const palette = danger
    ? "bg-[#FF3366] text-white hover:brightness-110"
    : "bg-[#D4FF00] text-[#030303] hover:shadow-[0_0_30px_rgba(212,255,0,0.14)]";

  return (
    <button
      {...props}
      className={`hover-trigger inline-flex items-center justify-center gap-2 rounded-lg px-4 py-3.5 text-sm font-semibold uppercase tracking-[0.25em] transition-all disabled:cursor-not-allowed disabled:opacity-30 ${palette} ${className}`}
      style={displayStyle}
    >
      {children}
    </button>
  );
}

export function SecondaryButton({
  children,
  className = "",
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      className={`hover-trigger inline-flex items-center justify-center gap-2 rounded-lg border border-[#2a2a2a] px-4 py-3.5 text-sm font-semibold uppercase tracking-[0.25em] text-[#999] transition-colors hover:border-[#D4FF00] hover:text-[#D4FF00] disabled:cursor-not-allowed disabled:opacity-30 ${className}`}
      style={displayStyle}
    >
      {children}
    </button>
  );
}
