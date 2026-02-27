"use client";

import { useEffect, useRef } from "react";

interface StackingCardsProps {
  animationsReady: boolean;
}

export default function StackingCards({ animationsReady }: StackingCardsProps) {
  const revealRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!animationsReady) return;

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

    const targets = document.querySelectorAll(".reveal-text");
    targets.forEach((el) => observer.observe(el));

    return () => observer.disconnect();
  }, [animationsReady]);

  return (
    <section id="layers" className="py-32 px-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-24 reveal-text" ref={revealRef}>
          <h2 className="font-display text-6xl md:text-8xl font-bold uppercase leading-none mb-6">
            <div className="line">Architecture</div>
          </h2>
          <p className="font-mono text-xl max-w-2xl border-l-4 border-accent pl-6">
            <span className="line block">
              Three distinct layers of abstraction. From base token mechanics to
              fully opinionated compliance presets.
            </span>
          </p>
        </div>

        <div className="stack-area">
          {/* Card 1 — Foundation */}
          <div
            className="stack-card bg-paper p-8 md:p-16 flex flex-col justify-between"
            style={{ zIndex: 10 }}
          >
            <div className="flex justify-between items-start">
              <span className="font-mono text-6xl text-ink">01</span>
              <span className="px-4 py-1 border-2 border-ink rounded-full font-mono text-sm uppercase">
                Base SDK
              </span>
            </div>
            <div>
              <h3 className="font-display text-5xl md:text-7xl font-bold uppercase mb-4">
                Foundation
              </h3>
              <p className="font-sans text-lg max-w-xl mb-8">
                Token creation with mint authority, freeze authority, and
                metadata. Issuers choose which extensions to enable via our
                unified Role Management program.
              </p>
              <div className="flex gap-4 font-mono text-sm">
                <span className="bg-ink text-paper px-3 py-1">Mint/Freeze</span>
                <span className="bg-ink text-paper px-3 py-1">Role Admin</span>
              </div>
            </div>
          </div>

          {/* Card 2 — Capabilities */}
          <div
            className="stack-card bg-accent p-8 md:p-16 flex flex-col justify-between"
            style={{
              zIndex: 20,
              marginTop: "5vh",
              color: "#EBE9E1",
              borderColor: "#0A0A0A",
            }}
          >
            <div className="flex justify-between items-start">
              <span className="font-mono text-6xl text-[#0A0A0A]">02</span>
              <span className="px-4 py-1 border-2 border-[#0A0A0A] rounded-full font-mono text-sm uppercase text-[#0A0A0A]">
                Modules
              </span>
            </div>
            <div>
              <h3 className="font-display text-5xl md:text-7xl font-bold uppercase mb-4 text-[#0A0A0A]">
                Capabilities
              </h3>
              <p className="font-sans text-lg max-w-xl mb-8 text-[#0A0A0A]">
                Composable pieces that add power. Compliance modules, blacklists,
                and permanent delegation. Each independently testable and strictly
                optional.
              </p>
              <div className="flex gap-4 font-mono text-sm">
                <span className="bg-[#0A0A0A] text-paper px-3 py-1">
                  Transfer Hooks
                </span>
                <span className="bg-[#0A0A0A] text-paper px-3 py-1">
                  Confidentiality
                </span>
              </div>
            </div>
          </div>

          {/* Card 3 — Standards */}
          <div
            className="stack-card bg-blue p-8 md:p-16 flex flex-col justify-between"
            style={{
              zIndex: 30,
              marginTop: "5vh",
              color: "#EBE9E1",
              borderColor: "#0A0A0A",
            }}
          >
            <div className="flex justify-between items-start">
              <span className="font-mono text-6xl text-[#0A0A0A]">03</span>
              <span className="px-4 py-1 border-2 border-[#0A0A0A] rounded-full font-mono text-sm uppercase text-[#0A0A0A]">
                Presets
              </span>
            </div>
            <div className="grid md:grid-cols-2 gap-8 items-end">
              <div>
                <h3 className="font-display text-5xl md:text-7xl font-bold uppercase mb-4 text-[#EBE9E1]">
                  Standards
                </h3>
                <p className="font-sans text-lg text-paper/80">
                  Opinionated combinations of L1 + L2. These are the
                  &quot;standards&quot; — what gets documented, recommended, and
                  heavily referenced by regulators.
                </p>
              </div>
              <div className="bg-[#0A0A0A] p-6 border-2 border-[#0A0A0A] text-paper font-mono text-sm leading-loose overflow-hidden">
                $ sss-token init --preset 2<br />
                &gt; Deploying SSS-2 Compliant...<br />
                &gt; Injecting Permanent Delegate<br />
                &gt; Validating Hooks...{" "}
                <span className="text-accent">SUCCESS</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
