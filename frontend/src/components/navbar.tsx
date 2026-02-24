"use client";

import dynamic from "next/dynamic";

const WalletMultiButton = dynamic(
  () =>
    import("@solana/wallet-adapter-react-ui").then(
      (mod) => mod.WalletMultiButton,
    ),
  { ssr: false },
);

export function Navbar({ title }: { title: string }) {
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-background/80 px-6 backdrop-blur-sm">
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      <WalletMultiButton
        style={{
          backgroundColor: "#6d28d9",
          height: "40px",
          borderRadius: "8px",
          fontSize: "14px",
        }}
      />
    </header>
  );
}
