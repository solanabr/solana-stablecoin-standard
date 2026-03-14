import React, { ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { useStablecoin } from '../contexts/StablecoinContext';
import {
  LayoutDashboard,
  PlusCircle,
  Settings,
  Shield,
  Users,
  Activity,
  Coins,
  Snowflake,
  ChevronRight,
  Hexagon,
} from 'lucide-react';
import NetworkSelector from './NetworkSelector';
import ToastContainer from './ToastContainer';

const navItems = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/create', label: 'Create Stablecoin', icon: PlusCircle },
  { path: '/manage', label: 'Manage', icon: Settings },
  { path: '/mint-burn', label: 'Mint & Burn', icon: Coins },
  { path: '/freeze-thaw', label: 'Freeze & Thaw', icon: Snowflake },
  { path: '/compliance', label: 'Compliance', icon: Shield },
  { path: '/holders', label: 'Holders', icon: Users },
  { path: '/activity', label: 'Activity', icon: Activity },
];

const Layout: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { connected } = useWallet();
  const { stablecoinInfo, currentMint } = useStablecoin();
  const location = useLocation();

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {/* ─── Sidebar ──────────────────────────────────────────────── */}
      <aside style={styles.sidebar}>
        <div style={styles.logo}>
          <Hexagon size={28} color="var(--accent)" strokeWidth={2.5} />
          <div>
            <div style={styles.logoTitle}>SSS Admin</div>
            <div style={styles.logoSub}>Stablecoin Standard</div>
          </div>
        </div>

        <nav style={styles.nav}>
          {navItems.map(({ path, label, icon: Icon }) => {
            const isActive = location.pathname === path;
            const isDisabled = path !== '/' && path !== '/create' && !currentMint;
            return (
              <NavLink
                key={path}
                to={isDisabled ? '#' : path}
                style={{
                  ...styles.navItem,
                  ...(isActive ? styles.navItemActive : {}),
                  ...(isDisabled ? styles.navItemDisabled : {}),
                }}
                onClick={(e) => isDisabled && e.preventDefault()}
              >
                <Icon size={18} />
                <span>{label}</span>
                {isActive && <ChevronRight size={14} style={{ marginLeft: 'auto', opacity: 0.6 }} />}
              </NavLink>
            );
          })}
        </nav>

        {stablecoinInfo && (
          <div style={styles.mintBadge}>
            <div style={styles.mintBadgeLabel}>{stablecoinInfo.symbol}</div>
            <div style={styles.mintBadgePreset}>
              {stablecoinInfo.preset === 'SSS_1' ? 'SSS-1 Basic' : 'SSS-2 Compliance'}
            </div>
            <div style={styles.mintBadgeAddr}>
              {stablecoinInfo.mint.slice(0, 8)}...{stablecoinInfo.mint.slice(-4)}
            </div>
          </div>
        )}

        <div style={styles.sidebarFooter}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>v0.1.0 — Solana Stablecoin Standard</div>
        </div>
      </aside>

      {/* ─── Main ─────────────────────────────────────────────────── */}
      <div style={styles.main}>
        <header style={styles.header}>
          <div style={styles.headerLeft}>
            <h1 style={styles.pageTitle}>
              {navItems.find((n) => n.path === location.pathname)?.label || 'Dashboard'}
            </h1>
          </div>
          <div style={styles.headerRight}>
            <NetworkSelector />
            <WalletMultiButton />
          </div>
        </header>

        <main style={styles.content}>
          {children}
        </main>
      </div>

      <ToastContainer />
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  sidebar: {
    width: 'var(--sidebar-width)',
    minWidth: 'var(--sidebar-width)',
    background: 'var(--bg-secondary)',
    borderRight: '1px solid var(--border)',
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    overflow: 'hidden',
  },
  logo: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '20px 20px 16px',
    borderBottom: '1px solid var(--border)',
  },
  logoTitle: {
    fontSize: 16,
    fontWeight: 700,
    color: 'var(--text-primary)',
    lineHeight: 1.2,
  },
  logoSub: {
    fontSize: 11,
    color: 'var(--text-muted)',
    letterSpacing: '0.05em',
    textTransform: 'uppercase' as const,
  },
  nav: {
    flex: 1,
    padding: '12px 10px',
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    overflowY: 'auto',
  },
  navItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '10px 14px',
    borderRadius: 'var(--radius-sm)',
    color: 'var(--text-secondary)',
    fontSize: 14,
    fontWeight: 500,
    textDecoration: 'none',
    transition: 'var(--transition)',
  },
  navItemActive: {
    background: 'var(--accent-bg)',
    color: 'var(--accent)',
  },
  navItemDisabled: {
    opacity: 0.35,
    cursor: 'not-allowed',
  },
  mintBadge: {
    margin: '0 14px 12px',
    padding: '12px 14px',
    background: 'var(--bg-card)',
    borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--border)',
  },
  mintBadgeLabel: {
    fontSize: 14,
    fontWeight: 700,
    color: 'var(--text-primary)',
  },
  mintBadgePreset: {
    fontSize: 11,
    color: 'var(--accent)',
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    marginTop: 2,
  },
  mintBadgeAddr: {
    fontSize: 11,
    color: 'var(--text-muted)',
    marginTop: 4,
    fontFamily: 'monospace',
  },
  sidebarFooter: {
    padding: '12px 20px',
    borderTop: '1px solid var(--border)',
  },
  main: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  header: {
    height: 'var(--header-height)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 28px',
    borderBottom: '1px solid var(--border)',
    background: 'var(--bg-secondary)',
    flexShrink: 0,
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
  },
  pageTitle: {
    fontSize: 18,
    fontWeight: 700,
    color: 'var(--text-primary)',
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  content: {
    flex: 1,
    overflow: 'auto',
    padding: 28,
  },
};

export default Layout;
