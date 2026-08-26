import { Layers3, Type, Image as ImageIcon, FileSpreadsheet, History } from 'lucide-react';
import type { EditorTool } from './types';

export const BACKGROUNDS = [
  { id: 'blank', name: 'Trang trắng', className: 'bg-white', colors: ['#ffffff', '#ffffff'] },
  { id: 'clean', name: 'Tối giản', className: 'bg-gradient-to-br from-white via-slate-50 to-indigo-100', colors: ['#ffffff', '#e0e7ff'] },
  { id: 'business', name: 'Doanh nghiệp', className: 'bg-gradient-to-br from-blue-950 via-indigo-700 to-sky-400', colors: ['#172554', '#38bdf8'] },
  { id: 'sale', name: 'Khuyến mãi', className: 'bg-gradient-to-br from-orange-400 via-rose-500 to-fuchsia-700', colors: ['#fb923c', '#a21caf'] },
  { id: 'nature', name: 'Tự nhiên', className: 'bg-gradient-to-br from-emerald-800 via-teal-600 to-lime-300', colors: ['#065f46', '#bef264'] },
  { id: 'luxury', name: 'Cao cấp', className: 'bg-gradient-to-br from-slate-950 via-amber-950 to-amber-500', colors: ['#020617', '#f59e0b'] },
  { id: 'pastel', name: 'Pastel', className: 'bg-gradient-to-br from-pink-100 via-violet-100 to-sky-100', colors: ['#fce7f3', '#e0f2fe'] },
  { id: 'fresh', name: 'Tươi trẻ', className: 'bg-gradient-to-br from-cyan-400 via-blue-500 to-violet-600', colors: ['#22d3ee', '#7c3aed'] },
  { id: 'night', name: 'Công nghệ', className: 'bg-gradient-to-br from-slate-950 via-indigo-950 to-cyan-700', colors: ['#020617', '#0e7490'] },
];

export const CANVAS_PRESETS = [
  { id: 'instagram-post', name: 'Bài Instagram', size: '1080 × 1350', width: 1080, height: 1350 },
  { id: 'square-post', name: 'Bài vuông', size: '1080 × 1080', width: 1080, height: 1080 },
  { id: 'story', name: 'Story / Reels', size: '1080 × 1920', width: 1080, height: 1920 },
  { id: 'facebook-post', name: 'Bài Facebook ngang', size: '1200 × 630', width: 1200, height: 630 },
  { id: 'facebook-cover', name: 'Ảnh bìa Facebook', size: '1640 × 924', width: 1640, height: 924 },
  { id: 'youtube-thumbnail', name: 'Thumbnail YouTube', size: '1280 × 720', width: 1280, height: 720 },
  { id: 'linkedin-post', name: 'Bài LinkedIn', size: '1200 × 627', width: 1200, height: 627 },
  { id: 'pinterest-pin', name: 'Ghim Pinterest', size: '1000 × 1500', width: 1000, height: 1500 },
];

export const QUICK_CANVAS_PRESETS = [
  { id: 'square-post', label: 'Vuông' },
  { id: 'instagram-post', label: 'Dọc' },
  { id: 'story', label: 'Story' },
  { id: 'facebook-post', label: 'Ngang' },
];

export const TOOLS: Array<{ id: EditorTool; label: string; icon: typeof Layers3 }> = [
  { id: 'background', label: 'Mẫu nền', icon: Layers3 },
  { id: 'canva', label: 'Mẫu Canva', icon: Layers3 },
  { id: 'text', label: 'Văn bản', icon: Type },
  { id: 'image', label: 'Hình ảnh', icon: ImageIcon },
  { id: 'data', label: 'Dữ liệu', icon: FileSpreadsheet },
  { id: 'history', label: 'Kết quả', icon: History },
];
