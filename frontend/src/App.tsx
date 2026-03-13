import { useState } from "react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import Dashboard from "./components/Dashboard";
import MintBurn from "./components/MintBurn";
import Compliance from "./components/Compliance";
import Roles from "./components/Roles";

type Tab = "dashboard" | "mintburn" | "roles" | "compliance";

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: "dashboard", label: "Dashboard", icon: "◉" },
    { id: "mintburn", label: "Mint / Burn", icon: "◎" },
    { id: "roles", label: "Roles", icon: "◇" },
    { id: "compliance", label: "Compliance", icon: "✕" },
  ];

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex">
      {/* Sidebar */}
      <aside className="w-64 border-r border-zinc-800/80 flex flex-col">
        <div className="p-6 border-b border-zinc-800/80">
          <h1 className="text-lg font-semibold tracking-tight text-amber-400/90">
            SSS Admin
          </h1>
          <p className="text-xs text-zinc-500 mt-1">Solana Stablecoin Standard</p>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all
                ${
                  activeTab === tab.id
                    ? "bg-amber-500/15 text-amber-400"
                    : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50"
                }`}
            >
              <span className="text-base opacity-80">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </nav>
        <div className="p-3 border-t border-zinc-800/80">
          <WalletMultiButton className="!w-full !h-10 !rounded-lg !bg-amber-500/20 hover:!bg-amber-500/30 !text-amber-400 !font-medium" />
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <header className="sticky top-0 z-10 border-b border-zinc-800/80 bg-zinc-950/80 backdrop-blur-sm px-8 py-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-zinc-100 capitalize">
              {tabs.find((t) => t.id === activeTab)?.label}
            </h2>
            <div className="flex items-center gap-4">
              <span className="text-xs text-zinc-500 bg-zinc-800/50 px-2 py-1 rounded">
                Devnet
              </span>
            </div>
          </div>
        </header>

        <div className="p-8">
          {activeTab === "dashboard" && <Dashboard />}
          {activeTab === "mintburn" && <MintBurn />}
          {activeTab === "roles" && <Roles />}
          {activeTab === "compliance" && <Compliance />}
        </div>
      </main>
    </div>
  );
}
