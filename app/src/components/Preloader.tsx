"use client";

import { useEffect, useRef, useState } from "react";

interface PreloaderProps {
  onComplete: () => void;
}

export default function Preloader({ onComplete }: PreloaderProps) {
  const [percentage, setPercentage] = useState(0);
  const [hidden, setHidden] = useState(false);
  const loaderRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let perc = 0;
    const interval = setInterval(() => {
      perc += Math.floor(Math.random() * 20) + 1;
      if (perc >= 100) {
        perc = 100;
        clearInterval(interval);
        setPercentage(100);
        setTimeout(() => {
          setHidden(true);
          onComplete();
        }, 500);
      } else {
        setPercentage(perc);
      }
    }, 100);

    return () => clearInterval(interval);
  }, [onComplete]);

  return (
    <div
      ref={loaderRef}
      style={{
        position: "fixed",
        inset: 0,
        background: "#0A0A0A",
        color: "#EBE9E1",
        zIndex: 9998,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "2rem",
        transition: "transform 1s cubic-bezier(0.76, 0, 0.24, 1)",
        transform: hidden ? "translateY(-100%)" : "translateY(0)",
      }}
    >
      <div className="font-mono text-sm uppercase">Loading Assets</div>
      <div className="font-display text-[15vw] font-bold leading-none">
        {percentage}%
      </div>
      <div className="font-mono text-sm uppercase text-right">
        Standard / 01
      </div>
    </div>
  );
}
