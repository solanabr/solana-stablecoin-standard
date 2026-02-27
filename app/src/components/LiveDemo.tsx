"use client";

import { useEffect, useRef, useState } from "react";

const EXPLORER = "https://explorer.solana.com/tx/";
const CLUSTER = "?cluster=devnet";
const MINT = "C9TssJentaYfyyfbhihHRGfxS5t3aWHS8LoXJbopyLgp";
const MINT_EXPLORER = `https://explorer.solana.com/address/${MINT}?cluster=devnet`;

interface TxEntry {
  step: number;
  op: string;
  desc: string;
  sig: string;
}

const txs: TxEntry[] = [
  {
    step: 1,
    op: "Initialize SSS-2",
    desc: "MetadataPointer + PermanentDelegate + TransferHook + DefaultAccountState",
    sig: "2Cueq6MC4JzDczrcGXXmgyYAfVUU832RzYUMqfnYygJNp6imRxQw712xmz61YB8EKLhbeGQT2VrvFXDNSt9jcZF9",
  },
  {
    step: 2,
    op: "Init Transfer Hook",
    desc: "ExtraAccountMetaList for blacklist enforcement",
    sig: "3VRxTxjwdk4eCUyzqT2dcoWsa2DwsNvSXbr2khg4PKf9b5BX15jxSCdiwAexVqH4TQBqygy1ovFV7myzTvNHNCfr",
  },
  {
    step: 3,
    op: "Register Minter",
    desc: "Add minter with 1M token quota",
    sig: "5rLcNs7G2aQqaJ6hBJDnzkMwXAenHeSLLvF49tQ2ZoaRxdRz6vNBaQNLEoQgEPCqLdrgePQ7jmnhMGKJuaw6ipSF",
  },
  {
    step: 4,
    op: "Mint 1,000 Tokens",
    desc: "Mint to recipient with auto-created ATA",
    sig: "2hpwXKWK2wQe5E7LtYTS4ToXijmiPLNsjTvRzXoNyfQ1etYLQzxjTKUDjN5wvE8hcfRrAoKFFFEUUv6vJUbAmSt2",
  },
  {
    step: 5,
    op: "Burn 100 Tokens",
    desc: "Burn from caller's token account",
    sig: "rNNVwWtsPvprVBScTLWk5zZf7BF22PVXoPMryMcGt6CdtFgpSZDxrtXysn9gQCL6AxFAywMTjGqRkrzrgkWYJfy",
  },
  {
    step: 6,
    op: "Freeze Account",
    desc: "Freeze a token account",
    sig: "2fRzw6SPj9TcEPsAiKXSjLSpagFTkrxK2cgAW3VLh1o7VDmr344c3rZDXN5vonELXqyCvj6UuXcd8nLTMT2xQEPB",
  },
  {
    step: 7,
    op: "Thaw Account",
    desc: "Thaw a frozen token account",
    sig: "3hdai9dLYouDEV4dfDg3d1MWZ7QQBjSmuXZyWnK6WUwGh5UNdPy686HbSbYVQjpKYHpqgcaYYf8dpXALrsFzM6yw",
  },
  {
    step: 8,
    op: "Pause",
    desc: "Pause all minting and burning globally",
    sig: "TwZZCx4nhi6rxAF1QEzmqzf2pNn1Re1bzz89R43fyAshZEpBqR33AXXbdAevs4p8tcbwwFszGUPqqo6zYc3hVjR",
  },
  {
    step: 9,
    op: "Unpause",
    desc: "Resume operations",
    sig: "5W9gyYRw9fZvsXGE7CBsLqHR25CeQvrp5PveWyNfkXN5DEHVW3bJop5Z13vTTKQViafn4hCmXzNW6hkSoMyBtQrM",
  },
  {
    step: 10,
    op: "Assign Roles",
    desc: "Set pauser, blacklister, and seizer",
    sig: "5w3QegM657D5hHAkhe8ccfB4FoyatDLrYgUjYAC9ze2aB28NNuegBo5dU9txMGWcE9LjbYVDMzsCQHf9XGUjkf4D",
  },
  {
    step: 11,
    op: "Blacklist Add",
    desc: "Add address to blacklist + auto-freeze",
    sig: "2AQcWo6cg4HNLreSZmLW7KvRvgRB39Bcy1WYBkTxqmSk6W12ZGVXKyT7bXSqcwBVcXDF7DtjnNNzVT46NGvUczVe",
  },
  {
    step: 12,
    op: "Seize Tokens",
    desc: "Seize from blacklisted address via burn+mint",
    sig: "CHWrRLUhhZhxvDg5rgrHgRtACKjqjG3wKcfN4h3M4khUs5q6HpmZFWcqBCn33qpfgi96mUn7KRsJd3SYWZsvu3P",
  },
  {
    step: 13,
    op: "Blacklist Remove",
    desc: "Remove from blacklist + auto-thaw",
    sig: "5mq1c8icf3Xf6W8ynLSPUroLqj2fxB6UqF4WmZf43kDBpZLpV3tzWYRkUGYuc8M3kTjP1Y4jforNwgrSQxToEoKS",
  },
  {
    step: 14,
    op: "Attest Reserve",
    desc: "On-chain reserve attestation (GENIUS Act)",
    sig: "h3X8T9F1j2437izqGv3tnJds7qJZr5K9VW9QuXD5Jdor8AsAezwCifJc7tGYAcGroy8QJFbymUdix4WHxDrcjBM",
  },
];

