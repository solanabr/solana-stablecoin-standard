"use client";

import { useState, useEffect } from "react";

export default function Navigation() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  const scrollTo = (id: string) => {
    setOpen(false);
    if (id === "__dashboard__") {
      window.location.href = "/dashboard";
      return;
    }
    setTimeout(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
    }, 400);
  };

  const links = [
    { label: "Overview", id: "hero" },
    { label: "Architecture", id: "layers" },
    { label: "Presets", id: "presets" },
    { label: "Get Started", id: "deploy" },
    { label: "Dashboard", id: "__dashboard__" },
  ];

  const consoleLinks = [
    { label: "Allowlist", href: "/allowlist" },
    { label: "Authority", href: "/authority" },
    { label: "Metadata", href: "/metadata" },
    { label: "Transfer", href: "/transfer" },
    { label: "Audit", href: "/audit" },
  ];

  const externalLinks = [
    { label: "Github", href: "https://github.com/solanabr/solana-stablecoin-standard" },
    { label: "Documentation", href: "https://docs.stablecoinstandard.dev" },
  ];

  return (
    <>
      <nav className="fixed top-0 left-0 w-full p-6 flex justify-between items-center z-50 mix-blend-difference text-[#EBE9E1]">
        <div className="font-display font-bold text-2xl tracking-tighter hover-target">
          SSS.
        </div>
        <div className="font-mono text-sm uppercase tracking-widest hidden md:block">
          Solana Open Source
        </div>
        <button
          onClick={() => setOpen(!open)}
          className="font-display font-bold uppercase hover-target border-b-2 border-transparent hover:border-[#EBE9E1] transition-colors"
        >
          {open ? "Close" : "Menu"}
        </button>
      </nav>

      {/* Fullscreen overlay */}
      <div
        className="fixed inset-0 z-40 bg-ink text-paper flex flex-col justify-between p-8 md:p-16 transition-transform duration-700"
        style={{
          transform: open ? "translateY(0)" : "translateY(-100%)",
          transitionTimingFunction: "cubic-bezier(0.76, 0, 0.24, 1)",
        }}
      >
        <div className="mt-24" />

        <div className="flex flex-col md:flex-row justify-between gap-16">
          <div className="flex-1">
            <div className="font-mono text-sm uppercase tracking-widest text-accent mb-8">
              Navigation
            </div>
            <ul className="space-y-2">
              {links.map((link) => (
                <li key={link.id}>
                  <button
                    onClick={() => scrollTo(link.id)}
                    className="font-display text-5xl md:text-7xl font-bold uppercase leading-tight hover:text-accent transition-colors hover-target"
                  >
                    {link.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div className="md:w-72 space-y-10">
            <div>
              <div className="font-mono text-sm uppercase tracking-widest text-accent mb-6">
                Console
              </div>
              <ul className="space-y-3">
                {consoleLinks.map((link) => (
                  <li key={link.label}>
                    <a
                      href={link.href}
                      onClick={(e) => { e.preventDefault(); setOpen(false); window.location.href = link.href; }}
                      className="font-mono text-lg uppercase tracking-wide hover:text-accent transition-colors hover-target border-b border-paper/20 pb-2 block"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <div className="font-mono text-sm uppercase tracking-widest text-accent mb-6">
                Links
              </div>
              <ul className="space-y-3">
                {externalLinks.map((link) => (
                  <li key={link.label}>
                    <a
                      href={link.href}
                      className="font-mono text-lg uppercase tracking-wide hover:text-accent transition-colors hover-target border-b border-paper/20 pb-2 block"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        <div className="font-mono text-xs uppercase text-paper/40">
          Solana Stablecoin Standard &mdash; Built to be forked.
        </div>
      </div>
    </>
  );
}
