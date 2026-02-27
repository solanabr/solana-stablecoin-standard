"use client";

import { useRef, useEffect } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import LoginScreen from "@/components/dashboard/LoginScreen";
import DashboardScreen from "@/components/dashboard/DashboardScreen";

export default function DashboardPage() {
  const { connected } = useWallet();
  const cursorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const cursor = cursorRef.current;
    if (!cursor) return;

    const onMouseMove = (e: MouseEvent) => {
      cursor.style.left = e.clientX + "px";
      cursor.style.top = e.clientY + "px";
    };

    const onMouseEnter = () => cursor.classList.add("active");
    const onMouseLeave = () => cursor.classList.remove("active");

    document.addEventListener("mousemove", onMouseMove);

    const attachHoverListeners = () => {
      const targets = document.querySelectorAll(
        ".hover-trigger, button, a"
      );
      targets.forEach((target) => {
        target.addEventListener("mouseenter", onMouseEnter);
        target.addEventListener("mouseleave", onMouseLeave);
      });
      return targets;
    };

    let targets = attachHoverListeners();

    const observer = new MutationObserver(() => {
      targets.forEach((target) => {
        target.removeEventListener("mouseenter", onMouseEnter);
        target.removeEventListener("mouseleave", onMouseLeave);
      });
      targets = attachHoverListeners();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      targets.forEach((target) => {
        target.removeEventListener("mouseenter", onMouseEnter);
        target.removeEventListener("mouseleave", onMouseLeave);
      });
      observer.disconnect();
    };
  }, []);

  return (
    <div className="dashboard-wrapper">
      {connected ? <DashboardScreen /> : <LoginScreen />}
      <div ref={cursorRef} className="award-cursor" />
    </div>
  );
}
