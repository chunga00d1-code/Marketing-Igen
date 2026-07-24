import React, { useState } from 'react';
import {
  ChevronLeft,
  CloudCheck,
  MousePointer,
  Hand,
  Undo2,
  Redo2,
  Download,
  Monitor,
  Settings,
  HelpCircle,
} from 'lucide-react';
import { AspectRatioType } from './types';

interface TemplateEditorTopbarProps {
  title: string;
  aspectRatio: AspectRatioType;
  zoomLevel: number;
  canUndo: boolean;
  canRedo: boolean;
  onSetTitle: (title: string) => void;
  onSetAspectRatio: (ratio: AspectRatioType) => void;
  onSetZoomLevel: (zoom: number) => void;
  onUndo: () => void;
  onRedo: () => void;
  onOpenExport: () => void;
  onBack: () => void;
  saveStatus?: 'loading' | 'saving' | 'saved' | 'error';
}

export function TemplateEditorTopbar({
  title,
  aspectRatio,
  zoomLevel,
  canUndo,
  canRedo,
  onSetTitle,
  onSetAspectRatio,
  onSetZoomLevel,
  onUndo,
  onRedo,
  onOpenExport,
  onBack,
  saveStatus = 'saved',
}: TemplateEditorTopbarProps) {
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [tempTitle, setTempTitle] = useState(title);
  const [activeTool, setActiveTool] = useState<'select' | 'hand'>('select');

  const handleTitleSubmit = () => {
    setIsEditingTitle(false);
    if (tempTitle.trim()) {
      onSetTitle(tempTitle.trim());
    } else {
      setTempTitle(title);
    }
  };

  return (
    <header className="h-14 shrink-0 bg-white border-b border-slate-200 px-4 flex items-center justify-between select-none z-30 shadow-2xs">
      {/* Left Section: Back, Cloud status, Editable Title */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          aria-label="Quay lại thư viện mẫu"
          className="flex h-9 w-9 items-center justify-center rounded-xl hover:bg-slate-100 text-slate-700 transition-colors cursor-pointer"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-2 border-l border-slate-200 pl-3">
          <CloudCheck className={`h-4 w-4 ${saveStatus === 'error' ? 'text-red-500' : saveStatus === 'saving' || saveStatus === 'loading' ? 'text-amber-500' : 'text-emerald-600'}`} />
          <span className={`text-[10px] font-semibold ${saveStatus === 'error' ? 'text-red-600' : 'text-slate-500'}`}>
            {saveStatus === 'loading' ? 'Đang tải' : saveStatus === 'saving' ? 'Đang lưu' : saveStatus === 'error' ? 'Lưu lỗi' : 'Đã lưu'}
          </span>
          {isEditingTitle ? (
            <input
              type="text"
              value={tempTitle}
              onChange={(e) => setTempTitle(e.target.value)}
              onBlur={handleTitleSubmit}
              onKeyDown={(e) => e.key === 'Enter' && handleTitleSubmit()}
              autoFocus
              className="text-xs font-bold text-slate-900 bg-slate-100 px-2 py-1 rounded border border-slate-300 focus:outline-none"
            />
          ) : (
            <h2
              onClick={() => setIsEditingTitle(true)}
              className="text-xs font-bold text-slate-900 hover:bg-slate-100 px-2 py-1 rounded cursor-pointer transition-colors"
            >
              {title}
            </h2>
          )}
        </div>
      </div>

      {/* Center Section: Tools, Zoom, Ratio, Undo/Redo */}
      <div className="flex items-center gap-2">
        {/* Tools (Pointer / Hand) */}
        <div className="flex items-center gap-0.5 rounded-xl border border-slate-200 bg-slate-50 p-1">
          <button
            type="button"
            onClick={() => setActiveTool('select')}
            className={`flex h-7 w-7 items-center justify-center rounded-lg text-slate-700 transition-colors cursor-pointer ${
              activeTool === 'select' ? 'bg-white shadow-xs font-bold text-cyan-600' : 'hover:bg-slate-200/60'
            }`}
          >
            <MousePointer className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setActiveTool('hand')}
            className={`flex h-7 w-7 items-center justify-center rounded-lg text-slate-700 transition-colors cursor-pointer ${
              activeTool === 'hand' ? 'bg-white shadow-xs font-bold text-cyan-600' : 'hover:bg-slate-200/60'
            }`}
          >
            <Hand className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Zoom Dropdown */}
        <select
          value={zoomLevel}
          onChange={(e) => onSetZoomLevel(Number(e.target.value))}
          className="h-8 rounded-xl border border-slate-200 bg-slate-50 px-2.5 text-xs font-semibold text-slate-700 focus:outline-none cursor-pointer"
        >
          <option value={50}>50%</option>
          <option value={75}>75%</option>
          <option value={100}>100%</option>
          <option value={125}>125%</option>
          <option value={150}>150%</option>
        </select>

        {/* Aspect Ratio Dropdown */}
        <select
          value={aspectRatio}
          onChange={(e) => onSetAspectRatio(e.target.value as AspectRatioType)}
          className="h-8 rounded-xl border border-slate-200 bg-slate-50 px-2.5 text-xs font-bold text-slate-900 focus:outline-none cursor-pointer"
        >
          <option value="9:16">9:16 (Dọc TikTok)</option>
          <option value="3:4">3:4 (Chân dung)</option>
          <option value="1:1">1:1 (Vuông Feed)</option>
          <option value="16:9">16:9 (Ngang)</option>
        </select>

        {/* Undo / Redo */}
        <div className="flex items-center gap-1 border-l border-slate-200 pl-2">
          <button
            type="button"
            disabled={!canUndo}
            onClick={onUndo}
            aria-label="Undo"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 disabled:opacity-30 cursor-pointer"
          >
            <Undo2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            disabled={!canRedo}
            onClick={onRedo}
            aria-label="Redo"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 disabled:opacity-30 cursor-pointer"
          >
            <Redo2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Right Section: Export & Options */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onOpenExport}
          className="inline-flex items-center gap-1.5 rounded-xl bg-cyan-500 hover:bg-cyan-600 text-white font-bold text-xs py-2 px-4 shadow-sm transition-all active:scale-95 cursor-pointer"
        >
          <Download className="h-4 w-4" />
          Xuất
        </button>

        <div className="flex items-center gap-1 border-l border-slate-200 pl-2 text-slate-500">
          <button type="button" aria-label="Cấu hình màn hình" className="p-1.5 hover:text-slate-800 rounded-lg cursor-pointer">
            <Monitor className="h-4 w-4" />
          </button>
          <button type="button" aria-label="Trợ giúp" className="p-1.5 hover:text-slate-800 rounded-lg cursor-pointer">
            <HelpCircle className="h-4 w-4" />
          </button>
          <button type="button" aria-label="Cài đặt" className="p-1.5 hover:text-slate-800 rounded-lg cursor-pointer">
            <Settings className="h-4 w-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
