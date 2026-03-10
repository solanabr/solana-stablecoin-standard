"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { ConnectScreen } from "@/components/connect-screen";
import { Dashboard } from "@/components/dashboard";

export default function Home() {
  const { connected } = useWallet();

  return connected ? <Dashboard /> : <ConnectScreen />;
}
