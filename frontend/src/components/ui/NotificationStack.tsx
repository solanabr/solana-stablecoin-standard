import { CheckCircle2, ExternalLink, XCircle } from 'lucide-react';
import type { NotificationItem } from '../../app/types';

interface NotificationStackProps {
  items: NotificationItem[];
  onDismiss: (id: string) => void;
}

export function NotificationStack({ items, onDismiss }: NotificationStackProps) {
  if (items.length === 0) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-3">
      {items.map((item) => (
        <div
          key={item.id}
          className={`pointer-events-auto overflow-hidden rounded-2xl border shadow-[0_20px_60px_rgba(0,0,0,0.45)] backdrop-blur-2xl ${
            item.variant === 'success'
              ? 'border-emerald-400/30 bg-[#081510]'
              : 'border-red-500/30 bg-[#170b0b]'
          }`}
        >
          <div
            className={`h-1 w-full ${
              item.variant === 'success' ? 'bg-emerald-400/80' : 'bg-red-400/80'
            }`}
          />
          <div className="flex items-start gap-3 p-4">
            <div className={item.variant === 'success' ? 'text-emerald-300' : 'text-red-300'}>
              {item.variant === 'success' ? (
                <CheckCircle2 className="mt-0.5 h-5 w-5" />
              ) : (
                <XCircle className="mt-0.5 h-5 w-5" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-white">{item.title}</div>
              <div className="mt-1 break-words text-xs leading-relaxed text-zinc-200">
                {item.message}
              </div>
              {item.explorerUrl ? (
                <a
                  href={item.explorerUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs font-medium text-zinc-100 transition-colors hover:border-white/20 hover:bg-white/10"
                >
                  View on Explorer
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => onDismiss(item.id)}
              className="text-zinc-400 transition-colors hover:text-white"
              aria-label="Dismiss notification"
            >
              <XCircle className="h-4 w-4" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
