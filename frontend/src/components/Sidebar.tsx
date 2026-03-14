import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  CirclePlus,
  Coins,
  ArrowLeftRight,
  Ban,
  ShieldCheck,
  Snowflake,
  PauseCircle,
  Lock,
  Users,
  KeyRound,
  Tag,
  Gauge,
  PieChart,
  ScrollText,
} from "lucide-react";

const navGroups = [
  {
    label: "Overview",
    links: [
      { to: "/", label: "Dashboard", icon: LayoutDashboard },
      { to: "/initialize", label: "Initialize", icon: CirclePlus },
    ],
  },
  {
    label: "Token Operations",
    links: [
      { to: "/mint-burn", label: "Mint / Burn", icon: Coins },
      { to: "/transfer", label: "Transfer", icon: ArrowLeftRight },
    ],
  },
  {
    label: "Compliance",
    links: [
      { to: "/blacklist", label: "Blacklist", icon: Ban },
      { to: "/allowlist", label: "Allowlist", icon: ShieldCheck },
      { to: "/freeze-thaw", label: "Freeze / Thaw", icon: Snowflake },
      { to: "/pause-unpause", label: "Pause", icon: PauseCircle },
      { to: "/seize", label: "Seize", icon: Lock },
    ],
  },
  {
    label: "Administration",
    links: [
      { to: "/roles", label: "Roles", icon: Users },
      { to: "/authority", label: "Authority", icon: KeyRound },
      { to: "/metadata", label: "Metadata", icon: Tag },
      { to: "/minter-quotas", label: "Quotas", icon: Gauge },
    ],
  },
  {
    label: "Analytics",
    links: [
      { to: "/holders", label: "Holders", icon: PieChart },
      { to: "/audit-log", label: "Audit Log", icon: ScrollText },
    ],
  },
];

export default function Sidebar() {
  return (
    <aside className="hidden md:flex flex-col w-[260px] bg-surface-1 border-r border-border/50">
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-5">
        <div className="relative">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center font-bold text-sm text-surface-0 shadow-glow">
            S
          </div>
          <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-400 border-2 border-surface-1 shadow-[0_0_6px_rgba(52,211,153,0.5)]" />
        </div>
        <div>
          <h1 className="text-sm font-bold text-white tracking-tight">Stablecoin Standard</h1>
          <p className="text-[11px] text-slate-500 font-medium">Solana SSS Protocol</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-2 overflow-y-auto space-y-5">
        {navGroups.map((group) => (
          <div key={group.label}>
            <p className="px-3 mb-1.5 text-[10px] font-semibold text-slate-600 uppercase tracking-widest">
              {group.label}
            </p>
            <div className="space-y-0.5">
              {group.links.map((link) => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  end={link.to === "/"}
                  className={({ isActive }) =>
                    `group flex items-center gap-3 px-3 py-2 rounded-xl text-[13px] font-medium transition-all duration-200 ${
                      isActive
                        ? "bg-brand-400/10 text-brand-400 shadow-[inset_0_0_20px_rgba(0,255,163,0.03)]"
                        : "text-slate-400 hover:text-slate-200 hover:bg-surface-3"
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <link.icon
                        size={18}
                        strokeWidth={isActive ? 2.2 : 1.8}
                        className={`transition-colors ${isActive ? "text-brand-400" : "text-slate-500 group-hover:text-slate-300"}`}
                      />
                      {link.label}
                      {isActive && (
                        <div className="ml-auto w-1.5 h-1.5 rounded-full bg-brand-400 shadow-[0_0_6px_rgba(0,255,163,0.5)]" />
                      )}
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-5 py-4 border-t border-border/30">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse-slow shadow-[0_0_6px_rgba(52,211,153,0.5)]" />
          <span className="text-[11px] text-slate-500 font-medium">SSS Protocol v1.0</span>
        </div>
      </div>
    </aside>
  );
}
