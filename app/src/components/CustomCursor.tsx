"use client";

import { useEffect, useRef } from "react";

export default function CustomCursor() {
  const cursorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const cursor = cursorRef.current;
    if (!cursor) return;

    const onMouseMove = (e: MouseEvent) => {
      cursor.style.left = e.clientX + "px";
      cursor.style.top = e.clientY + "px";
    };

    const onMouseEnter = () => cursor.classList.add("hovered");
    const onMouseLeave = () => cursor.classList.remove("hovered");

    document.addEventListener("mousemove", onMouseMove);

    const attachHoverListeners = () => {
      const targets = document.querySelectorAll(
        ".hover-target, a, button, .stack-card"
      );
      targets.forEach((target) => {
        target.addEventListener("mouseenter", onMouseEnter);
        target.addEventListener("mouseleave", onMouseLeave);
      });
      return targets;
    };

    const targets = attachHoverListeners();

    // Re-attach on DOM changes (for dynamic content)
    const observer = new MutationObserver(() => {
      attachHoverListeners();
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
    <div
      ref={cursorRef}
      style={{
        width: "20px",
        height: "20px",
        backgroundColor: "#FF3E00",
        borderRadius: "50%",
        position: "fixed",
        top: 0,
        left: 0,
        pointerEvents: "none",
        zIndex: 9999,
        transform: "translate(-50%, -50%)",
        transition:
          "width 0.3s, height 0.3s, background-color 0.3s, mix-blend-mode 0.3s",
        mixBlendMode: "normal",
      }}
      className="cursor-dot"
    >
      <style jsx>{`
        .cursor-dot.hovered {
          width: 80px !important;
          height: 80px !important;
          background-color: #EBE9E1 !important;
          mix-blend-mode: difference !important;
        }
      `}</style>
    </div>
  );
}
