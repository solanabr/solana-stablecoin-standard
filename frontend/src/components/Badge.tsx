import React, { ReactNode } from 'react';

interface BadgeProps {
  children: ReactNode;
  color?: string;
  bg?: string;
}

const Badge: React.FC<BadgeProps> = ({
  children,
  color = 'var(--accent)',
  bg = 'var(--accent-bg)',
}) => (
  <span
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      padding: '3px 10px',
      borderRadius: 999,
      fontSize: 11,
      fontWeight: 600,
      color,
      background: bg,
      letterSpacing: '0.03em',
      textTransform: 'uppercase',
    }}
  >
    {children}
  </span>
);

export default Badge;
