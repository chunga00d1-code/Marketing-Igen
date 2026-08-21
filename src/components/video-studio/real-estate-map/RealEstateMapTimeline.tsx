import { useState } from "react";
import {
  Clock,
  Copy,
  Film,
  Loader2,
  Play,
  Plus,
  Trash2,
  Video,
} from "lucide-react";
import type { GisSceneKeyframe } from "./map-video.types";

interface RealEstateMapTimelineProps {
  scenes: GisSceneKeyframe[];
  selectedSceneId: string | null;
  onSelectScene: (sceneId: string) => void;
  onPinCurrentCameraScene: () => void;
  onDeleteScene: (sceneId: string) => void;
  onDuplicateScene: (sceneId: string) => void;
  onUpdateSceneDuration: (sceneId: string, durationSeconds: number) => void;
  onPreviewAllScenes: () => void;
  isPreviewing: boolean;
  onStartRender: () => Promise<void>;
  isRendering: boolean;
}

export function RealEstateMapTimeline({
  scenes,
  selectedSceneId,
  onSelectScene,
  onPinCurrentCameraScene,
  onDeleteScene,
  onDuplicateScene,
  onUpdateSceneDuration,
  onPreviewAllScenes,
  isPreviewing,
  onStartRender,
  isRendering,
}: RealEstateMapTimelineProps) {
  const selectedScene = scenes.find((s) => s.id === selectedSceneId) || scenes[0];
  const [durationInput, setDurationInput] = useState<number>(
    selectedScene?.durationSeconds || 4
  );

  const handleApplyDuration = () => {
    if (selectedScene) {
      onUpdateSceneDuration(selectedScene.id, Math.max(1, durationInput));
    }
  };

  const totalDuration = scenes.reduce((acc, s) => acc + (s.durationSeconds || 4), 0);

  return (
    <div className="flex flex-col rounded-2xl border border-slate-200 bg-white text-slate-800 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-100 px-3.5 py-2.5 bg-slate-50/80">
        <div className="flex items-center gap-2">
          <Film className="h-4 w-4 text-indigo-600" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
            Phân Cảnh (Timeline)
          </h3>
        </div>
        <span className="rounded-lg bg-indigo-50 border border-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-700">
          Tổng: {totalDuration}s
        </span>
      </div>

      {/* Timeline Controls */}
      <div className="p-3 space-y-3">
        {/* Danh sách Scene Cards */}
        <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
          {scenes.length === 0 ? (
            <div className="p-3 text-center text-xs text-slate-400 italic">
              Chưa có cảnh nào. Xoay góc bản đồ và bấm &quot;+ Ghim Cảnh Hiện Tại&quot; để thêm.
            </div>
          ) : (
            scenes.map((scene, idx) => {
              const isSelected = selectedScene?.id === scene.id;
              return (
                <div
                  key={scene.id}
                  onClick={() => onSelectScene(scene.id)}
                  className={`flex items-center justify-between rounded-xl px-2.5 py-2 text-xs transition cursor-pointer border ${
                    isSelected
                      ? "bg-indigo-50/90 border-indigo-400 text-indigo-950 font-bold shadow-xs"
                      : "bg-slate-50/70 border-slate-200 hover:bg-slate-100 text-slate-800"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded-md bg-indigo-600 text-[10px] font-black text-white">
                      #{idx + 1}
                    </span>
                    <div>
                      <span className="font-bold text-slate-800 block text-[11px]">
                        Cảnh {idx + 1} · {scene.durationSeconds}s
                      </span>
                      <span className="text-[10px] text-slate-500 block">
                        Pitch: {scene.camera.pitch}° · Zoom: {scene.camera.zoom.toFixed(1)}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDuplicateScene(scene.id);
                      }}
                      className="rounded p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-200/50"
                      title="Nhân bản cảnh"
                    >
                      <Copy className="h-3 w-3" />
                    </button>
                    {scenes.length > 1 && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteScene(scene.id);
                        }}
                        className="rounded p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                        title="Xóa cảnh"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Thiết lập thời lượng */}
        {selectedScene && (
          <div className="flex items-center justify-between rounded-xl bg-slate-50 p-2 border border-slate-200 text-[11px]">
            <span className="text-slate-600 font-semibold flex items-center gap-1">
              <Clock className="h-3 w-3 text-indigo-600" />
              Thời lượng cảnh #{selectedScene.order}:
            </span>
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                min={1}
                max={30}
                value={durationInput}
                onChange={(e) => setDurationInput(Number(e.target.value))}
                className="w-12 rounded-lg bg-white border border-slate-300 px-2 py-1 text-center font-bold text-slate-900 outline-none ring-1 ring-slate-200 focus:border-indigo-500"
              />
              <span className="text-slate-500">s</span>
              <button
                type="button"
                onClick={handleApplyDuration}
                className="rounded-lg bg-indigo-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-indigo-700 transition"
              >
                Áp dụng
              </button>
            </div>
          </div>
        )}

        {/* Nút Ghim Cảnh Hiện Tại */}
        <button
          type="button"
          onClick={onPinCurrentCameraScene}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 py-2.5 text-xs font-bold text-white shadow-md shadow-indigo-600/20 hover:brightness-105 active:scale-[0.99] transition"
        >
          <Plus className="h-4 w-4" />
          + Ghim Cảnh Hiện Tại (Camera Keyframe)
        </button>

        {/* Hàng nút Xem Thử & Xuất Video */}
        <div className="grid grid-cols-2 gap-2 pt-1">
          <button
            type="button"
            onClick={onPreviewAllScenes}
            disabled={isPreviewing}
            className="flex items-center justify-center gap-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 py-2.5 text-xs font-bold text-slate-700 border border-slate-200 transition"
          >
            <Play className="h-3.5 w-3.5 fill-slate-700 text-slate-700" />
            {isPreviewing ? "Đang chạy thử..." : "Xem thử"}
          </button>
          <button
            type="button"
            onClick={onStartRender}
            disabled={isRendering}
            className="flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-rose-600 to-red-600 hover:brightness-105 py-2.5 text-xs font-bold text-white shadow-md shadow-rose-600/20 transition disabled:opacity-50"
          >
            {isRendering ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Video className="h-3.5 w-3.5" />
            )}
            Xuất Video MP4
          </button>
        </div>
      </div>
    </div>
  );
}