function shortSig(sig: string) {
  return sig.slice(0, 6) + "..." + sig.slice(-4);
}

export default function LiveDemo() {
  const sectionRef = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!sectionRef.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.1 }
    );
    observer.observe(sectionRef.current);
    return () => observer.disconnect();
  }, []);

  return (
    <section
      ref={sectionRef}
      className="bg-ink text-paper py-24 px-6 relative overflow-hidden"
    >
      {/* grid overlay */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundSize: "50px 50px",
          backgroundImage:
            "linear-gradient(to right, #EBE9E1 1px, transparent 1px), linear-gradient(to bottom, #EBE9E1 1px, transparent 1px)",
        }}
      />

      <div className="max-w-6xl mx-auto relative">
        {/* header */}
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-16">
          <div>
            <div className="font-mono text-xs uppercase tracking-widest text-accent mb-4">
              Verified on Devnet
            </div>
            <h2 className="text-4xl md:text-6xl font-display font-bold uppercase leading-none">
              Live
              <br />
              Transactions
            </h2>
          </div>
          <a
            href={MINT_EXPLORER}
            target="_blank"
            rel="noopener noreferrer"
            className="brutal-btn bg-paper text-ink px-6 py-3 font-mono text-xs uppercase tracking-wider hover-target inline-block self-start md:self-end"
          >
            View Mint on Explorer
          </a>
        </div>

        {/* mint address */}
        <div className="border-2 border-paper/20 p-4 mb-12 font-mono text-sm flex flex-col sm:flex-row sm:items-center gap-2">
          <span className="text-paper/50 uppercase text-xs tracking-wider shrink-0">
            SSS-2 Mint:
          </span>
          <a
            href={MINT_EXPLORER}
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent hover:underline break-all"
          >
            {MINT}
          </a>
        </div>

        {/* transaction grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {txs.map((tx, i) => (
            <a
              key={tx.sig}
              href={`${EXPLORER}${tx.sig}${CLUSTER}`}
              target="_blank"
              rel="noopener noreferrer"
              className={`group border-2 border-paper/20 p-4 hover:border-accent hover:bg-accent/5 transition-all duration-300 ${
                visible
                  ? "opacity-100 translate-y-0"
                  : "opacity-0 translate-y-4"
              }`}
              style={{
                transitionDelay: visible ? `${i * 60}ms` : "0ms",
              }}
            >
              <div className="flex items-start justify-between mb-2">
                <span className="font-mono text-xs text-paper/40">
                  {String(tx.step).padStart(2, "0")}
                </span>
                <span className="font-mono text-[10px] text-accent opacity-0 group-hover:opacity-100 transition-opacity">
                  {shortSig(tx.sig)}
                </span>
              </div>
              <div className="font-display font-bold text-sm uppercase tracking-wide mb-1 group-hover:text-accent transition-colors">
                {tx.op}
              </div>
              <div className="font-mono text-[11px] text-paper/50 leading-relaxed">
                {tx.desc}
              </div>
            </a>
          ))}
        </div>

        {/* bottom line */}
        <div className="mt-12 pt-6 border-t-2 border-paper/10 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="font-mono text-xs text-paper/40 uppercase">
            14 operations / 1 automated E2E run / all verified on-chain
          </div>
          <div className="flex gap-4 font-mono text-xs uppercase">
            <a
              href="https://explorer.solana.com/address/5ZBiFxX4ggWfNR5VhAQDRZauG6CvG84puS4SQiH8BcL4?cluster=devnet"
              target="_blank"
              rel="noopener noreferrer"
              className="text-paper/50 hover:text-accent transition-colors"
            >
              sss-token program
            </a>
            <a
              href="https://explorer.solana.com/address/FmujD82V5FB6Nus7mbEV2a7cp5HG32gsiHykmtNSRJxy?cluster=devnet"
              target="_blank"
              rel="noopener noreferrer"
              className="text-paper/50 hover:text-accent transition-colors"
            >
              transfer-hook program
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
