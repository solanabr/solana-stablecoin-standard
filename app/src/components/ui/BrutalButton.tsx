import { ButtonHTMLAttributes, ReactNode } from "react";

interface BrutalButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  variant?: "primary" | "secondary" | "danger";
}

export default function BrutalButton({
  children,
  variant = "primary",
  className = "",
  ...props
}: BrutalButtonProps) {
  const base =
    "font-display font-bold uppercase border-2 border-[#0A0A0A] px-6 py-3 transition-all relative overflow-hidden tracking-wider cursor-none";
  const variants = {
    primary:
      "bg-[#0A0A0A] text-[#EBE9E1] hover:bg-[#FF3E00] hover:text-[#EBE9E1] hover:border-[#FF3E00] shadow-[6px_6px_0px_#FF3E00]",
    secondary:
      "bg-[#EBE9E1] text-[#0A0A0A] hover:bg-[#0044FF] hover:text-[#EBE9E1] shadow-[6px_6px_0px_#0A0A0A]",
    danger:
      "bg-[#FF3E00] text-[#EBE9E1] border-[#FF3E00] hover:bg-[#0A0A0A] hover:border-[#0A0A0A] shadow-[6px_6px_0px_#0A0A0A]",
  };

  return (
    <button
      className={`${base} ${variants[variant]} ${className} active:translate-x-[3px] active:translate-y-[3px] active:shadow-none hover-target`}
      {...props}
    >
      {children}
    </button>
  );
}
