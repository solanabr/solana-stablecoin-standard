import {
  Activity,
  Coins,
  LayoutDashboard,
  ShieldAlert,
  Users,
} from 'lucide-react';
import { Button } from '../ui/Button';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (value: string) => void;
  configLoaded: boolean;
  onSaveLockfile: () => void;
  onClearSession: () => void;
}

const navItems = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'operations', label: 'Operations', icon: Coins },
  { id: 'compliance', label: 'Compliance', icon: ShieldAlert },
  { id: 'governance', label: 'Roles', icon: Users },
  { id: 'monitoring', label: 'Monitoring', icon: Activity },
] as const;

export function Sidebar({
  activeTab,
  setActiveTab,
  configLoaded,
  onSaveLockfile,
  onClearSession,
}: SidebarProps) {
  return (
    <aside className="hidden w-72 flex-col border-r border-white/10 bg-black/40 backdrop-blur-3xl md:flex">
      <div className="flex items-center gap-4 border-b border-white/5 p-8">
        <div className="relative">
          <div className="absolute inset-0 rounded-xl bg-emerald-400 opacity-40 blur-md" />
          <div className="relative z-10 flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-200/50 bg-gradient-to-br from-emerald-300 to-emerald-600 text-[#07090b]">
            <Coins className="h-6 w-6" />
          </div>
        </div>
        <div>
          <div className="text-xl font-extrabold tracking-tight text-white">SSS Console</div>
          <div className="mt-0.5 text-xs font-semibold text-emerald-400/80">ISSUER TERMINAL</div>
        </div>
      </div>
      <nav className="flex-1 space-y-2 p-5">
        <div className="mb-4 ml-2 text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
          Navigation
        </div>
        {navItems.map((item) => {
          const disabled = item.id !== 'dashboard' && !configLoaded;
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              id={`tab-${item.id}`}
              type="button"
              disabled={disabled}
              onClick={() => setActiveTab(item.id)}
              className={`relative flex w-full items-center gap-4 overflow-hidden rounded-xl border px-4 py-3.5 text-sm font-semibold transition-all ${
                activeTab === item.id
                  ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300'
                  : disabled
                    ? 'cursor-not-allowed border-transparent text-zinc-600 opacity-40'
                    : 'border-transparent text-zinc-400 hover:border-white/10 hover:bg-white/5 hover:text-zinc-100'
              }`}
            >
              {activeTab === item.id ? (
                <div className="absolute inset-y-0 left-0 w-1 rounded-r-full bg-emerald-400" />
              ) : null}
              <Icon className="h-5 w-5" />
              {item.label}
            </button>
          );
        })}
      </nav>
      {configLoaded ? (
        <div className="border-t border-white/5 bg-white/[0.02] p-6">
          <div className="space-y-3">
            <Button variant="secondary" className="w-full" onClick={onSaveLockfile}>
              Export Lockfile
            </Button>
            <Button variant="outline" className="w-full" onClick={onClearSession}>
              New Deployment
            </Button>
          </div>
        </div>
      ) : null}
    </aside>
  );
}
