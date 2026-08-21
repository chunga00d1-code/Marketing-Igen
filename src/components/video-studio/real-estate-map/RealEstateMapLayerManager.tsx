import { useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Building2,
  Copy,
  Eye,
  EyeOff,
  Layers,
  MapPin,
  Navigation,
  Pencil,
  Trash2,
  Type,
} from "lucide-react";
import type { GisMapLayer } from "./map-video.types";
import { GIS_NEON_COLORS } from "./map-video.types";

interface RealEstateMapLayerManagerProps {
  layers: GisMapLayer[];
  selectedLayerId: string | null;
  onSelectLayer: (layerId: string) => void;
  onToggleLayerVisibility: (layerId: string) => void;
  onChangeLayerColor: (layerId: string, colorHex: string) => void;
  onDuplicateLayer: (layerId: string) => void;
  onDeleteLayer: (layerId: string) => void;
  onMoveLayer: (layerId: string, direction: "up" | "down" | "top" | "bottom") => void;
  onRenameLayer: (layerId: string, newName: string) => void;
}

export function RealEstateMapLayerManager({
  layers,
  selectedLayerId,
  onSelectLayer,
  onToggleLayerVisibility,
  onChangeLayerColor,
  onDuplicateLayer,
  onDeleteLayer,
  onMoveLayer,
  onRenameLayer,
}: RealEstateMapLayerManagerProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [activeColorPickerId, setActiveColorPickerId] = useState<string | null>(null);

  const handleStartRename = (layer: GisMapLayer) => {
    setEditingId(layer.id);
    setEditName(layer.name);
  };

  const handleSaveRename = (id: string) => {
    if (editName.trim()) {
      onRenameLayer(id, editName.trim());
    }
    setEditingId(null);
  };

  const getLayerIcon = (type: GisMapLayer["type"]) => {
    switch (type) {
      case "polygon":
        return <Layers className="h-3.5 w-3.5" />;
      case "route":
        return <Navigation className="h-3.5 w-3.5" />;
      case "marker":
        return <MapPin className="h-3.5 w-3.5" />;
      case "text-billboard":
        return <Type className="h-3.5 w-3.5" />;
      default:
        return <Building2 className="h-3.5 w-3.5" />;
    }
  };

  return (
    <div className="flex flex-col rounded-2xl border border-slate-200 bg-white text-slate-800 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-100 px-3.5 py-2.5 bg-slate-50/80">
        <div className="flex items-center gap-2">
          <span className="flex h-2 w-2 rounded-full bg-indigo-600 animate-pulse" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
            Quản Lý Lớp Dựng Hình ({layers.length})
          </h3>
        </div>
      </div>

      {/* Layer Action Toolbar */}
      <div className="flex items-center justify-between border-b border-slate-100 px-3 py-1.5 bg-slate-50/40 text-[11px]">
        <span className="text-slate-500 font-semibold">Danh sách đối tượng:</span>
        <div className="flex items-center gap-1">
          {selectedLayerId && (
            <>
              <button
                type="button"
                onClick={() => onMoveLayer(selectedLayerId, "up")}
                className="rounded-md bg-white border border-slate-200 p-1 text-slate-600 hover:bg-slate-100 hover:text-slate-900 shadow-xs"
                title="Lên trên"
              >
                <ArrowUp className="h-3 w-3" />
              </button>
              <button
                type="button"
                onClick={() => onMoveLayer(selectedLayerId, "down")}
                className="rounded-md bg-white border border-slate-200 p-1 text-slate-600 hover:bg-slate-100 hover:text-slate-900 shadow-xs"
                title="Xuống dưới"
              >
                <ArrowDown className="h-3 w-3" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Layer List */}
      <div className="flex-1 max-h-48 overflow-y-auto divide-y divide-slate-100 p-1.5 space-y-1">
        {layers.length === 0 ? (
          <div className="p-4 text-center text-xs text-slate-400 italic">
            Chưa có lớp nào. Hãy vẽ vùng đất hoặc tạo lộ trình bên cột trái.
          </div>
        ) : (
          layers.map((layer) => {
            const isSelected = selectedLayerId === layer.id;
            return (
              <div
                key={layer.id}
                onClick={() => onSelectLayer(layer.id)}
                className={`group relative flex items-center justify-between rounded-xl px-2.5 py-2 text-xs transition cursor-pointer border ${
                  isSelected
                    ? "bg-indigo-50/90 border-indigo-300 shadow-xs"
                    : "bg-slate-50/60 hover:bg-slate-100/80 border-slate-200/70"
                } ${!layer.visible ? "opacity-50" : "opacity-100"}`}
              >
                {/* Left info */}
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <span
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg shadow-xs"
                    style={{ backgroundColor: `${layer.color}20`, color: layer.color }}
                  >
                    {getLayerIcon(layer.type)}
                  </span>

                  {editingId === layer.id ? (
                    <input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onBlur={() => handleSaveRename(layer.id)}
                      onKeyDown={(e) => e.key === "Enter" && handleSaveRename(layer.id)}
                      autoFocus
                      className="rounded-lg bg-white px-2 py-0.5 text-xs text-slate-900 outline-none ring-2 ring-indigo-500 border border-slate-300 flex-1"
                    />
                  ) : (
                    <div className="min-w-0 flex-1">
                      <span className="font-semibold text-slate-800 truncate block">
                        {layer.name}
                      </span>
                      {layer.metadata?.areaM2 ? (
                        <span className="text-[10px] text-indigo-600 font-medium block">
                          {(layer.metadata.areaM2 / 10000).toFixed(2)} ha
                        </span>
                      ) : layer.metadata?.distanceMeters ? (
                        <span className="text-[10px] text-amber-600 font-medium block">
                          ~{(layer.metadata.distanceMeters / 1000).toFixed(1)} km
                        </span>
                      ) : null}
                    </div>
                  )}
                </div>

                {/* Right controls */}
                <div className="flex items-center gap-1 shrink-0 ml-2">
                  {/* Color Picker trigger */}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveColorPickerId(
                          activeColorPickerId === layer.id ? null : layer.id
                        );
                      }}
                      className="h-4 w-4 rounded-full border border-slate-300 shadow-xs hover:scale-110 transition"
                      style={{ backgroundColor: layer.color }}
                      title="Đổi màu Neon"
                    />
                    {activeColorPickerId === layer.id && (
                      <div className="absolute right-0 top-6 z-30 flex gap-1 rounded-xl bg-white p-1.5 shadow-xl border border-slate-200">
                        {GIS_NEON_COLORS.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onChangeLayerColor(layer.id, c.hex);
                              setActiveColorPickerId(null);
                            }}
                            className="h-4 w-4 rounded-full border border-slate-200 hover:scale-125 transition"
                            style={{ backgroundColor: c.hex }}
                            title={c.name}
                          />
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Rename */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleStartRename(layer);
                    }}
                    className="rounded p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-200/50"
                    title="Đổi tên"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>

                  {/* Duplicate */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDuplicateLayer(layer.id);
                    }}
                    className="rounded p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-200/50"
                    title="Nhân bản"
                  >
                    <Copy className="h-3 w-3" />
                  </button>

                  {/* Visibility Eye */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleLayerVisibility(layer.id);
                    }}
                    className={`rounded p-1 transition ${
                      layer.visible ? "text-indigo-600" : "text-slate-300 hover:text-slate-500"
                    }`}
                    title={layer.visible ? "Ẩn layer" : "Hiện layer"}
                  >
                    {layer.visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                  </button>

                  {/* Delete */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteLayer(layer.id);
                    }}
                    className="rounded p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition"
                    title="Xóa layer"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
