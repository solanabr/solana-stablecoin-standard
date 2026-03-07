import React from 'react';
import { Loader2 } from 'lucide-react';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'success';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: React.ReactNode;
}

const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  children,
  disabled,
  style,
  ...rest
}) => {
  const variantStyles = variantMap[variant];
  const sizeStyles = sizeMap[size];

  return (
    <button
      disabled={disabled || loading}
      style={{
        ...baseStyle,
        ...variantStyles,
        ...sizeStyles,
        ...(disabled || loading ? { opacity: 0.5, cursor: 'not-allowed' } : {}),
        ...style,
      }}
      {...rest}
    >
      {loading ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : icon}
      {children}
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </button>
  );
};

const baseStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  border: '1px solid transparent',
  borderRadius: 'var(--radius-sm)',
  fontWeight: 600,
  cursor: 'pointer',
  transition: 'var(--transition)',
  whiteSpace: 'nowrap',
  fontFamily: 'inherit',
};

const variantMap: Record<Variant, React.CSSProperties> = {
  primary: {
    background: 'var(--accent)',
    color: '#fff',
    borderColor: 'var(--accent)',
  },
  secondary: {
    background: 'var(--bg-card)',
    color: 'var(--text-primary)',
    borderColor: 'var(--border)',
  },
  danger: {
    background: 'var(--red-bg)',
    color: 'var(--red)',
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  success: {
    background: 'var(--green-bg)',
    color: 'var(--green)',
    borderColor: 'rgba(34, 197, 94, 0.3)',
  },
  ghost: {
    background: 'transparent',
    color: 'var(--text-secondary)',
    borderColor: 'transparent',
  },
};

const sizeMap: Record<Size, React.CSSProperties> = {
  sm: { padding: '6px 12px', fontSize: 12 },
  md: { padding: '8px 18px', fontSize: 13 },
  lg: { padding: '12px 24px', fontSize: 14 },
};

export default Button;
