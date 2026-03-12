import { Space_Grotesk, JetBrains_Mono } from "next/font/google";
import "../dashboard/dashboard.css";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

export default function AllowlistLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      className={`${spaceGrotesk.variable} ${jetbrainsMono.variable} bg-[#030303] min-h-screen`}
      style={{ fontFamily: "var(--font-space-grotesk), sans-serif" }}
    >
      {children}
    </div>
  );
}
