import React, { useMemo, useRef, useState } from 'react';
import {
  Crop, Eraser, Expand, MousePointer2, Pencil, Redo2, Sparkles, Undo2, X,
} from 'lucide-react';
import { geminiApi } from '../../api/gemini';
import { toast } from '../../pages/Toast';

type Tool = 'select' | 'draw' | 'crop';
type Point = { x: number; y: number };
type Region = { x: number; y: number; width: number; height: number };
type Stroke = { color: string; width: number; points: Point[] };
type EditResult = { url: string; record?: { _id?: string; id?: string } };

function isPoint(value: unknown): value is Point {
  if (!value || typeof value !== 'object') return false;
  const point = value as Partial<Point>;
  return Number.isFinite(point.x) && Number.isFinite(point.y);
}

function validStrokePoints(stroke: Stroke): Point[] {
  return Array.isArray(stroke?.points) ? stroke.points.filter(isPoint) : [];
}

interface ImageDetailEditorProps {
  imageUrl: string;
  sourceMediaId?: string;
  aspectRatio: string;
  modelName: string;
  resolution: string;
  supportingImageUris?: string[];
  onClose: () => void;
  onEdited: (result: EditResult) => void;
}

const COLORS = ['#facc15', '#ef4444', '#22c55e', '#06b6d4', '#a855f7'];

function normalizeRegion(start: Point, end: Point): Region {
  // Keep the minimum visible size while ensuring the API region never
  // crosses the normalized image boundary (especially when dragging from an
  // edge or clicking without dragging).
  const x = Math.min(Math.min(start.x, end.x), 0.995);
  const y = Math.min(Math.min(start.y, end.y), 0.995);
  return {
    x,
    y,
    width: Math.min(1 - x, Math.max(0.005, Math.abs(end.x - start.x))),
    height: Math.min(1 - y, Math.max(0.005, Math.abs(end.y - start.y))),
  };
}

