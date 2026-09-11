import { useCallback, useRef, type Dispatch, type PointerEvent, type RefObject, type SetStateAction } from 'react';
import type { EditorTool, ResizeCorner, SelectionBox, TemplateLayer } from './types';
import { clamp } from './utils';
import { snapToClosest } from './workspace-utils';

type Options = {
  canvasRef: RefObject<HTMLDivElement | null>;
  canvasSize: { width: number; height: number };
  layers: TemplateLayer[];
  setLayers: Dispatch<SetStateAction<TemplateLayer[]>>;
  selectedLayerIds: string[];
  setSelectedLayerIds: Dispatch<SetStateAction<string[]>>;
  setSelectedLayerId: Dispatch<SetStateAction<string>>;
  editingLayerId: string;
  setEditingLayerId: Dispatch<SetStateAction<string>>;
  setSelectionBox: Dispatch<SetStateAction<SelectionBox | null>>;
  setBackgroundSelected: Dispatch<SetStateAction<boolean>>;
  setActiveTool: Dispatch<SetStateAction<EditorTool>>;
  clearLayerSelection: () => void;
  selectLayer: (layerId: string) => void;
  recordLayerHistory: () => void;
  updateLayer: (layerId: string, updates: Partial<TemplateLayer>) => void;
};

export function useCanvasInteractions(options: Options) {
  const dragRef = useRef<{ layerId: string; layerIds: string[]; offsetX: number; offsetY: number } | null>(null);
  const resizeRef = useRef<{ layerId: string; corner: ResizeCorner; pointerX: number; startX: number; startY: number; startWidth: number; startHeight: number } | null>(null);
  const selectionRef = useRef<{ startX: number; startY: number; additive: boolean } | null>(null);
  const selectionBoxRef = useRef<SelectionBox | null>(null);
  const rotateRef = useRef<{ layerId: string; centerX: number; centerY: number; startAngle: number; startRotation: number } | null>(null);
  const cornerRadiusRef = useRef<{ layerId: string; pointerX: number; startRadius: number } | null>(null);

  const pickLayersInBox = useCallback((box: SelectionBox, additive: boolean) => {
    const selectedIds = options.layers.filter((layer) => {
      const layerRight = layer.x + layer.width;
      const layerBottom = layer.y + layer.height;
      const boxRight = box.left + box.width;
      const boxBottom = box.top + box.height;
      return layer.x < boxRight && layerRight > box.left && layer.y < boxBottom && layerBottom > box.top;
    }).map((layer) => layer.id);
    const nextIds = additive
      ? Array.from(new Set([...options.selectedLayerIds, ...selectedIds]))
      : selectedIds;
    options.setSelectedLayerIds(nextIds);
    options.setSelectedLayerId(nextIds[nextIds.length - 1] || '');
    options.setBackgroundSelected(false);
    options.setEditingLayerId('');
  }, [options]);

  const handleSelectionStart = (event: PointerEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    const rect = options.canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const startX = clamp((event.clientX - rect.left) / rect.width * 100, 0, 100);
    const startY = clamp((event.clientY - rect.top) / rect.height * 100, 0, 100);
    selectionRef.current = { startX, startY, additive: event.shiftKey };
    const initialBox = { left: startX, top: startY, width: 0, height: 0 };
    selectionBoxRef.current = initialBox;
    options.setSelectionBox(initialBox);
    options.setBackgroundSelected(false);
    options.setEditingLayerId('');
    if (!event.shiftKey) options.clearLayerSelection();
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleSelectionMove = (event: PointerEvent<HTMLDivElement>) => {
    const selection = selectionRef.current;
    const rect = options.canvasRef.current?.getBoundingClientRect();
    if (!selection || !rect || event.buttons === 0) return;
    const currentX = clamp((event.clientX - rect.left) / rect.width * 100, 0, 100);
    const currentY = clamp((event.clientY - rect.top) / rect.height * 100, 0, 100);
    const nextBox = {
      left: Math.min(selection.startX, currentX),
      top: Math.min(selection.startY, currentY),
      width: Math.abs(currentX - selection.startX),
      height: Math.abs(currentY - selection.startY),
    };
    selectionBoxRef.current = nextBox;
    options.setSelectionBox(nextBox);
  };

  const handleSelectionEnd = (event: PointerEvent<HTMLDivElement>) => {
    const selection = selectionRef.current;
    const box = selectionBoxRef.current;
    if (!selection) return;
    if (box && (box.width > 0.5 || box.height > 0.5)) pickLayersInBox(box, selection.additive);
    else {
      options.setBackgroundSelected(true);
      options.setActiveTool('background');
    }
    selectionRef.current = null;
    selectionBoxRef.current = null;
    options.setSelectionBox(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const handlePointerDown = (event: PointerEvent<HTMLElement>, layer: TemplateLayer) => {
    event.stopPropagation();
    const rect = options.canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    if (options.editingLayerId !== layer.id) options.setEditingLayerId('');
    if (event.shiftKey) {
      options.setSelectedLayerIds((current) => {
        const next = current.includes(layer.id) ? current.filter((id) => id !== layer.id) : [...current, layer.id];
        options.setSelectedLayerId(next[next.length - 1] || '');
        return next;
      });
    } else options.selectLayer(layer.id);
    options.setBackgroundSelected(false);
    if (event.shiftKey || layer.locked || options.editingLayerId === layer.id) return;
    options.recordLayerHistory();
    const dragLayerIds = layer.groupId
      ? options.layers.filter((item) => item.groupId === layer.groupId && !item.locked).map((item) => item.id)
      : options.selectedLayerIds.length > 1 && options.selectedLayerIds.includes(layer.id)
        ? options.layers.filter((item) => options.selectedLayerIds.includes(item.id) && !item.locked).map((item) => item.id)
        : [layer.id];
    dragRef.current = {
      layerId: layer.id,
      layerIds: dragLayerIds,
      offsetX: event.clientX - (rect.left + rect.width * layer.x / 100),
      offsetY: event.clientY - (rect.top + rect.height * layer.y / 100),
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: PointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    const rect = options.canvasRef.current?.getBoundingClientRect();
    if (!drag || !rect || event.buttons === 0) return;
    const layer = options.layers.find((item) => item.id === drag.layerId);
    if (!layer) return;
    const rawX = (event.clientX - rect.left - drag.offsetX) / rect.width * 100;
    const rawY = (event.clientY - rect.top - drag.offsetY) / rect.height * 100;
    const otherLayers = options.layers.filter((item) => !drag.layerIds.includes(item.id));
    const x = snapToClosest(rawX, [0, 6, 50 - layer.width / 2, 94 - layer.width, 100 - layer.width, ...otherLayers.flatMap((item) => [item.x, item.x + item.width - layer.width, item.x + item.width / 2 - layer.width / 2])]);
    const y = snapToClosest(rawY, [0, 6, 50 - layer.height / 2, 94 - layer.height, 100 - layer.height, ...otherLayers.flatMap((item) => [item.y, item.y + item.height - layer.height, item.y + item.height / 2 - layer.height / 2])]);
    const nextX = clamp(x, -50, 150);
    const nextY = clamp(y, -50, 150);
    if (drag.layerIds.length > 1) {
      const deltaX = nextX - layer.x;
      const deltaY = nextY - layer.y;
      options.setLayers((current) => current.map((item) => drag.layerIds.includes(item.id)
        ? { ...item, x: clamp(item.x + deltaX, -50, 150), y: clamp(item.y + deltaY, -50, 150) }
        : item));
    } else options.updateLayer(layer.id, { x: nextX, y: nextY });
  };

  const handlePointerUp = (event: PointerEvent<HTMLElement>) => {
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const handleResizeStart = (event: PointerEvent<HTMLButtonElement>, layer: TemplateLayer, corner: ResizeCorner) => {
    event.stopPropagation();
    if (layer.locked) return;
    options.recordLayerHistory();
    resizeRef.current = { layerId: layer.id, corner, pointerX: event.clientX, startX: layer.x, startY: layer.y, startWidth: layer.width, startHeight: layer.height };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleResizeMove = (event: PointerEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    const resize = resizeRef.current;
    const rect = options.canvasRef.current?.getBoundingClientRect();
    if (!resize || !rect || event.buttons === 0) return;
    const layer = options.layers.find((item) => item.id === resize.layerId);
    if (!layer) return;
    const deltaX = (event.clientX - resize.pointerX) / rect.width * 100;
    if (resize.corner === 'e') options.updateLayer(layer.id, { width: clamp(resize.startWidth + deltaX, 5, 100 - resize.startX) });
    else if (resize.corner === 'w') {
      const width = clamp(resize.startWidth - deltaX, 5, resize.startX + resize.startWidth);
      options.updateLayer(layer.id, { x: resize.startX + resize.startWidth - width, width });
    } else {
      const fromWest = resize.corner === 'nw' || resize.corner === 'sw';
      const fromNorth = resize.corner === 'nw' || resize.corner === 'ne';
      const ratio = resize.startHeight / resize.startWidth;
      const maxWidth = fromWest ? resize.startX + resize.startWidth : 100 - resize.startX;
      const maxHeight = fromNorth ? resize.startY + resize.startHeight : 100 - resize.startY;
      const width = clamp(resize.startWidth + (fromWest ? -deltaX : deltaX), 5, Math.max(5, Math.min(maxWidth, maxHeight / ratio)));
      const height = width * ratio;
      options.updateLayer(layer.id, { x: fromWest ? resize.startX + resize.startWidth - width : resize.startX, y: fromNorth ? resize.startY + resize.startHeight - height : resize.startY, width, height });
    }
  };

  const handleResizeEnd = (event: PointerEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    resizeRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const handleRotateStart = (event: PointerEvent<HTMLButtonElement>, layer: TemplateLayer) => {
    event.stopPropagation();
    const rect = options.canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    options.recordLayerHistory();
    const centerX = rect.left + rect.width * (layer.x + layer.width / 2) / 100;
    const centerY = rect.top + rect.height * (layer.y + layer.height / 2) / 100;
    rotateRef.current = { layerId: layer.id, centerX, centerY, startAngle: Math.atan2(event.clientY - centerY, event.clientX - centerX), startRotation: layer.rotation || 0 };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleRotateMove = (event: PointerEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    const rotate = rotateRef.current;
    if (!rotate || event.buttons === 0) return;
    const layer = options.layers.find((item) => item.id === rotate.layerId);
    if (!layer) return;
    const currentAngle = Math.atan2(event.clientY - rotate.centerY, event.clientX - rotate.centerX);
    let rotation = Math.round(rotate.startRotation + ((currentAngle - rotate.startAngle) * 180) / Math.PI);
    for (const target of [0, 90, 180, 270, -90, -180, -270, 360, -360]) {
      if (Math.abs(rotation - target) < 3) { rotation = target; break; }
    }
    options.updateLayer(layer.id, { rotation });
  };

  const handleRotateEnd = (event: PointerEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    rotateRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const handleCornerRadiusStart = (event: PointerEvent<HTMLButtonElement>, layer: TemplateLayer) => {
    event.stopPropagation();
    if (layer.locked) return;
    options.recordLayerHistory();
    cornerRadiusRef.current = { layerId: layer.id, pointerX: event.clientX, startRadius: layer.borderRadius || 0 };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleCornerRadiusMove = (event: PointerEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    const radiusDrag = cornerRadiusRef.current;
    const rect = options.canvasRef.current?.getBoundingClientRect();
    if (!radiusDrag || !rect || event.buttons === 0) return;
    const layer = options.layers.find((item) => item.id === radiusDrag.layerId);
    if (!layer) return;
    const canvasScale = rect.width / options.canvasSize.width;
    if (!Number.isFinite(canvasScale) || canvasScale <= 0) return;
    const maxRadius = Math.min(
      options.canvasSize.width * layer.width / 200,
      options.canvasSize.height * layer.height / 200,
    );
    const borderRadius = clamp(radiusDrag.startRadius + (event.clientX - radiusDrag.pointerX) / canvasScale, 0, maxRadius);
    options.updateLayer(layer.id, { borderRadius: Math.round(borderRadius) });
  };

  const handleCornerRadiusEnd = (event: PointerEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    cornerRadiusRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  return { handleSelectionStart, handleSelectionMove, handleSelectionEnd, handlePointerDown, handlePointerMove, handlePointerUp, handleResizeStart, handleResizeMove, handleResizeEnd, handleRotateStart, handleRotateMove, handleRotateEnd, handleCornerRadiusStart, handleCornerRadiusMove, handleCornerRadiusEnd };
}
