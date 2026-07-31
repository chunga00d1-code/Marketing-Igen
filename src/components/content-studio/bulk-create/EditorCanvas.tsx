import React from 'react';
import {
  Type,
  Image as ImageIcon,
  Lock,
  Unlock,
  Copy,
  Trash2,
  Move,
  RotateCw,
} from 'lucide-react';
import type {
  TemplateLayer,
  DataRow,
  EditorTool,
  LayerPresetDragPayload,
  ResizeCorner,
  SelectionBox,
} from './types';
import { clamp, getLayerFrameStyle, resolveTextFontSize } from './utils';
import { SceneLayerContent } from './SceneCanvas';

interface EditorCanvasProps {
  activeTool: EditorTool;
  layers: TemplateLayer[];
  activeRow: DataRow | null;
  selectedLayerId: string;
  selectedLayerIds: string[];
  editingLayerId: string;
  selectionBox: SelectionBox | null;
  backgroundSelected: boolean;
  backgroundColor: string;
  backgroundImage: string;
  canvasSize: { width: number; height: number };
  selectedBackground: { id: string; name: string; className: string; colors: string[] } | undefined;
  canvasDisplayWidth: number;
  canvasDisplayHeight: number;
  editorViewportRef: React.RefObject<HTMLDivElement | null>;
  canvasRef: React.RefObject<HTMLDivElement | null>;
  setSelectedLayerId: (id: string) => void;
  setEditingLayerId: (id: string) => void;
  setBackgroundSelected: (val: boolean) => void;
  changeLayer: (id: string, values: Partial<TemplateLayer>) => void;
  duplicateLayer: (layer: TemplateLayer) => void;
  removeLayer: (id: string) => void;
  removeSelectedLayers: () => void;
  duplicateSelectedLayers: () => void;
  toggleLockSelectedLayers: () => void;
  alignSelectedLayers: (
    alignment: 'left' | 'center-x' | 'right' | 'top' | 'center-y' | 'bottom' | 'distribute-x' | 'distribute-y',
  ) => void;
  toggleGroupSelectedLayers: () => void;
  handlePointerDown: (event: React.PointerEvent<HTMLElement>, layer: TemplateLayer) => void;
  handlePointerMove: (event: React.PointerEvent<HTMLElement>) => void;
  handlePointerUp: (event: React.PointerEvent<HTMLElement>) => void;
  handleSelectionStart: (event: React.PointerEvent<HTMLDivElement>) => void;
  handleSelectionMove: (event: React.PointerEvent<HTMLDivElement>) => void;
  handleSelectionEnd: (event: React.PointerEvent<HTMLDivElement>) => void;
  handleResizeStart: (
    event: React.PointerEvent<HTMLButtonElement>,
    layer: TemplateLayer,
    corner: ResizeCorner
  ) => void;
  handleResizeMove: (event: React.PointerEvent<HTMLButtonElement>) => void;
  handleResizeEnd: (event: React.PointerEvent<HTMLButtonElement>) => void;
  handleRotateStart: (event: React.PointerEvent<HTMLButtonElement>, layer: TemplateLayer) => void;
  handleRotateMove: (event: React.PointerEvent<HTMLButtonElement>) => void;
  handleRotateEnd: (event: React.PointerEvent<HTMLButtonElement>) => void;
  updateCell: (rowId: string, layerId: string, value: string) => void;
  recordLayerHistory: () => void;
  onOpenContextMenu: (clientX: number, clientY: number, targetLayerId: string) => void;
  onSetBackgroundImage: (url: string) => void;
  onDropAsset: (url: string, clientX: number, clientY: number) => void;
  onDropLayerPreset: (payload: LayerPresetDragPayload, clientX: number, clientY: number) => void;
}

