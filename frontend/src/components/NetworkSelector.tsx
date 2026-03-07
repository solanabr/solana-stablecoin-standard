import React, { useState, useRef, useEffect } from 'react';
import { Globe } from 'lucide-react';

const NETWORKS = [
  { id: 'devnet', label: 'Devnet', color: 'var(--green)' },
  { id: 'mainnet', label: 'Mainnet', color: 'var(--red)' },
  { id: 'localnet', label: 'Localnet', color: 'var(--yellow)' },
];

const NetworkSelector: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [network, setNetwork] = useState(localStorage.getItem('sss-network') || 'devnet');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const current = NETWORKS.find((n) => n.id === network) || NETWORKS[0];

  const handleSelect = (id: string) => {
    setNetwork(id);
    localStorage.setItem('sss-network', id);
    setOpen(false);
    window.location.reload();
  };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button onClick={() => setOpen(!open)} style={styles.trigger}>
        <span style={{ ...styles.dot, background: current.color }} />
        <Globe size={14} />
        <span>{current.label}</span>
      </button>

      {open && (
        <div style={styles.dropdown}>
          {NETWORKS.map((n) => (
            <button
              key={n.id}
              onClick={() => handleSelect(n.id)}
              style={{
                ...styles.option,
                ...(n.id === network ? styles.optionActive : {}),
              }}
            >
              <span style={{ ...styles.dot, background: n.color }} />
              {n.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  trigger: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '8px 14px',
    background: 'var(--bg-card)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)',
    color: 'var(--text-secondary)',
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'var(--transition)',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    flexShrink: 0,
  },
  dropdown: {
    position: 'absolute',
    top: '100%',
    right: 0,
    marginTop: 4,
    background: 'var(--bg-card)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)',
    padding: 4,
    minWidth: 140,
    zIndex: 100,
    boxShadow: 'var(--shadow-lg)',
  },
  option: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    width: '100%',
    padding: '8px 12px',
    background: 'transparent',
    border: 'none',
    borderRadius: 6,
    color: 'var(--text-secondary)',
    fontSize: 13,
    cursor: 'pointer',
    transition: 'var(--transition)',
  },
  optionActive: {
    background: 'var(--accent-bg)',
    color: 'var(--accent)',
  },
};

export default NetworkSelector;
