import React, { useCallback, useEffect, useRef, useState } from "react";
import { explorerTxUrl } from "../../utils/format";

// ── Types ───────────────────────────────────────────────────────────────────

export type ToastType = "success" | "error" | "info" | "warning";

export interface Toast {
  id:        string;
  type:      ToastType;
  message:   string;
  txSig?:    string;
  duration?: number; // ms, default 6000
}

// ── Global toast bus (simple pub/sub) ───────────────────────────────────────

type Listener = (toast: Toast) => void;
const listeners: Set<Listener> = new Set();

function emit(toast: Toast) {
  listeners.forEach((fn) => fn(toast));
}

let counter = 0;

/**
 * Programmatically trigger a toast from anywhere in the app without prop drilling.
 * Import this function and call it directly.
 */
export function showToast(
  type: ToastType,
  message: string,
  options?: { txSig?: string; duration?: number }
): string {
  const id = `toast-${++counter}`;
  emit({ id, type, message, ...(options ?? {}) });
  return id;
}

export const toast = {
  success: (msg: string, opts?: { txSig?: string }) =>
    showToast("success", msg, opts),
  error: (msg: string) => showToast("error", msg),
  info: (msg: string) => showToast("info", msg),
  warning: (msg: string) => showToast("warning", msg),
};

// ── Single toast item ────────────────────────────────────────────────────────

const ICONS: Record<ToastType, React.ReactNode> = {
  success: (
    <svg className="w-5 h-5 text-emerald-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  ),
  error: (
    <svg className="w-5 h-5 text-red-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  ),
  warning: (
    <svg className="w-5 h-5 text-amber-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
    </svg>
  ),
  info: (
    <svg className="w-5 h-5 text-blue-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
};

const BORDER: Record<ToastType, string> = {
  success: "border-l-emerald-500",
  error:   "border-l-red-500",
  warning: "border-l-amber-500",
  info:    "border-l-blue-500",
};

interface ToastItemProps {
  toast: Toast;
  onRemove: (id: string) => void;
}

function ToastItem({ toast: t, onRemove }: ToastItemProps) {
  const [visible, setVisible] = useState(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismiss = useCallback(() => {
    setVisible(false);
    setTimeout(() => onRemove(t.id), 300); // wait for CSS fade-out
  }, [onRemove, t.id]);

  useEffect(() => {
    const dur = t.duration ?? 6000;
    timerRef.current = setTimeout(dismiss, dur);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [dismiss, t.duration]);

  return (
    <div
      className={`
        flex items-start gap-3 w-full max-w-sm bg-surface-card border border-surface-border
        border-l-4 ${BORDER[t.type]} rounded-lg shadow-card px-4 py-3
        transition-all duration-300
        ${visible ? "opacity-100 translate-x-0" : "opacity-0 translate-x-8"}
      `}
    >
      {ICONS[t.type]}
      <div className="flex-1 min-w-0">
        <p className="text-sm text-slate-200 leading-snug">{t.message}</p>
        {t.txSig && (
          <a
            href={explorerTxUrl(t.txSig)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-indigo-400 hover:text-indigo-300 underline mt-0.5 inline-block"
          >
            View on Explorer →
          </a>
        )}
      </div>
      <button
        onClick={dismiss}
        className="text-slate-500 hover:text-slate-300 transition-colors flex-shrink-0 mt-0.5"
        aria-label="Dismiss"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

// ── Toast container (mount once in Layout) ───────────────────────────────────

export function TransactionToastContainer() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    const handler = (t: Toast) => {
      setToasts((prev) => [...prev, t]);
    };
    listeners.add(handler);
    return () => {
      listeners.delete(handler);
    };
  }, []);

  const remove = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <div
      aria-live="polite"
      className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 items-end"
    >
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onRemove={remove} />
      ))}
    </div>
  );
}
