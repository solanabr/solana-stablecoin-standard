import React, { useState } from "react";
import { Header } from "./Header";
import { Sidebar } from "./Sidebar";
import { TransactionToastContainer } from "../shared/TransactionToast";

interface LayoutProps {
  children: React.ReactNode;
}

/**
 * Root layout: sticky header, collapsible sidebar, scrollable content area.
 * The sidebar is always visible on lg+ screens; on smaller screens it slides
 * in/out via the hamburger button in the Header.
 */
export function Layout({ children }: LayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen flex flex-col">
      {/* Sticky top header */}
      <Header onMenuToggle={() => setSidebarOpen((o) => !o)} />

      {/* Body: sidebar + content */}
      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />

        {/* Main content */}
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 animate-fade-in">
            {children}
          </div>
        </main>
      </div>

      {/* Global toast notifications */}
      <TransactionToastContainer />
    </div>
  );
}