function pathForStroke(stroke: Stroke): string {
  return validStrokePoints(stroke).map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x * 1000} ${point.y * 1000}`).join(' ');
}

export function ImageDetailEditor({
  imageUrl,
  sourceMediaId,
  aspectRatio,
  modelName,
  resolution,
  supportingImageUris,
  onClose,
  onEdited,
}: ImageDetailEditorProps) {
  const [tool, setTool] = useState<Tool>('select');
  const [instruction, setInstruction] = useState('');
  const [regionNote, setRegionNote] = useState('');
  const [selection, setSelection] = useState<Region | undefined>();
  const [crop, setCrop] = useState<Region | undefined>();
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [redoStrokes, setRedoStrokes] = useState<Stroke[]>([]);
  const [activeColor, setActiveColor] = useState(COLORS[0]);
  const [useSupportingReferences, setUseSupportingReferences] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const dragStart = useRef<Point | null>(null);
  const activeStroke = useRef<Stroke | null>(null);

  const activeDescription = useMemo(() => {
    if (tool === 'crop') return 'Kéo để chọn khung hình cho kết quả render.';
    if (tool === 'draw') return 'Phác họa trực tiếp vùng cần AI chú ý.';
    return 'Kéo để khoanh vùng cần chỉnh sửa.';
  }, [tool]);
  const drawnRegion = useMemo<Region | undefined>(() => {
    const points = strokes.flatMap((stroke) => validStrokePoints(stroke));
    if (!points.length) return undefined;
    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
    const padding = 0.025;
    const x = Math.max(0, Math.min(...xs) - padding);
    const y = Math.max(0, Math.min(...ys) - padding);
    return {
      x,
      y,
      width: Math.min(1 - x, Math.max(...xs) - Math.min(...xs) + padding * 2),
      height: Math.min(1 - y, Math.max(...ys) - Math.min(...ys) + padding * 2),
    };
  }, [strokes]);

  const pointFromEvent = (event: React.PointerEvent<SVGSVGElement>): Point => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)),
    };
  };

  const handlePointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    const point = pointFromEvent(event);
    event.currentTarget.setPointerCapture(event.pointerId);
    if (tool === 'draw') {
      const stroke: Stroke = { color: activeColor, width: 0.008, points: [point] };
      activeStroke.current = stroke;
      setStrokes((current) => [...current, stroke]);
      setRedoStrokes([]);
      return;
    }
    dragStart.current = point;
    if (tool === 'crop') setCrop(normalizeRegion(point, point));
    else setSelection(normalizeRegion(point, point));
  };

  const handlePointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const point = pointFromEvent(event);
    if (tool === 'draw' && activeStroke.current) {
      const nextStroke: Stroke = {
        ...activeStroke.current,
        points: [...validStrokePoints(activeStroke.current), point],
      };
      // Keep the ref in sync with the immutable snapshot queued in state. If
      // pointer-up happens before React flushes the updater, it can no longer
      // produce a `{ points: undefined }` stroke.
      activeStroke.current = nextStroke;
      setStrokes((current) => [...current.slice(0, -1), nextStroke]);
      return;
    }
    if (!dragStart.current) return;
    if (tool === 'crop') setCrop(normalizeRegion(dragStart.current, point));
    else setSelection(normalizeRegion(dragStart.current, point));
  };

  const handlePointerUp = () => {
    dragStart.current = null;
    activeStroke.current = null;
  };

  const createAnnotationImage = async (): Promise<string | undefined> => {
    if (!selection && !crop && !drawnRegion && strokes.length === 0) return undefined;

    const sourceImage = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.crossOrigin = 'anonymous';
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Không thể tạo ảnh đánh dấu từ ảnh nguồn.'));
      image.src = imageUrl;
    });
    const maxDimension = 1600;
    const scale = Math.min(1, maxDimension / Math.max(sourceImage.naturalWidth, sourceImage.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(sourceImage.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(sourceImage.naturalHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) return undefined;
    context.drawImage(sourceImage, 0, 0, canvas.width, canvas.height);

    const drawRegion = (region: Region, color: string) => {
      context.save();
      context.strokeStyle = color;
      context.lineWidth = Math.max(3, Math.round(canvas.width * 0.004));
      context.setLineDash([12, 8]);
      context.strokeRect(region.x * canvas.width, region.y * canvas.height, region.width * canvas.width, region.height * canvas.height);
      context.restore();
    };
    if (selection) drawRegion(selection, '#22d3ee');
    if (drawnRegion && !selection) drawRegion(drawnRegion, '#22d3ee');
    if (crop) drawRegion(crop, '#facc15');
    for (const stroke of strokes) {
      const points = validStrokePoints(stroke);
      if (points.length === 0) continue;
      context.save();
      context.strokeStyle = stroke.color;
      context.lineWidth = Math.max(4, stroke.width * canvas.width);
      context.lineCap = 'round';
      context.lineJoin = 'round';
      context.beginPath();
      points.forEach((point, index) => {
        const x = point.x * canvas.width;
        const y = point.y * canvas.height;
        if (index === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      });
      context.stroke();
      context.restore();
    }

    let annotation = canvas.toDataURL('image/jpeg', 0.82);
    if (annotation.length > 1_900_000) annotation = canvas.toDataURL('image/jpeg', 0.62);
    return annotation.length <= 2_000_000 ? annotation : undefined;
  };

  const undoStroke = () => {
    setStrokes((current) => {
      const removed = current[current.length - 1];
      if (removed) setRedoStrokes((redo) => [...redo, removed]);
      return current.slice(0, -1);
    });
  };

  const redoStroke = () => {
    setRedoStrokes((current) => {
      const restored = current[current.length - 1];
      if (restored) setStrokes((items) => [...items, restored]);
      return current.slice(0, -1);
    });
  };

  const submitEdit = async () => {
    if (!instruction.trim()) {
      toast.warning('Hãy nhập prompt mô tả ảnh bạn muốn chỉnh sửa.');
      return;
    }
    setIsEditing(true);
    try {
      let annotationImageUrl: string | undefined;
      try {
        annotationImageUrl = await createAnnotationImage();
      } catch (annotationError) {
        console.warn('[ImageDetailEditor] Không thể tạo ảnh đánh dấu:', annotationError);
      }
      const result = await geminiApi.editImage({
        sourceImageUrl: imageUrl,
        sourceMediaId,
        instruction: instruction.trim(),
        regionNote: regionNote.trim(),
        region: selection || drawnRegion,
        crop,
        strokes: strokes
          .map((stroke) => ({ ...stroke, points: validStrokePoints(stroke) }))
          .filter((stroke) => stroke.points.length > 0),
        supportingImageUris: useSupportingReferences ? supportingImageUris : [],
        annotationImageUrl,
        requestId: typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `image-edit-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        aspectRatio,
        modelName,
        resolution,
        preserveOutsideRegion: Boolean(selection || drawnRegion),
      });
      onEdited(result);
      toast.success('Đã tạo phiên bản ảnh đã cải thiện.');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Đã xảy ra lỗi không xác định.';
      toast.error(`Không thể cải thiện ảnh: ${message}`);
    } finally {
      setIsEditing(false);
    }
  };

  const toolButtonClass = (value: Tool) => `flex flex-col items-center gap-1 rounded-xl px-3 py-2 text-[10px] font-bold transition-colors ${tool === value
    ? 'bg-cyan-500 text-white shadow-sm'
    : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'
    }`;

  return (
    <div className="fixed inset-0 z-[110] flex flex-col overflow-y-auto bg-slate-950/95 text-white lg:flex-row lg:overflow-hidden">
      <section className="relative flex min-h-[55vh] min-w-0 flex-1 flex-col lg:min-h-0">
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-white/10 px-4 md:px-6">
          <div>
            <h2 className="text-sm font-bold">Chỉnh sửa chi tiết</h2>
            <p className="text-[11px] text-slate-400">Prompt là yêu cầu chính; vùng khoanh và phác họa chỉ dẫn vị trí cần sửa.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-2 text-slate-300 transition hover:bg-white/10 hover:text-white" title="Đóng">
            <X className="h-5 w-5" />
          </button>
        </header>

        <main className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-4 md:p-8">
          <div className="relative inline-block max-h-full max-w-full rounded-xl bg-slate-900 shadow-2xl">
            <img src={imageUrl} alt="Ảnh nguồn để chỉnh sửa" className="block max-h-[68vh] max-w-full rounded-xl object-contain" draggable={false} />
            <svg
              viewBox="0 0 1000 1000"
              preserveAspectRatio="none"
              className={`absolute inset-0 h-full w-full touch-none ${tool === 'draw' ? 'cursor-crosshair' : 'cursor-crosshair'}`}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
            >
              {strokes.map((stroke, index) => {
                const points = validStrokePoints(stroke);
                if (!points.length) return null;
                return <path key={index} d={pathForStroke(stroke)} fill="none" stroke={stroke.color} strokeWidth={stroke.width * 1000} strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />;
              })}
              {selection && (
                <rect x={selection.x * 1000} y={selection.y * 1000} width={selection.width * 1000} height={selection.height * 1000} fill="rgba(34,211,238,0.14)" stroke="#22d3ee" strokeWidth="4" strokeDasharray="12 8" />
              )}
              {crop && (
                <rect x={crop.x * 1000} y={crop.y * 1000} width={crop.width * 1000} height={crop.height * 1000} fill="rgba(250,204,21,0.1)" stroke="#facc15" strokeWidth="4" strokeDasharray="12 8" />
              )}
            </svg>
          </div>
        </main>

        <footer className="flex shrink-0 items-center justify-center gap-1 border-t border-white/10 px-3 py-3">
          <button type="button" onClick={() => setTool('select')} className={toolButtonClass('select')}><MousePointer2 className="h-4 w-4" />Khoanh vùng</button>
          <button type="button" onClick={() => setTool('draw')} className={toolButtonClass('draw')}><Pencil className="h-4 w-4" />Phác họa</button>
          <button type="button" onClick={() => setTool('crop')} className={toolButtonClass('crop')}><Crop className="h-4 w-4" />Crop</button>
          <span className="mx-1 h-8 w-px bg-white/10" />
          <button type="button" onClick={undoStroke} disabled={!strokes.length} className="rounded-lg p-2 text-slate-300 transition hover:bg-white/10 disabled:opacity-30" title="Hoàn tác nét vẽ"><Undo2 className="h-4 w-4" /></button>
          <button type="button" onClick={redoStroke} disabled={!redoStrokes.length} className="rounded-lg p-2 text-slate-300 transition hover:bg-white/10 disabled:opacity-30" title="Làm lại nét vẽ"><Redo2 className="h-4 w-4" /></button>
          <button type="button" onClick={() => { setStrokes([]); setRedoStrokes([]); setSelection(undefined); setCrop(undefined); }} className="rounded-lg p-2 text-slate-300 transition hover:bg-white/10" title="Xóa tất cả đánh dấu"><Eraser className="h-4 w-4" /></button>
          {tool === 'draw' && <div className="ml-2 flex gap-1">{COLORS.map((color) => <button key={color} type="button" onClick={() => setActiveColor(color)} className={`h-5 w-5 rounded-full border-2 ${activeColor === color ? 'border-white' : 'border-transparent'}`} style={{ backgroundColor: color }} aria-label={`Chọn màu ${color}`} />)}</div>}
        </footer>
      </section>

      <aside className="flex w-full shrink-0 flex-col border-t border-white/10 bg-slate-900 p-4 md:p-5 lg:w-[360px] lg:border-l lg:border-t-0">
        <div className="mb-4 flex items-center gap-2 text-xs font-bold text-cyan-300"><Expand className="h-4 w-4" /> Ngữ cảnh chỉnh sửa</div>
        <label className="mb-1.5 text-xs font-bold text-slate-200">Prompt chỉnh sửa</label>
        <textarea value={instruction} onChange={(event) => setInstruction(event.target.value)} placeholder="Ví dụ: Thay bánh trước bằng bánh nan hoa màu đen, giữ nguyên toàn bộ xe." className="h-32 w-full resize-none rounded-xl border border-white/10 bg-slate-950/60 p-3 text-xs leading-relaxed text-white outline-none placeholder:text-slate-600 focus:border-cyan-500" />
        <label className="mb-1.5 mt-4 text-xs font-bold text-slate-200">Ghi chú vùng chọn <span className="font-normal text-slate-500">(không bắt buộc)</span></label>
        <textarea value={regionNote} onChange={(event) => setRegionNote(event.target.value)} placeholder="Ví dụ: Chỉ thay đổi vành, lốp và đĩa phanh trong vùng khoanh." className="h-24 w-full resize-none rounded-xl border border-white/10 bg-slate-950/60 p-3 text-xs leading-relaxed text-white outline-none placeholder:text-slate-600 focus:border-cyan-500" />
        <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-3 text-[11px] leading-relaxed text-slate-400">
          <p className="font-semibold text-slate-200">{activeDescription}</p>
          <p className="mt-1">{selection || drawnRegion ? 'AI sẽ ưu tiên giữ nguyên vùng ngoài khu vực đã đánh dấu.' : 'Không có vùng đánh dấu: prompt sẽ áp dụng trên toàn ảnh.'}</p>
          {crop && <p className="mt-1 text-amber-300">Khung vàng sẽ là bố cục đầu ra mong muốn.</p>}
        </div>
        {supportingImageUris && supportingImageUris.length > 0 && (
          <label className="mt-3 flex items-start gap-2 rounded-xl border border-white/10 bg-white/5 p-3 text-[11px] leading-relaxed text-slate-300">
            <input
              type="checkbox"
              checked={useSupportingReferences}
              onChange={(event) => setUseSupportingReferences(event.target.checked)}
              className="mt-0.5 accent-cyan-500"
            />
            <span>Dùng ảnh tham khảo đầu vào cho lần sửa này <span className="text-slate-500">(mặc định tắt để tránh ảnh cũ ảnh hưởng phiên bản mới)</span></span>
          </label>
        )}
        <button type="button" onClick={submitEdit} disabled={isEditing} className="mt-auto flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-500 px-4 py-3 text-xs font-bold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60">
          {isEditing ? <span className="animate-pulse">Đang cải thiện ảnh...</span> : <><Sparkles className="h-4 w-4" />Cải thiện ảnh theo prompt</>}
        </button>
      </aside>
    </div>
  );
}
