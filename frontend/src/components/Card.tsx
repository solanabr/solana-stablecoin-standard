import React, { ReactNode } from 'react';

interface CardProps {
  title?: string;
  subtitle?: string;
  icon?: ReactNode;
  children: ReactNode;
  style?: React.CSSProperties;
  actions?: ReactNode;
  accent?: string;
}

const Card: React.FC<CardProps> = ({ title, subtitle, icon, children, style, actions, accent }) => (
  <div style={{ ...styles.card, ...style }}>
    {(title || actions) && (
      <div style={styles.header}>
        <div style={styles.titleRow}>
          {icon && (
            <div style={{ ...styles.iconWrap, background: accent ? `${accent}18` : 'var(--accent-bg)' }}>
              {icon}
            </div>
          )}
          <div>
            {title && <h3 style={styles.title}>{title}</h3>}
            {subtitle && <p style={styles.subtitle}>{subtitle}</p>}
          </div>
        </div>
        {actions && <div style={styles.actions}>{actions}</div>}
      </div>
    )}
    <div style={styles.body}>{children}</div>
  </div>
);

const styles: Record<string, React.CSSProperties> = {
  card: {
    background: 'var(--bg-card)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 20px',
    borderBottom: '1px solid var(--border)',
  },
  titleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 8,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  title: {
    fontSize: 15,
    fontWeight: 600,
    color: 'var(--text-primary)',
  },
  subtitle: {
    fontSize: 12,
    color: 'var(--text-muted)',
    marginTop: 1,
  },
  body: {
    padding: '16px 20px',
  },
  actions: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
};

export default Card;
