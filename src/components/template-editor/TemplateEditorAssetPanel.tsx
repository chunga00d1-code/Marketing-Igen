import React, { useRef, useState } from 'react';
import {
  Upload,
  Plus,
  Check,
  Music,
  Type,
  Sparkles,
  Film,
  Image as ImageIcon,
  Trash2,
  FolderOpen,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { SidebarTabType, MediaAsset, TemplateEditorItem } from './types';
import { MOCK_TEXT_PRESETS, MOCK_AUDIO_TRACKS } from './mockData';

interface TemplateEditorAssetPanelProps {
  activeTab: SidebarTabType;
  mediaAssets: MediaAsset[];
  selectedItem: TemplateEditorItem | null;
  onUploadFiles: (files: FileList) => void;
  onDeleteMediaAsset?: (assetId: string) => void;
  onRetryMediaUpload?: (assetId: string) => void;
  onAddMediaAsset: (asset: MediaAsset) => void;
  onReplaceMediaAsset: (itemId: string, asset: MediaAsset) => void;
  onAddTextPreset: (preset: typeof MOCK_TEXT_PRESETS[0]) => void;
  onAddAudioTrack: (track: typeof MOCK_AUDIO_TRACKS[0]) => void;
}

export function TemplateEditorAssetPanel({
  activeTab,
  mediaAssets,
  selectedItem,
  onUploadFiles,
  onDeleteMediaAsset,
  onRetryMediaUpload,
  onAddMediaAsset,
  onReplaceMediaAsset,
  onAddTextPreset,
  onAddAudioTrack,
}: TemplateEditorAssetPanelProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [mediaFilter, setMediaFilter] = useState<'all' | 'video' | 'image'>('all');

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      onUploadFiles(files);
      e.target.value = '';
    }
  };

  const handleAssetClick = (asset: MediaAsset) => {
    if (asset.uploadStatus && asset.uploadStatus !== 'ready') return;
    if (selectedItem && (selectedItem.type === 'video' || selectedItem.type === 'image')) {
      onReplaceMediaAsset(selectedItem.id, asset);
    } else {
      onAddMediaAsset(asset);
    }
  };

  const filteredMedia = mediaAssets.filter((asset) => {
    if (mediaFilter === 'video') return asset.type === 'video';
    if (mediaFilter === 'image') return asset.type === 'image';
    return true;
  });

  return (
    <div className="w-[300px] shrink-0 bg-slate-900 border-r border-slate-800 flex flex-col h-full overflow-hidden select-none z-10">
      {/* Hidden File Input for Multiple Files */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept="video/mp4,video/quicktime,video/webm,image/jpeg,image/png,image/webp,image/gif,audio/mpeg,audio/wav,audio/mp4,audio/aac,audio/ogg"
        multiple
        className="hidden"
      />

      {/* Header */}
      <div className="p-4 border-b border-slate-800 flex items-center justify-between">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
          {activeTab === 'media' && 'Phương tiện của tôi'}
          {activeTab === 'templates' && 'Thư viện mẫu'}
          {activeTab === 'stock_video' && 'Kho video có sẵn'}
          {activeTab === 'images' && 'Thư viện hình ảnh'}
          {activeTab === 'text' && 'Văn bản & Subtitle'}
          {activeTab === 'audio' && 'Kho âm thanh'}
        </h3>
        {selectedItem && (selectedItem.type === 'video' || selectedItem.type === 'image') && (
          <span className="text-[10px] font-bold text-cyan-400 bg-cyan-950/80 px-2 py-0.5 rounded-full border border-cyan-800/80">
            Chế độ thay thế
          </span>
        )}
      </div>

      {/* Tab Content Body */}
      <div className="flex-1 overflow-y-auto p-3">
        {/* TAB: MEDIA */}
        {activeTab === 'media' && (
          <div className="flex flex-col gap-3">
            {/* Upload Button */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white font-bold text-xs py-2.5 px-3 border border-cyan-500/30 transition-all cursor-pointer shadow-md active:scale-95"
            >
              <Upload className="h-4 w-4" />
              Tải lên ảnh / video từ máy tính
            </button>

            {/* Filter Sub-Tabs (All / Video / Image) */}
            <div className="flex items-center gap-1 rounded-xl bg-slate-950 p-1 border border-slate-800">
              <button
                type="button"
                onClick={() => setMediaFilter('all')}
                className={`flex-1 rounded-lg py-1 text-[10px] font-bold transition-all cursor-pointer ${
                  mediaFilter === 'all'
                    ? 'bg-slate-800 text-cyan-400 shadow-xs'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Tất cả ({mediaAssets.length})
              </button>
              <button
                type="button"
                onClick={() => setMediaFilter('video')}
                className={`flex-1 rounded-lg py-1 text-[10px] font-bold transition-all cursor-pointer ${
                  mediaFilter === 'video'
                    ? 'bg-slate-800 text-cyan-400 shadow-xs'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Video ({mediaAssets.filter((a) => a.type === 'video').length})
              </button>
              <button
                type="button"
                onClick={() => setMediaFilter('image')}
                className={`flex-1 rounded-lg py-1 text-[10px] font-bold transition-all cursor-pointer ${
                  mediaFilter === 'image'
                    ? 'bg-slate-800 text-cyan-400 shadow-xs'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Ảnh ({mediaAssets.filter((a) => a.type === 'image').length})
              </button>
            </div>

            {/* History Section Sub-header */}
            <div className="flex items-center justify-between px-1">
              <span className="text-[11px] font-semibold text-slate-400">Lịch sử phương tiện đã tải</span>
            </div>

            {/* Asset Grid */}
            {filteredMedia.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center gap-2 border border-dashed border-slate-800 rounded-2xl p-4">
                <FolderOpen className="h-8 w-8 text-slate-600" />
                <p className="text-xs font-bold text-slate-300">Chưa có tệp nào</p>
                <p className="text-[10px] text-slate-500">
                  Nhấn nút Tải lên để đẩy video hoặc hình ảnh từ máy tính vào kho lưu trữ.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {filteredMedia.map((asset) => (
                  <div
                    key={asset.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => handleAssetClick(asset)}
                    className={`group relative flex flex-col rounded-xl border border-slate-800 bg-slate-950/90 overflow-hidden transition-all ${
                      asset.uploadStatus && asset.uploadStatus !== 'ready'
                        ? 'cursor-default opacity-90'
                        : 'cursor-pointer hover:border-cyan-500/80'
                    }`}
                  >
                    <div className="relative aspect-3/4 w-full bg-slate-950">
                      {asset.type === 'video' ? (
                        <video src={asset.url} muted preload="metadata" className="h-full w-full object-cover" />
                      ) : asset.type === 'audio' ? (
                        <div className="flex h-full w-full items-center justify-center bg-indigo-950 text-indigo-300">
                          <Music className="h-8 w-8" />
                        </div>
                      ) : (
                        <img
                          src={asset.thumbnailUrl}
                          alt={asset.name}
                          className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                      )}
                      {asset.uploadStatus === 'uploading' && (
                        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-slate-950/80 text-white">
                          <Loader2 className="h-5 w-5 animate-spin text-cyan-400" />
                          <span className="mt-2 text-[10px] font-bold">Đang tải {asset.uploadProgress || 0}%</span>
                          <div className="mt-2 h-1 w-3/4 overflow-hidden rounded-full bg-slate-700">
                            <div className="h-full bg-cyan-400" style={{ width: `${asset.uploadProgress || 0}%` }} />
                          </div>
                        </div>
                      )}
                      {asset.uploadStatus === 'error' && (
                        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-rose-950/85 p-2 text-center text-white">
                          <span className="text-[9px] leading-tight">{asset.uploadError}</span>
                          {asset.sourceFile && onRetryMediaUpload && (
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                onRetryMediaUpload(asset.id);
                              }}
                              className="mt-2 inline-flex items-center gap-1 rounded-lg bg-white/15 px-2 py-1 text-[9px] font-bold hover:bg-white/25"
                            >
                              <RefreshCw className="h-3 w-3" /> Thử lại
                            </button>
                          )}
                        </div>
                      )}
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5">
                        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-cyan-500 text-slate-950 font-bold shadow-md">
                          <Plus className="h-4 w-4" />
                        </div>
                        {onDeleteMediaAsset && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteMediaAsset(asset.id);
                            }}
                            className="flex h-7 w-7 items-center justify-center rounded-full bg-rose-600/90 text-white font-bold shadow-md hover:bg-rose-500 transition-colors"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>

                      {/* Media Type Icon Tag */}
                      <div className="absolute bottom-1.5 right-1.5 bg-black/70 backdrop-blur-xs text-white text-[9px] font-bold p-1 rounded-md">
                        {asset.type === 'video' ? (
                          <Film className="h-3 w-3 text-cyan-400" />
                        ) : asset.type === 'audio' ? (
                          <Music className="h-3 w-3 text-indigo-400" />
                        ) : (
                          <ImageIcon className="h-3 w-3 text-emerald-400" />
                        )}
                      </div>

                      {/* Added Tag */}
                      {asset.added && (
                        <div className="absolute top-1.5 left-1.5 flex items-center gap-1 bg-emerald-600/90 backdrop-blur-xs text-white text-[9px] font-bold px-1.5 py-0.5 rounded-md">
                          <Check className="h-2.5 w-2.5" />
                          Đã thêm
                        </div>
                      )}
                    </div>

                    <div className="p-1.5 flex flex-col">
                      <span className="text-[10px] font-medium text-slate-300 line-clamp-1">
                        {asset.name}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB: TEXT */}
        {activeTab === 'text' && (
          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={() =>
                onAddTextPreset({
                  id: `txt-${Date.now()}`,
                  title: 'Văn bản mới',
                  text: 'Nhập nội dung chữ...',
                  color: '#ffffff',
                  fontSize: 24,
                  bold: false,
                })
              }
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white font-bold text-xs py-2.5 px-3 shadow-sm transition-all cursor-pointer active:scale-95"
            >
              <Type className="h-4 w-4" />
              Thêm văn bản mặc định
            </button>

            <span className="text-[11px] font-semibold text-slate-400 px-1 mt-1">Mẫu chữ đính kèm</span>

            <div className="flex flex-col gap-2">
              {MOCK_TEXT_PRESETS.map((preset) => (
                <div
                  key={preset.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => onAddTextPreset(preset)}
                  className="flex flex-col gap-1 rounded-xl border border-slate-800 bg-slate-950 p-3 hover:border-indigo-500/80 transition-all cursor-pointer group"
                >
                  <span className="text-[10px] font-bold text-slate-400 group-hover:text-cyan-400">
                    {preset.title}
                  </span>
                  <div
                    style={{ color: preset.color }}
                    className="text-sm font-extrabold line-clamp-1"
                  >
                    {preset.text}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB: AUDIO */}
        {activeTab === 'audio' && (
          <div className="flex flex-col gap-2">
            <span className="text-[11px] font-semibold text-slate-400 px-1">Kho nhạc quảng cáo ({MOCK_AUDIO_TRACKS.length})</span>
            {MOCK_AUDIO_TRACKS.map((track) => (
              <div
                key={track.id}
                className="flex items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-950 p-2.5 hover:border-slate-700 transition-all"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-950 text-indigo-400 border border-indigo-800/60">
                    <Music className="h-4 w-4" />
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="text-xs font-bold text-white line-clamp-1">{track.name}</span>
                    <span className="text-[10px] text-slate-400">{track.artist} &bull; {track.duration}s</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onAddAudioTrack(track)}
                  className="flex h-7 w-7 items-center justify-center rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold transition-all cursor-pointer shrink-0"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* TAB: TEMPLATES / STOCK VIDEO / IMAGES */}
        {(activeTab === 'templates' || activeTab === 'stock_video' || activeTab === 'images') && (
          <div className="flex flex-col items-center justify-center py-10 text-center text-slate-400 gap-2">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-800 text-slate-300">
              {activeTab === 'templates' && <Sparkles className="h-6 w-6" />}
              {activeTab === 'stock_video' && <Film className="h-6 w-6" />}
              {activeTab === 'images' && <ImageIcon className="h-6 w-6" />}
            </div>
            <p className="text-xs font-bold text-slate-200">Dữ liệu kho tài nguyên</p>
            <p className="text-[11px] text-slate-500 max-w-[200px]">
              Chuyển sang tab Phương tiện để tải lên ảnh & video cá nhân của bạn.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
