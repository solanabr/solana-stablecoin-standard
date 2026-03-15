import Link from "next/link";
import { ClipboardList, LayoutGrid, ListChecks, ScrollText } from "lucide-react";
import { env } from "@/lib/env";
import { cn } from "@/lib/utils";

interface AppShellProps {
  title: string;
  description: string;
  children: React.ReactNode;
  activePath: "/" | "/events" | "/requests" | "/operations";
}

const navItems = [
  {
    href: "/" as const,
    label: "Dashboard",
    icon: LayoutGrid,
  },
  {
    href: "/events" as const,
    label: "Events",
    icon: ScrollText,
  },
  {
    href: "/requests" as const,
    label: "Requests",
    icon: ClipboardList,
  },
  {
    href: "/operations" as const,
    label: "Operations",
    icon: ListChecks,
  },
];

export function AppShell({ title, description, children, activePath }: AppShellProps) {
  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-6 py-4">
          <div>
            <p className="text-sm font-medium text-muted-foreground">Solana Stablecoin Standard</p>
            <h1 className="text-xl font-semibold">{title}</h1>
            <p className="text-sm text-muted-foreground">{description}</p>
          </div>
          <div className="text-right text-sm text-muted-foreground">
            <div>Cluster: {env.solanaCluster}</div>
            <div>API: {env.apiLabel}</div>
          </div>
        </div>
      </header>
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-6 py-6">
        <nav className="flex gap-2">
          {navItems.map((item) => {
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition-colors",
                  activePath === item.href
                    ? "border-primary bg-primary text-primary-foreground"
                    : "bg-background hover:bg-accent",
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        {children}
      </div>
    </div>
  );
}
