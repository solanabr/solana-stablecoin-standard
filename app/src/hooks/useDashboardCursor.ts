"use client";

import { useEffect, useRef } from "react";

export function useDashboardCursor() {
  const cursorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const cursor = cursorRef.current;
    if (!cursor) return;

    const onMouseMove = (event: MouseEvent) => {
      cursor.style.left = `${event.clientX}px`;
      cursor.style.top = `${event.clientY}px`;
    };

    const onMouseEnter = () => cursor.classList.add("active");
    const onMouseLeave = () => cursor.classList.remove("active");

    document.addEventListener("mousemove", onMouseMove);

    const attachHoverListeners = () => {
      const targets = document.querySelectorAll(".hover-trigger, button, a");
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

  return cursorRef;
}
