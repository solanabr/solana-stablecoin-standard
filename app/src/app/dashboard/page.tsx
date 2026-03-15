"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import LoginScreen from "@/components/dashboard/LoginScreen";
import DashboardScreen from "@/components/dashboard/DashboardScreen";
import { useDashboardCursor } from "@/hooks/useDashboardCursor";

export default function DashboardPage() {
  const { connected } = useWallet();
  const cursorRef = useDashboardCursor();

  return (
    <div className="dashboard-wrapper dashboard-cursor-scope">
      {connected ? <DashboardScreen /> : <LoginScreen />}
      <div ref={cursorRef} className="award-cursor" />
    </div>
  );
}
