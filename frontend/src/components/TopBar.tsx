import { Activity, FileText, GitBranch, LayoutList, SlidersHorizontal } from "lucide-react";

export type Screen = "incidents" | "investigation" | "report" | "probe";

interface TopBarProps {
  activeScreen: Screen;
  onNavigate: (screen: Screen) => void;
  hasAnyIncident: boolean;
  activeTitle?: string;
}

export function TopBar({
  activeScreen,
  onNavigate,
  hasAnyIncident,
  activeTitle,
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
    <header className="no-print h-12 bg-[#1C1917] text-[#E7E5E4] border-b border-stone-800 px-4 flex items-center justify-between gap-3 select-none overflow-hidden">
      <div className="flex items-center gap-4 min-w-0">
        <button
          type="button"
          onClick={() => onNavigate("incidents")}
          className="flex items-center gap-2.5 text-left focus:outline-none shrink-0"
        >
          <span className="w-6 h-6 rounded bg-[#C81E1E] flex items-center justify-center">
            <Activity className="w-3.5 h-3.5 text-white" strokeWidth={1.75} />
          </span>
          <span className="font-semibold text-[14px] tracking-tight text-white">
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
                className={`px-2.5 py-1.5 rounded text-[13px] font-medium flex items-center gap-1.5 whitespace-nowrap transition-colors duration-150 ${
                  active
                    ? "bg-stone-800 text-white border-b-2 border-[#C81E1E]"
                    : item.disabled
                    ? "text-stone-600 cursor-not-allowed"
                    : "text-stone-300 hover:text-white hover:bg-stone-800/60"
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" strokeWidth={1.5} />
                {item.label}
              </button>
            );
          })}
        </nav>
      </div>

      <div className="hidden lg:flex items-center gap-3 text-[12px] text-stone-400 shrink-0">
        {activeTitle && activeScreen !== "incidents" && (
          <span className="truncate max-w-[220px] text-stone-300">
            {activeTitle}
          </span>
        )}
        <span className="font-mono text-[11px] bg-stone-800 text-stone-300 px-2 py-0.5 rounded border border-stone-700">
          perplexity/pplx-decider-flash-v1.3:free
        </span>
      </div>
    </header>
  );
}