export function EditorCanvas({
  activeTool,
  layers,
  activeRow,
  selectedLayerId,
  selectedLayerIds,
  editingLayerId,
  selectionBox,
  backgroundSelected,
  backgroundColor,
  backgroundImage,
  canvasSize,
  selectedBackground,
  canvasDisplayWidth,
  canvasDisplayHeight,
  editorViewportRef,
  canvasRef,
  setSelectedLayerId,
  setEditingLayerId,
  setBackgroundSelected,
  changeLayer,
  duplicateLayer,
  removeLayer,
  removeSelectedLayers,
  duplicateSelectedLayers,
  toggleLockSelectedLayers,
  alignSelectedLayers,
  toggleGroupSelectedLayers,
  handlePointerDown,
  handlePointerMove,
  handlePointerUp,
  handleSelectionStart,
  handleSelectionMove,
  handleSelectionEnd,
  handleResizeStart,
  handleResizeMove,
  handleResizeEnd,
  handleRotateStart,
  handleRotateMove,
  handleRotateEnd,
  updateCell,
  recordLayerHistory,
  onOpenContextMenu,
  onSetBackgroundImage,
  onDropAsset,
  onDropLayerPreset,
}: EditorCanvasProps) {
  const selectedLayer = layers.find((l) => l.id === selectedLayerId);
  const selectedLayers = layers.filter((layer) => selectedLayerIds.includes(layer.id));
  const multiSelected = selectedLayers.length > 1;
  const selectionBounds = selectedLayers.reduce<SelectionBox | null>((bounds, layer) => {
    const right = layer.x + layer.width;
    const bottom = layer.y + layer.height;
    if (!bounds) {
      return { left: layer.x, top: layer.y, width: layer.width, height: layer.height };
    }
    const left = Math.min(bounds.left, layer.x);
    const top = Math.min(bounds.top, layer.y);
    return {
      left,
      top,
      width: Math.max(bounds.left + bounds.width, right) - left,
      height: Math.max(bounds.top + bounds.height, bottom) - top,
    };
  }, null);

  return (
    <div
      ref={editorViewportRef}
      className="min-h-0 flex-1 overflow-auto overscroll-contain"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) {
          setSelectedLayerId('');
          setEditingLayerId('');
          setBackgroundSelected(false);
        }
      }}
    >
      <div
        className="flex items-center justify-center p-12"
        style={{
          minWidth: `${canvasDisplayWidth + 96}px`,
          minHeight: `${canvasDisplayHeight + 96}px`,
        }}
        onPointerDown={(event) => {
          if (event.target === event.currentTarget) {
            setSelectedLayerId('');
            setEditingLayerId('');
            setBackgroundSelected(false);
          }
        }}
      >
        <div
          className={`relative shrink-0 transition-shadow ${
            backgroundSelected ? 'ring-2 ring-violet-600 ring-offset-2' : ''
          }`}
          style={{ width: `${canvasDisplayWidth}px`, height: `${canvasDisplayHeight}px` }}
        >
          <div
            ref={canvasRef}
            onPointerDown={handleSelectionStart}
            onPointerMove={handleSelectionMove}
            onPointerUp={handleSelectionEnd}
            onPointerCancel={handleSelectionEnd}
            onDragOver={(event) => {
              if (
                event.dataTransfer.types.includes('application/x-igen-bulk-asset')
                || event.dataTransfer.types.includes('application/x-igen-bulk-layer-preset')
              ) {
                event.preventDefault();
                event.dataTransfer.dropEffect = 'copy';
              }
            }}
            onDrop={(event) => {
              const url = event.dataTransfer.getData('application/x-igen-bulk-asset');
              if (url) {
                event.preventDefault();
                event.stopPropagation();
                if (activeTool === 'background') {
                  onSetBackgroundImage(url);
                } else {
                  onDropAsset(url, event.clientX, event.clientY);
                }
                return;
              }
              const rawPreset = event.dataTransfer.getData('application/x-igen-bulk-layer-preset');
              if (!rawPreset) return;
              try {
                const payload = JSON.parse(rawPreset) as LayerPresetDragPayload;
                if (payload.type !== 'text' && payload.type !== 'image') return;
                event.preventDefault();
                event.stopPropagation();
                onDropLayerPreset(payload, event.clientX, event.clientY);
              } catch {
                // Ignore malformed drag data from outside the editor.
              }
            }}
            onContextMenu={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onOpenContextMenu(event.clientX, event.clientY, '');
            }}
            className={`absolute inset-0 cursor-default overflow-hidden bg-white shadow-[0_12px_40px_rgba(15,23,42,0.20)] ${
              backgroundImage ? '' : selectedBackground?.className || ''
            }`}
            style={{
              backgroundColor,
              ...(backgroundImage
                ? {
                    backgroundImage: `url(${backgroundImage})`,
                    backgroundPosition: 'center',
                    backgroundSize: 'cover',
                  }
                : {}),
            }}
          >
            {(selectedLayerIds.length > 0 || backgroundSelected) && (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-[6%] z-[1001] border border-dashed border-indigo-400/50"
              >
                <span className="absolute -top-5 left-0 rounded bg-indigo-600/85 px-1.5 py-0.5 text-[9px] font-bold text-white">
                  Vùng an toàn
                </span>
                <span className="absolute left-1/2 top-0 h-full border-l border-dashed border-indigo-400/25" />
                <span className="absolute left-0 top-1/2 w-full border-t border-dashed border-indigo-400/25" />
              </div>
            )}
            {layers.map((layer) => {
              const value = activeRow?.values[layer.id] || '';
              const selected = selectedLayerId === layer.id || selectedLayerIds.includes(layer.id);
              const singleSelected = selected && !multiSelected;
              const editing = editingLayerId === layer.id;

              return (
                <div
                  key={layer.id}
                  onPointerDown={(event) => handlePointerDown(event, layer)}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerCancel={handlePointerUp}
                  onDoubleClick={(event) => {
                    if (layer.type === 'text' && layer.layerKind !== 'shape' && !layer.locked) {
                      event.stopPropagation();
                      setEditingLayerId(layer.id);
                    }
                  }}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    setSelectedLayerId(layer.id);
                    onOpenContextMenu(event.clientX, event.clientY, layer.id);
                  }}
                  className={`group absolute touch-none text-left transition-[outline-color,background-color] ${
                    editing || (singleSelected && layer.type === 'text' && layer.layerKind !== 'shape') ? 'select-text' : 'select-none'
                  } ${
                    layer.locked
                      ? 'cursor-default'
                      : singleSelected && layer.type === 'text' && layer.layerKind !== 'shape'
                        ? 'cursor-text'
                        : 'cursor-move'
                  } ${
                    selected
                      ? 'outline outline-2 outline-violet-600'
                      : 'hover:bg-violet-500/5 hover:outline hover:outline-2 hover:outline-violet-500'
                  }`}
                  style={{
                    left: `${layer.x}%`,
                    top: `${layer.y}%`,
                    width: `${layer.width}%`,
                    height: `${layer.height}%`,
                    transform: `rotate(${layer.rotation}deg)`,
                    zIndex: layer.zIndex,
                    ...getLayerFrameStyle(layer, canvasDisplayWidth / canvasSize.width),
                  }}
                >
                  {layer.dataBinding && selected && (
                    <span
                      title={`Đã kết nối với cột ${layer.dataBinding.columnLabel}`}
                      className="pointer-events-none absolute -top-7 left-0 z-[1002] max-w-full truncate rounded-full bg-violet-600 px-2.5 py-1 text-[10px] font-extrabold text-white shadow-sm"
                    >
                      {layer.dataBinding.columnLabel}
                    </span>
                  )}
                  {layer.type === 'text' && layer.layerKind !== 'shape' && editing && !layer.locked && activeRow ? (
                      <textarea
                        autoFocus
                        value={value}
                        placeholder={layer.fieldName}
                        onFocus={recordLayerHistory}
                        onBlur={() => setEditingLayerId('')}
                        onKeyDown={(event) => {
                          if (event.key === 'Escape') {
                            setEditingLayerId('');
                            event.currentTarget.blur();
                          }
                        }}
                        onPointerDown={(event) => event.stopPropagation()}
                        onClick={(event) => event.stopPropagation()}
                        onChange={(event) => updateCell(activeRow.id, layer.id, event.target.value)}
                        className="block h-full w-full cursor-text resize-none overflow-hidden border-0 bg-transparent p-0 leading-tight text-current outline-none placeholder:text-current [text-shadow:0_2px_7px_rgba(15,23,42,0.5)] select-text"
                        style={{
                          color: layer.color,
                          fontFamily: layer.fontFamily,
                          fontWeight: layer.fontWeight,
                          fontStyle: layer.fontStyle || 'normal',
                          textDecoration: layer.textDecoration || 'none',
                          textTransform: layer.textTransform || 'none',
                          letterSpacing: `${
                            ((layer.letterSpacing || 0) * canvasDisplayWidth) / canvasSize.width
                          }px`,
                          lineHeight: layer.lineHeight || 1.22,
                          fontSize: `${
                            (resolveTextFontSize(layer, value || layer.defaultValue || layer.fieldName, canvasSize)
                              * canvasDisplayWidth) / canvasSize.width
                          }px`,
                          textAlign: layer.textAlign,
                        }}
                      />
                  ) : (
                    <SceneLayerContent
                      layer={layer}
                      value={value}
                      scale={canvasDisplayWidth / canvasSize.width}
                      showPlaceholder
                      canvas={canvasSize}
                    />
                  )}
                  {singleSelected && !layer.locked && (
                    <>
                      {/* Corner Handles (Circles) */}
                      {(['nw', 'ne', 'sw', 'se'] as ResizeCorner[]).map((corner) => {
                        const position =
                          corner === 'nw'
                            ? '-left-1.5 -top-1.5 cursor-nwse-resize'
                            : corner === 'ne'
                              ? '-right-1.5 -top-1.5 cursor-nesw-resize'
                              : corner === 'sw'
                                ? '-bottom-1.5 -left-1.5 cursor-nesw-resize'
                                : '-bottom-1.5 -right-1.5 cursor-nwse-resize';
                        return (
                          <button
                            key={corner}
                            type="button"
                            aria-label="Kéo để thay đổi kích thước"
                            title="Kéo để thay đổi kích thước"
                            onPointerDown={(event) => handleResizeStart(event, layer, corner)}
                            onPointerMove={handleResizeMove}
                            onPointerUp={handleResizeEnd}
                            onPointerCancel={handleResizeEnd}
                            className={`absolute h-3.5 w-3.5 touch-none rounded-full border-2 border-violet-600 bg-white shadow-md ${position}`}
                          />
                        );
                      })}

                      {/* Side Width Adjust Handles (Pills) */}
                      {(['w', 'e'] as ResizeCorner[]).map((side) => {
                        const position =
                          side === 'w'
                            ? '-left-1.5 top-[calc(50%-8px)] cursor-ew-resize'
                            : '-right-1.5 top-[calc(50%-8px)] cursor-ew-resize';
                        return (
                          <button
                            key={side}
                            type="button"
                            aria-label="Kéo để đổi chiều rộng"
                            title="Kéo để đổi chiều rộng"
                            onPointerDown={(event) => handleResizeStart(event, layer, side)}
                            onPointerMove={handleResizeMove}
                            onPointerUp={handleResizeEnd}
                            onPointerCancel={handleResizeEnd}
                            className={`absolute h-4 w-2.5 touch-none rounded-full border-2 border-violet-600 bg-white shadow-sm ${position}`}
                          />
                        );
                      })}

                      {/* Canva-style rotate handle: keep it beside the move handle so the floating toolbar never covers it. */}
                      <span className="pointer-events-none absolute left-[calc(50%-40px)] -bottom-9 z-[1000] h-7 -translate-x-1/2 border-l-2 border-violet-500" />
                      <button
                        type="button"
                        aria-label="Kéo để xoay"
                        onPointerDown={(event) => handleRotateStart(event, layer)}
                        onPointerMove={handleRotateMove}
                        onPointerUp={handleRotateEnd}
                        onPointerCancel={handleRotateEnd}
                        className="absolute left-[calc(50%-40px)] -bottom-12 z-[1001] flex h-8 w-8 -translate-x-1/2 touch-none items-center justify-center rounded-full border-2 border-violet-600 bg-white text-violet-600 shadow-[0_3px_10px_rgba(124,58,237,0.3)] transition hover:scale-110 hover:bg-violet-50 cursor-grab active:cursor-grabbing"
                        title="Kéo để xoay"
                      >
                        <RotateCw className="h-4 w-4" strokeWidth={2.5} />
                      </button>
                    </>
                  )}
                </div>
              );
            })}
            {selectionBox && (
              <div
                className="pointer-events-none absolute z-[2000] border-2 border-blue-500 bg-blue-500/10"
                style={{
                  left: `${selectionBox.left}%`,
                  top: `${selectionBox.top}%`,
                  width: `${selectionBox.width}%`,
                  height: `${selectionBox.height}%`,
                }}
              />
            )}
          </div>

          {multiSelected && selectionBounds && (
            <div
              className="absolute z-[1000] flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1.5 text-slate-700 shadow-[0_8px_28px_rgba(15,23,42,0.22)]"
              style={{
                left: `${clamp(selectionBounds.left + selectionBounds.width / 2, 18, 82)}%`,
                top: `${selectionBounds.top < 14 ? selectionBounds.top + selectionBounds.height : selectionBounds.top}%`,
                transform:
                  selectionBounds.top < 14 ? 'translate(-50%, 12px)' : 'translate(-50%, calc(-100% - 12px))',
              }}
              onPointerDown={(event) => event.stopPropagation()}
            >
              <span className="border-r border-slate-200 px-2 text-xs font-bold text-violet-700">
                {selectedLayers.length} mục
              </span>
              <button
                type="button"
                onClick={toggleLockSelectedLayers}
                className="rounded-lg p-2 hover:bg-slate-100"
                title="Khóa / mở khóa hàng loạt"
              >
                {selectedLayers.some((layer) => !layer.locked) ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
              </button>
              <button
                type="button"
                onClick={duplicateSelectedLayers}
                className="rounded-lg p-2 hover:bg-slate-100"
                title="Nhân bản hàng loạt"
              >
                <Copy className="h-4 w-4" />
              </button>
              {([
                ['left', '←'],
                ['center-x', '↔'],
                ['right', '→'],
                ['top', '↑'],
                ['center-y', '↕'],
                ['bottom', '↓'],
                ['distribute-x', '⋯'],
                ['distribute-y', '⋮'],
              ] as const).map(([alignment, label]) => (
                <button
                  key={alignment}
                  type="button"
                  onClick={() => alignSelectedLayers(alignment)}
                  className="rounded-lg px-1.5 py-2 text-sm font-black text-slate-600 hover:bg-indigo-50 hover:text-indigo-700"
                  title={`Căn ${alignment}`}
                >
                  {label}
                </button>
              ))}
              <button
                type="button"
                onClick={toggleGroupSelectedLayers}
                className="rounded-lg px-2 py-2 text-[10px] font-extrabold text-slate-600 hover:bg-indigo-50 hover:text-indigo-700"
                title={selectedLayers.every((layer) => layer.groupId) ? 'Bỏ nhóm' : 'Nhóm các layer'}
              >
                {selectedLayers.every((layer) => layer.groupId) ? 'Bỏ nhóm' : 'Nhóm'}
              </button>
              <button
                type="button"
                onClick={removeSelectedLayers}
                className="rounded-lg p-2 text-rose-600 hover:bg-rose-50"
                title="Xóa hàng loạt"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          )}

          {selectedLayer && !multiSelected && (
            <>
              <div
                className="absolute z-[1000] flex max-w-[260px] items-center gap-1 rounded-xl border border-slate-200 bg-white p-1.5 text-slate-700 shadow-[0_8px_28px_rgba(15,23,42,0.22)]"
                style={{
                  left: `${clamp(selectedLayer.x + selectedLayer.width / 2, 18, 82)}%`,
                  top: `${
                    selectedLayer.y < 14 ? selectedLayer.y + selectedLayer.height : selectedLayer.y
                  }%`,
                  transform:
                    selectedLayer.y < 14 ? 'translate(-50%, 12px)' : 'translate(-50%, calc(-100% - 12px))',
                }}
                onPointerDown={(event) => event.stopPropagation()}
              >
                <span className="flex min-w-0 items-center gap-1.5 border-r border-slate-200 px-2 text-xs font-bold">
                  <span className="text-violet-600">
                    {selectedLayer.type === 'text' ? (
                      <Type className="h-4 w-4" />
                    ) : (
                      <ImageIcon className="h-4 w-4" />
                    )}
                  </span>
                  <span className="max-w-24 truncate">{selectedLayer.fieldName}</span>
                </span>
                <button
                  type="button"
                  onClick={() => changeLayer(selectedLayer.id, { locked: !selectedLayer.locked })}
                  className="rounded-lg p-2 hover:bg-slate-100"
                  title={selectedLayer.locked ? 'Mở khóa' : 'Khóa'}
                >
                  {selectedLayer.locked ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
                </button>
                <button
                  type="button"
                  onClick={() => duplicateLayer(selectedLayer)}
                  className="rounded-lg p-2 hover:bg-slate-100"
                  title="Nhân bản"
                >
                  <Copy className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => removeLayer(selectedLayer.id)}
                  className="rounded-lg p-2 text-rose-600 hover:bg-rose-50"
                  title="Xóa"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              {!selectedLayer.locked && (
                <button
                  type="button"
                  aria-label="Kéo để di chuyển"
                  title="Giữ và kéo để di chuyển"
                  onPointerDown={(event) => handlePointerDown(event, selectedLayer)}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerCancel={handlePointerUp}
                  className="absolute z-[999] flex h-9 w-9 touch-none items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-lg hover:bg-violet-50 hover:text-violet-700"
                  style={{
                    left: `${selectedLayer.x + selectedLayer.width / 2}%`,
                    top: `${selectedLayer.y + selectedLayer.height}%`,
                    transform: 'translate(-50%, 12px)',
                  }}
                >
                  <Move className="h-4 w-4" />
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
