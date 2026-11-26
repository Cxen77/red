import { Activity, FileText, GitBranch, LayoutList, SlidersHorizontal } from "lucide-react";
import type { IncidentMetadata } from "../types";

export type Screen = "landing" | "incidents" | "investigation" | "report" | "probe";

interface TopBarProps {
  activeScreen: Screen;
  onNavigate: (screen: Screen) => void;
  hasAnyIncident: boolean;
  incidents: IncidentMetadata[];
  activeIncidentId?: string;
  onSelectIncident: (id: string) => void;
}

export function TopBar({
  activeScreen,
  onNavigate,
  hasAnyIncident,
  incidents,
  activeIncidentId,
  onSelectIncident,
}: TopBarProps) {
  const navItems: Array<{
    id: Screen;
    label: string;
    icon: typeof LayoutList;
    disabled?: boolean;
  }> = [
    { id: "incidents", label: "Incidents", icon: LayoutList },
    {
      id: "investigation",
      label: "Timeline & Findings",
      icon: GitBranch,
      disabled: !hasAnyIncident,
    },
    {
      id: "report",
      label: "Report",
      icon: FileText,
      disabled: !hasAnyIncident,
    },
    { id: "probe", label: "Decider Probe", icon: SlidersHorizontal },
  ];

  return (
    <header className="no-print h-12 bg-[#0A0A0A] text-[#FAFAFA] border-b border-white/10 px-4 flex items-center justify-between gap-3 select-none overflow-hidden">
      <div className="flex items-center gap-4 min-w-0">
        <button
          type="button"
          onClick={() => onNavigate("landing")}
          className="flex items-center gap-2.5 text-left focus:outline-none shrink-0 group"
          title="Back to Landing Page"
        >
          <span className="w-6 h-6 bg-[#F97316] flex items-center justify-center transition-transform group-hover:scale-105">
            <Activity className="w-3.5 h-3.5 text-[#101010]" strokeWidth={2} />
          </span>
          <span className="font-mono font-bold text-[13px] tracking-widest uppercase text-white">
            IncidentLens
          </span>
        </button>

        <nav className="flex items-center gap-1 overflow-x-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeScreen === item.id;
            return (
              <button
                key={item.id}
                type="button"
                disabled={item.disabled}
                onClick={() => onNavigate(item.id)}
                className={`px-3 py-1.5 font-mono text-[12px] tracking-wide flex items-center gap-1.5 whitespace-nowrap transition-colors duration-150 ${
                  active
                    ? "bg-white/[0.06] text-white border-b-2 border-[#F97316]"
                    : item.disabled
                    ? "text-white/25 cursor-not-allowed"
                    : "text-white/60 hover:text-white hover:bg-white/[0.04]"
                }`}
              >
                <Icon
                  className={`w-3.5 h-3.5 shrink-0 ${active ? "text-[#F97316]" : ""}`}
                  strokeWidth={1.75}
                />
                {item.label}
              </button>
            );
          })}
        </nav>
      </div>

      <div className="flex items-center gap-2.5 shrink-0">
        {(activeScreen === "investigation" || activeScreen === "report") && incidents.length > 0 && (
          <select
            aria-label="Active incident selector"
            value={activeIncidentId || incidents[0]?.id}
            onChange={(e) => onSelectIncident(e.target.value)}
            className="bg-[#141414] text-white border border-white/15 px-2.5 py-1 font-mono text-[11px] max-w-[260px] focus:outline-none focus:border-[#F97316]"
          >
            {incidents.map((inc) => (
              <option key={inc.id} value={inc.id}>
                {inc.title} ({inc.id})
              </option>
            ))}
          </select>
        )}
        <span className="hidden xl:inline font-mono text-[11px] bg-[#141414] text-[#F97316] px-2.5 py-1 border border-white/10">
          gemini-2.5-flash
        </span>
      </div>
    </header>
  );
}
