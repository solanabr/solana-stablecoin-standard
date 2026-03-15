"use client";

interface MetricBlockProps {
  label: string;
  value: string;
  subtext?: string;
  highlight?: boolean;
  large?: boolean;
}

export default function MetricBlock({
  label,
  value,
  subtext,
  highlight,
  large,
}: MetricBlockProps) {
  return (
    <div className="dark-card mb-4">
      <div
        className="text-[#666] text-[11px] uppercase tracking-[0.2em] mb-3"
        style={{ fontFamily: "var(--font-jetbrains-mono)" }}
      >
        {label}
      </div>
      <div
        className={`data-glitch font-bold tracking-tight leading-none ${
          large ? "text-4xl md:text-6xl" : "text-2xl md:text-3xl"
        } ${highlight ? "text-[#D4FF00]" : "text-white"}`}
        style={{ fontFamily: "var(--font-space-grotesk)" }}
      >
        {value}
      </div>
      {subtext && (
        <div
          className="text-[#555] text-[12px] mt-2"
          style={{ fontFamily: "var(--font-jetbrains-mono)" }}
        >
          {subtext}
        </div>
      )}
    </div>
  );
}
