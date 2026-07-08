import { Languages, UserRound } from "lucide-react";
import { HEYGEN_THEME } from "./heygenTheme";

export type HeyGenTab = "avatar" | "captions";

interface HeyGenVerticalToolbarProps {
  activeTab: HeyGenTab;
  onChangeTab: (tab: HeyGenTab) => void;
}

const TABS = [
  { id: "avatar", label: "Avatar", icon: UserRound },
  { id: "captions", label: "Captions", icon: Languages },
] as const;

export function HeyGenVerticalToolbar({ activeTab, onChangeTab }: HeyGenVerticalToolbarProps) {
  return (
    <div className={`flex h-full w-[64px] shrink-0 flex-col items-center border-l ${HEYGEN_THEME.border} ${HEYGEN_THEME.surface} py-3 text-slate-400 transition-all duration-300`}>
      <div className="flex w-full flex-col gap-1.5 px-1">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onChangeTab(tab.id)}
              className={`group relative flex w-full flex-col items-center justify-center gap-1 rounded-xl py-2.5 transition-all duration-200 ${isActive ? "bg-cyan-50 font-bold text-cyan-700 shadow-sm" : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"}`}
              title={tab.label}
            >
              {isActive ? <div className="absolute left-0 top-1/4 h-1/2 w-0.5 rounded-r bg-cyan-600" /> : null}
              <Icon className="h-4.5 w-4.5 transition group-hover:scale-105" />
              <span className="mt-0.5 text-[8px] font-semibold tracking-tight">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
