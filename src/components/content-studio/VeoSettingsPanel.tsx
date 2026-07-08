import React from 'react';
import { VIDEO_DURATION_OPTIONS, VIDEO_MODEL_OPTIONS, VIDEO_QUALITY_OPTIONS } from './video-generation.constants';

interface VeoSettingsPanelProps {
  videoModel: string;
  videoAspectRatio: string;
  videoDuration: string;
  videoQuality: string;
  onVideoModelChange: (value: string) => void;
  onAspectRatioChange: (value: string) => void;
  onDurationChange: (value: string) => void;
  onQualityChange: (value: string) => void;
}

export function VeoSettingsPanel(props: VeoSettingsPanelProps) {
  const {
    videoModel,
    videoAspectRatio,
    videoDuration,
    videoQuality,
    onVideoModelChange,
    onAspectRatioChange,
    onDurationChange,
    onQualityChange,
  } = props;

  return (
    <>
      <div className="flex flex-col gap-1 border-t border-slate-100 pt-3.5">
        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Mô hình tạo video</span>
        <select
          value={videoModel}
          onChange={(e) => onVideoModelChange(e.target.value)}
          className="w-full text-xs p-2.5 border border-slate-200 rounded-xl bg-white focus:outline-none cursor-pointer font-medium text-slate-800"
        >
          {VIDEO_MODEL_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3 border-t border-slate-100 pt-3.5">
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Khung hình</span>
          <select
            value={videoAspectRatio}
            onChange={(e) => onAspectRatioChange(e.target.value)}
            className="w-full text-xs p-2.5 border border-slate-200 rounded-xl bg-white focus:outline-none cursor-pointer font-medium text-slate-800"
          >
            <option value="16:9">16:9 Ngang</option>
            <option value="9:16">9:16 Doc</option>
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Thời lượng</span>
          <select
            value={videoDuration}
            onChange={(e) => onDurationChange(e.target.value)}
            className="w-full text-xs p-2.5 border border-slate-200 rounded-xl bg-white focus:outline-none cursor-pointer font-medium text-slate-800"
          >
            {VIDEO_DURATION_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-col gap-1.5 border-t border-slate-100 pt-3.5">
        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Độ phân giải</span>
        <div className="grid grid-cols-2 gap-2">
          {VIDEO_QUALITY_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => onQualityChange(option.value)}
              className={`py-2 text-xs font-bold rounded-xl border transition-all cursor-pointer ${
                videoQuality === option.value
                  ? 'border-[#0891b2] bg-white text-[#0891b2] shadow-xs'
                  : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
              }`}
            >
              {option.value}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
