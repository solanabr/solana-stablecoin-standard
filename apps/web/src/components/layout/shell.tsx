"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useEffect, useTransition, useState } from "react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search } from "lucide-react";
import { normalizeMint } from "@/lib/mint";
import { Logo } from "@/components/layout/logo";

const tabRoutes = [
  { href: "/", label: "Dashboard", value: "/" },
  { href: "/events", label: "Events", value: "/events" },
  { href: "/operations", label: "Operations", value: "/operations" },
  { href: "/tokens", label: "Token creation", value: "/tokens" },
] as const;

export function Shell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const mintFromUrl = searchParams.get("mint") ?? "";
  const [mintInput, setMintInput] = useState(mintFromUrl);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setMintInput(mintFromUrl);
  }, [mintFromUrl]);

  function onMintSubmit(e: React.FormEvent) {
    e.preventDefault();
    const mint = normalizeMint(mintInput);
    const next = new URLSearchParams(searchParams);
    if (mint) next.set("mint", mint);
    else next.delete("mint");
    startTransition(() => router.replace(`${pathname}${next.toString() ? `?${next}` : ""}`));
  }

  const tabValue = tabRoutes.find((t) => t.href === pathname)?.value ?? "/";

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex items-center justify-between max-w-6xl mx-auto px-4 py-3">
          <Link
            href={mintFromUrl ? `/?mint=${encodeURIComponent(mintFromUrl)}` : "/"}
            className="flex items-center gap-2.5 shrink-0"
          >
            <Logo className="h-8 w-8 text-primary" />
            <span className="text-lg font-semibold tracking-tight">Stablecoin dashboard</span>
          </Link>
          {mounted ? (
            <WalletMultiButton className="!h-9 !rounded-md" />
          ) : (
            <div className="h-9 w-[140px] rounded-md bg-muted animate-pulse" aria-hidden />
          )}
        </div>
      </header>

      <div className="border-b border-border bg-muted/50">
        <div className="flex items-center justify-between gap-6 max-w-6xl mx-auto px-4 py-3">
          <Tabs value={tabValue} className="shrink-0">
            <TabsList className="h-9">
              {tabRoutes.map((tab) => (
                <TabsTrigger key={tab.href} value={tab.value} asChild>
                  <Link
                    href={
                      mintFromUrl
                        ? `${tab.href}?mint=${encodeURIComponent(mintFromUrl)}`
                        : tab.href
                    }
                  >
                    {tab.label}
                  </Link>
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          <form
            onSubmit={onMintSubmit}
            className="flex items-center gap-2 min-w-0 flex-1 max-w-sm justify-end"
          >
            <Input
              value={mintInput}
              onChange={(e) => setMintInput(e.target.value)}
              placeholder="Mint address"
              className="h-9"
            />
            <Button type="submit" size="sm" variant="secondary" className="h-9 shrink-0" aria-label="Load mint">
              <Search className="h-4 w-4" />
            </Button>
          </form>
        </div>
      </div>

      <main className="flex-1 p-6 max-w-6xl w-full mx-auto">{children}</main>
    </div>
  );
}
