import React from 'react';
import { Folder, LayoutTemplate, Film, Image as ImageIcon, Type, Music } from 'lucide-react';
import { SidebarTabType } from './types';

interface TemplateEditorSidebarProps {
  activeTab: SidebarTabType;
  onSelectTab: (tab: SidebarTabType) => void;
}

const SIDEBAR_ITEMS: Array<{
  id: SidebarTabType;
  label: string;
  icon: React.ElementType;
}> = [
  { id: 'media', label: 'Phương tiện', icon: Folder },
  { id: 'templates', label: 'Mẫu', icon: LayoutTemplate },
  { id: 'stock_video', label: 'Kho video', icon: Film },
  { id: 'images', label: 'Hình ảnh', icon: ImageIcon },
  { id: 'text', label: 'Văn bản', icon: Type },
  { id: 'audio', label: 'Âm thanh', icon: Music },
];

export function TemplateEditorSidebar({ activeTab, onSelectTab }: TemplateEditorSidebarProps) {
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
        {SIDEBAR_ITEMS.map(({ id, label, icon: Icon }) => {
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
