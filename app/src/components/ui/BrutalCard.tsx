import { ReactNode } from "react";

interface BrutalCardProps {
  title?: string;
  children: ReactNode;
  className?: string;
  headerAction?: ReactNode;
}

export default function BrutalCard({
  title,
  children,
  className = "",
  headerAction,
}: BrutalCardProps) {
  return (
    <div
      className={`border-[3px] border-[#0A0A0A] bg-[#EBE9E1] shadow-[10px_10px_0px_#0A0A0A] ${className}`}
    >
      {title && (
        <div className="border-b-[3px] border-[#0A0A0A] p-4 flex justify-between items-center bg-[#0A0A0A] text-[#EBE9E1]">
          <h3 className="font-display font-bold uppercase tracking-widest">
            {title}
          </h3>
          {headerAction && <div>{headerAction}</div>}
        </div>
      )}
      <div className="p-6">{children}</div>
    </div>
  );
}
