"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { CheckCircle, XCircle, Info, ExternalLink, X } from "lucide-react";
import { explorerUrl } from "@/lib/utils";

interface Toast {
  id: string;
  type: "success" | "error" | "info";
  message: string;
  txSig?: string;
}

interface ToastContextType {
  addToast: (toast: Omit<Toast, "id">) => void;
}

const ToastContext = createContext<ToastContextType>({ addToast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((toast: Omit<Toast, "id">) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev, { ...toast, id }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 8000);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
      <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-2 max-w-sm">
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onClose={removeToast} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({
  toast,
  onClose,
}: {
  toast: Toast;
  onClose: (id: string) => void;
}) {
  const icons = {
    success: <CheckCircle className="w-4 h-4 text-[var(--success)]" />,
    error: <XCircle className="w-4 h-4 text-[var(--danger)]" />,
    info: <Info className="w-4 h-4 text-[var(--info)]" />,
  };

  const borderColors = {
    success: "rgba(34, 197, 94, 0.3)",
    error: "rgba(239, 68, 68, 0.3)",
    info: "rgba(6, 182, 212, 0.3)",
  };

  return (
    <div
      className="flex items-start gap-3 px-4 py-3 rounded-lg bg-[var(--bg-card)] shadow-lg animate-[slideIn_0.2s_ease-out]"
      style={{ border: `1px solid ${borderColors[toast.type]}` }}
    >
      <span className="mt-0.5 shrink-0">{icons[toast.type]}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-[var(--text-primary)] break-words">
          {toast.message}
        </p>
        {toast.txSig && (
          <a
            href={explorerUrl(toast.txSig, "tx")}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 mt-1 text-xs text-[var(--accent)] hover:text-[var(--accent-hover)] transition-colors"
          >
            View transaction
            <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </div>
      <button
        onClick={() => onClose(toast.id)}
        className="text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors shrink-0"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
