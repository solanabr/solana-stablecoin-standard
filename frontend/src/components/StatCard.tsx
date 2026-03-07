import React from 'react';

interface StatCardProps {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  color?: string;
  trend?: string;
  sub?: string;
}

const StatCard: React.FC<StatCardProps> = ({ label, value, icon, color = 'var(--accent)', trend, sub }) => (
  <div style={styles.card}>
    <div style={styles.top}>
      <div style={{ ...styles.iconWrap, background: `${color}18` }}>{icon}</div>
      {trend && (
        <span style={{ ...styles.trend, color }}>{trend}</span>
      )}
    </div>
    <div style={styles.value}>{value}</div>
    <div style={styles.label}>{label}</div>
    {sub && <div style={styles.sub}>{sub}</div>}
  </div>
);

const styles: Record<string, React.CSSProperties> = {
  card: {
    background: 'var(--bg-card)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    padding: '18px 20px',
    display: 'flex',
    flexDirection: 'column',
  },
  top: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 10,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  trend: {
    fontSize: 12,
    fontWeight: 600,
  },
  value: {
    fontSize: 26,
    fontWeight: 700,
    color: 'var(--text-primary)',
    lineHeight: 1.1,
  },
  label: {
    fontSize: 13,
    color: 'var(--text-secondary)',
    marginTop: 4,
  },
  sub: {
    fontSize: 11,
    color: 'var(--text-muted)',
    marginTop: 2,
  },
};

export default StatCard;
