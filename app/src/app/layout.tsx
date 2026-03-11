import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "S\u00b3 Dashboard",
  description: "S\u00b3 \u2014 Solana Stablecoin Standard Dashboard",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#0f172a", color: "#e2e8f0" }}>
        {children}
      </body>
    </html>
  );
}
