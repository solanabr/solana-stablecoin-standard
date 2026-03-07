import React from 'react';
import { Loader2 } from 'lucide-react';

const Spinner: React.FC<{ size?: number; label?: string }> = ({ size = 20, label }) => (
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: 40 }}>
    <Loader2 size={size} color="var(--accent)" style={{ animation: 'spin 1s linear infinite' }} />
    {label && <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{label}</span>}
    <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
  </div>
);

export default Spinner;
