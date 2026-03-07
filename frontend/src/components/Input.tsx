import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

const Input: React.FC<InputProps> = ({ label, error, hint, style, ...rest }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
    {label && <label style={styles.label}>{label}</label>}
    <input
      style={{
        ...styles.input,
        ...(error ? { borderColor: 'var(--red)' } : {}),
        ...style,
      }}
      {...rest}
    />
    {error && <span style={styles.error}>{error}</span>}
    {hint && !error && <span style={styles.hint}>{hint}</span>}
  </div>
);

const styles: Record<string, React.CSSProperties> = {
  label: {
    fontSize: 12,
    fontWeight: 600,
    color: 'var(--text-secondary)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  input: {
    padding: '10px 14px',
    background: 'var(--bg-input)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)',
    color: 'var(--text-primary)',
    fontSize: 14,
    outline: 'none',
    transition: 'var(--transition)',
    width: '100%',
  },
  error: {
    fontSize: 11,
    color: 'var(--red)',
  },
  hint: {
    fontSize: 11,
    color: 'var(--text-muted)',
  },
};

export default Input;
