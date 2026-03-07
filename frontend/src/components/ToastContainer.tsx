import React from 'react';
import { useToast } from '../contexts/ToastContext';
import { X, CheckCircle, AlertCircle, Info, AlertTriangle, ExternalLink } from 'lucide-react';
import { explorerUrl } from '../lib/program';

const iconMap = {
  success: CheckCircle,
  error: AlertCircle,
  info: Info,
  warning: AlertTriangle,
};

const colorMap = {
  success: 'var(--green)',
  error: 'var(--red)',
  info: 'var(--accent)',
  warning: 'var(--yellow)',
};

const bgMap = {
  success: 'var(--green-bg)',
  error: 'var(--red-bg)',
  info: 'var(--accent-bg)',
  warning: 'var(--yellow-bg)',
};

const ToastContainer: React.FC = () => {
  const { toasts, removeToast } = useToast();

  return (
    <div style={styles.container}>
      {toasts.map((toast) => {
        const Icon = iconMap[toast.type];
        return (
          <div key={toast.id} className="fade-in" style={{ ...styles.toast, borderColor: colorMap[toast.type] }}>
            <div style={{ ...styles.iconWrap, background: bgMap[toast.type] }}>
              <Icon size={16} color={colorMap[toast.type]} />
            </div>
            <div style={styles.body}>
              <div style={styles.title}>{toast.title}</div>
              {toast.message && <div style={styles.message}>{toast.message}</div>}
              {toast.txSig && (
                <a
                  href={explorerUrl(toast.txSig)}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={styles.txLink}
                >
                  View on Explorer <ExternalLink size={11} />
                </a>
              )}
            </div>
            <button onClick={() => removeToast(toast.id)} style={styles.close}>
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'fixed',
    bottom: 20,
    right: 20,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    zIndex: 1000,
    maxWidth: 400,
  },
  toast: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 10,
    padding: '12px 14px',
    background: 'var(--bg-card)',
    border: '1px solid',
    borderRadius: 'var(--radius)',
    boxShadow: 'var(--shadow-lg)',
    minWidth: 300,
  },
  iconWrap: {
    width: 28,
    height: 28,
    borderRadius: 8,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  body: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--text-primary)',
  },
  message: {
    fontSize: 12,
    color: 'var(--text-secondary)',
    marginTop: 2,
  },
  txLink: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    fontSize: 11,
    color: 'var(--accent)',
    marginTop: 4,
    textDecoration: 'none',
  },
  close: {
    background: 'none',
    border: 'none',
    color: 'var(--text-muted)',
    padding: 2,
    cursor: 'pointer',
    flexShrink: 0,
  },
};

export default ToastContainer;
