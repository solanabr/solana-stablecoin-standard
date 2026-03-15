"use client";

import { useEffect, useRef } from "react";

interface HeroProps {
  animationsReady: boolean;
}

export default function Hero({ animationsReady }: HeroProps) {
  const revealRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!animationsReady || !revealRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("in-view");
            const lines = entry.target.querySelectorAll(".line");
            lines.forEach((line, index) => {
              (line as HTMLElement).style.transitionDelay = `${index * 150}ms`;
            });
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.2 }
    );

    observer.observe(revealRef.current);

    return () => observer.disconnect();
  }, [animationsReady]);

  return (
    <section id="hero" className="min-h-screen flex flex-col justify-end p-6 pb-24 relative">
      <div
        ref={revealRef}
        className="absolute top-1/4 right-10 w-64 md:w-96 text-sm font-mono leading-relaxed reveal-text"
      >
        <div className="line">Opinionated architecture for</div>
        <div className="line">institutional stablecoins.</div>
        <div className="line">Built to be forked.</div>
      </div>

      <h1 className="text-huge font-display font-bold uppercase text-ink hover-target">
        <span className="block hover:text-accent transition-colors duration-500">
          Stable
        </span>
        <span className="block ml-[10vw] hover:text-blue transition-colors duration-500">
          Standard
        </span>
      </h1>

      <div className="flex justify-between items-end mt-12 border-t-2 border-ink pt-6">
        <a
          href="/dashboard"
          className="brutal-btn bg-ink text-paper px-8 py-4 font-display font-bold uppercase tracking-wider text-xl hover-target"
        >
          Launch App
        </a>
        <div className="font-mono text-xs uppercase text-right max-w-xs">
          A modular SDK where issuers choose Token-2022 extensions and
          compliance modules.
        </div>
      </div>
    </section>
  );
}
