import React from 'react';
import { Folder, LayoutTemplate, Film, Music } from 'lucide-react';
import { SidebarTabType, TemplateEditorItem } from './types';
import { isShotstackProviderTemplate } from './template-editor-timeline-presenter';

interface TemplateEditorSidebarProps {
  activeTab: SidebarTabType;
  onSelectTab: (tab: SidebarTabType) => void;
  projectItems: TemplateEditorItem[];
}

const SIDEBAR_ITEMS: Array<{
  id: SidebarTabType;
  label: string;
  icon: React.ElementType;
}> = [
  { id: 'media', label: 'Phương tiện', icon: Folder },
  { id: 'templates', label: 'Mẫu', icon: LayoutTemplate },
  { id: 'stock_video', label: 'Kho video', icon: Film },
  { id: 'audio', label: 'Âm thanh', icon: Music },
];

export function TemplateEditorSidebar({
  activeTab,
  onSelectTab,
  projectItems,
}: TemplateEditorSidebarProps) {
  const canAddAudio = !isShotstackProviderTemplate(projectItems);

  return (
    <aside className="w-[76px] shrink-0 bg-slate-950 border-r border-slate-800/80 flex flex-col items-center py-3 select-none z-20">
      {/* Brand logo / Icon Header */}
      <div className="mb-4 flex flex-col items-center gap-1">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-cyan-500 to-indigo-600 text-white font-bold shadow-md text-xs">
          iGen
        </div>
      </div>

      {/* Navigation List */}
      <div className="flex w-full flex-col items-center gap-1 px-1.5">
        {SIDEBAR_ITEMS.filter(({ id }) => canAddAudio || id !== 'audio').map(({ id, label, icon: Icon }) => {
          const isActive = activeTab === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onSelectTab(id)}
              className={`group flex w-full flex-col items-center justify-center gap-1 rounded-xl py-2.5 transition-all cursor-pointer ${
                isActive
                  ? 'bg-slate-800 text-cyan-400 shadow-sm border border-slate-700/60'
                  : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
              }`}
            >
              <Icon className={`h-5 w-5 transition-transform group-hover:scale-110 ${isActive ? 'text-cyan-400' : 'text-slate-400'}`} />
              <span className="text-[10px] font-semibold tracking-wide">{label}</span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
