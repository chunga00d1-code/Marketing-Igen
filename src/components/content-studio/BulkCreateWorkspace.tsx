import { useMemo, useRef, useState } from 'react';
import {
  Check,
  ChevronDown,
  Copy,
  FileSpreadsheet,
  Image as ImageIcon,
  ImagePlus,
  Layers3,
  Minus,
  MousePointer2,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Sparkles,
  Trash2,
  Type,
  Upload,
} from 'lucide-react';

type EditorTool = 'background' | 'text' | 'image' | 'data';
type LayerType = 'text' | 'image';

interface TemplateLayer {
  id: string;
  type: LayerType;
  label: string;
  x: number;
  y: number;
  width: number;
  fontSize: number;
  color: string;
}

interface DataRow {
  id: string;
  values: Record<string, string>;
}

const BACKGROUNDS = [
  { id: 'clean', name: 'Tối giản', className: 'bg-gradient-to-br from-white via-slate-50 to-indigo-100' },
  { id: 'business', name: 'Doanh nghiệp', className: 'bg-gradient-to-br from-blue-950 via-indigo-700 to-sky-400' },
  { id: 'sale', name: 'Khuyến mãi', className: 'bg-gradient-to-br from-orange-400 via-rose-500 to-fuchsia-700' },
  { id: 'nature', name: 'Tự nhiên', className: 'bg-gradient-to-br from-emerald-800 via-teal-600 to-lime-300' },
];

const TOOLS: Array<{ id: EditorTool; label: string; icon: typeof Layers3 }> = [
  { id: 'background', label: 'Mẫu nền', icon: Layers3 },
  { id: 'text', label: 'Văn bản', icon: Type },
  { id: 'image', label: 'Hình ảnh', icon: ImageIcon },
  { id: 'data', label: 'Dữ liệu', icon: FileSpreadsheet },
];

function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function createRow(layers: TemplateLayer[], values: Record<string, string> = {}): DataRow {
  return {
    id: makeId('row'),
    values: Object.fromEntries(layers.map((layer) => [layer.id, values[layer.id] || ''])),
  };
}

function readImage(file: File, onLoad: (value: string) => void) {
  const reader = new FileReader();
  reader.onload = () => onLoad(String(reader.result || ''));
  reader.readAsDataURL(file);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function BulkCreateWorkspace() {
  const canvasRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ layerId: string; offsetX: number; offsetY: number } | null>(null);
  const resizeRef = useRef<{ layerId: string; startX: number; startWidth: number } | null>(null);
  const [activeTool, setActiveTool] = useState<EditorTool>('background');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [backgroundId, setBackgroundId] = useState('business');
  const [backgroundImage, setBackgroundImage] = useState('');
  const [layers, setLayers] = useState<TemplateLayer[]>([]);
  const [selectedLayerId, setSelectedLayerId] = useState('');
  const [rows, setRows] = useState<DataRow[]>([createRow([])]);
  const [activeRowId, setActiveRowId] = useState(rows[0].id);
  const [sheetInput, setSheetInput] = useState('');
  const [generatedCount, setGeneratedCount] = useState(0);

  const selectedBackground = BACKGROUNDS.find((background) => background.id === backgroundId);
  const selectedLayer = layers.find((layer) => layer.id === selectedLayerId) || null;
  const activeRow = rows.find((row) => row.id === activeRowId) || rows[0];
  const readyCount = useMemo(
    () => rows.filter((row) => layers.length > 0 && layers.every((layer) => row.values[layer.id]?.trim())).length,
    [layers, rows]
  );

  const updateLayer = (layerId: string, updates: Partial<TemplateLayer>) => {
    setLayers((current) => current.map((layer) => layer.id === layerId ? { ...layer, ...updates } : layer));
  };

  const addLayer = (type: LayerType, initialValue = '') => {
    const number = layers.filter((layer) => layer.type === type).length + 1;
    const layer: TemplateLayer = {
      id: makeId('field'),
      type,
      label: type === 'text' ? `Nội dung chữ ${number}` : `Hình ảnh ${number}`,
      x: type === 'text' ? 10 : 30,
      y: type === 'text' ? 12 + (number - 1) * 12 : 38,
      width: type === 'text' ? 80 : 40,
      fontSize: type === 'text' ? 34 : 24,
      color: '#ffffff',
    };
    setLayers((current) => [...current, layer]);
    setRows((current) => current.map((row, index) => ({
      ...row,
      values: { ...row.values, [layer.id]: index === 0 ? initialValue : '' },
    })));
    setSelectedLayerId(layer.id);
    setActiveTool(type);
  };

  const removeLayer = (layerId: string) => {
    setLayers((current) => current.filter((layer) => layer.id !== layerId));
    setRows((current) => current.map((row) => {
      const values = { ...row.values };
      delete values[layerId];
      return { ...row, values };
    }));
    setSelectedLayerId('');
  };

  const updateCell = (rowId: string, layerId: string, value: string) => {
    setRows((current) => current.map((row) => row.id === rowId
      ? { ...row, values: { ...row.values, [layerId]: value } }
      : row));
  };

  const addRow = () => {
    const row = createRow(layers);
    setRows((current) => [...current, row]);
    setActiveRowId(row.id);
  };

  const duplicateRow = (row: DataRow) => {
    const duplicated = createRow(layers, row.values);
    setRows((current) => [...current, duplicated]);
    setActiveRowId(duplicated.id);
  };

  const removeRow = (rowId: string) => {
    if (rows.length === 1) {
      const replacement = createRow(layers);
      setRows([replacement]);
      setActiveRowId(replacement.id);
      return;
    }
    const nextRows = rows.filter((row) => row.id !== rowId);
    setRows(nextRows);
    if (activeRowId === rowId) setActiveRowId(nextRows[0].id);
  };

  const importSheet = () => {
    const lines = sheetInput.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (lines.length === 0 || layers.length === 0) return;
    const imported = lines.map((line) => {
      const cells = line.split('\t');
      return createRow(layers, Object.fromEntries(layers.map((layer, index) => [layer.id, cells[index]?.trim() || ''])));
    });
    setRows(imported);
    setActiveRowId(imported[0].id);
    setSheetInput('');
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>, layer: TemplateLayer) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    setSelectedLayerId(layer.id);
    dragRef.current = {
      layerId: layer.id,
      offsetX: event.clientX - (rect.left + rect.width * layer.x / 100),
      offsetY: event.clientY - (rect.top + rect.height * layer.y / 100),
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!drag || !rect || event.buttons === 0) return;
    const layer = layers.find((item) => item.id === drag.layerId);
    if (!layer) return;
    const x = (event.clientX - rect.left - drag.offsetX) / rect.width * 100;
    const y = (event.clientY - rect.top - drag.offsetY) / rect.height * 100;
    updateLayer(layer.id, {
      x: clamp(x, 0, Math.max(0, 100 - layer.width)),
      y: clamp(y, 0, layer.type === 'image' ? 75 : 92),
    });
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const handleResizeStart = (event: React.PointerEvent<HTMLButtonElement>, layer: TemplateLayer) => {
    event.stopPropagation();
    resizeRef.current = { layerId: layer.id, startX: event.clientX, startWidth: layer.width };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleResizeMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    const resize = resizeRef.current;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!resize || !rect || event.buttons === 0) return;
    const layer = layers.find((item) => item.id === resize.layerId);
    if (!layer) return;
    const delta = (event.clientX - resize.startX) / rect.width * 100;
    updateLayer(layer.id, { width: clamp(resize.startWidth + delta, 10, Math.max(10, 100 - layer.x)) });
  };

  const handleResizeEnd = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    resizeRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  return (
    <div className="relative mx-auto flex h-[calc(100vh-150px)] min-h-[720px] w-full max-w-[1700px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <nav className="flex w-[88px] shrink-0 flex-col border-r border-slate-200 bg-white py-3">
        <div className="mb-3 flex items-center justify-center"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white"><Sparkles className="h-5 w-5" /></div></div>
        {TOOLS.map((tool) => {
          const Icon = tool.icon;
          const active = activeTool === tool.id;
          return (
            <button key={tool.id} type="button" onClick={() => { if (active && sidebarOpen) setSidebarOpen(false); else { setActiveTool(tool.id); setSidebarOpen(true); } }} className={`mx-2 mb-1 flex min-h-[68px] flex-col items-center justify-center gap-1.5 rounded-xl px-1 text-xs font-bold transition ${active && sidebarOpen ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50'}`}>
              <Icon className="h-5 w-5" />{tool.label}
              {tool.id === 'data' && layers.length > 0 && <span className="absolute hidden" />}
            </button>
          );
        })}
      </nav>

      <aside className={`flex shrink-0 flex-col overflow-hidden border-r border-slate-200 bg-white transition-[width] duration-200 ${sidebarOpen ? 'w-[340px]' : 'w-0 border-r-0'}`}>
        <div className="w-[340px]">
          <EditorPanel
          activeTool={activeTool}
          backgroundId={backgroundId}
          backgroundImage={backgroundImage}
          layers={layers}
          rows={rows}
          activeRowId={activeRowId}
          sheetInput={sheetInput}
          onBackground={(id) => { setBackgroundId(id); setBackgroundImage(''); }}
          onBackgroundUpload={(value) => { setBackgroundImage(value); setBackgroundId(''); }}
          onAddLayer={addLayer}
          onSelectLayer={setSelectedLayerId}
          onSheetInput={setSheetInput}
          onImportSheet={importSheet}
          onAddRow={addRow}
          onSelectRow={setActiveRowId}
          onUpdateCell={updateCell}
          onDuplicateRow={duplicateRow}
          onRemoveRow={removeRow}
          onClose={() => setSidebarOpen(false)}
          />
        </div>
      </aside>

      <div className="relative z-30 w-0 shrink-0">
        <button type="button" onClick={() => setSidebarOpen((current) => !current)} className="absolute -left-4 top-20 flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-md hover:text-indigo-600" title={sidebarOpen ? 'Ẩn bảng tùy chọn' : 'Mở bảng tùy chọn'}>
          {sidebarOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
        </button>
      </div>

      <main className="flex min-w-0 flex-1 flex-col bg-[#f4f5f7]">
        <div className="flex min-h-16 shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white px-4">
          {selectedLayer ? (
            <div className="flex min-w-0 items-center gap-3">
              <input value={selectedLayer.label} onChange={(event) => updateLayer(selectedLayer.id, { label: event.target.value })} className="h-10 w-48 rounded-lg border border-slate-200 px-3 text-sm font-bold outline-none focus:border-indigo-500" aria-label="Tên trường" />
              {selectedLayer.type === 'text' && <><button type="button" onClick={() => updateLayer(selectedLayer.id, { fontSize: Math.max(12, selectedLayer.fontSize - 2) })} className="rounded-lg border border-slate-200 p-2"><Minus className="h-4 w-4" /></button><span className="w-9 text-center text-sm font-bold">{selectedLayer.fontSize}</span><button type="button" onClick={() => updateLayer(selectedLayer.id, { fontSize: Math.min(80, selectedLayer.fontSize + 2) })} className="rounded-lg border border-slate-200 p-2"><Plus className="h-4 w-4" /></button><input type="color" value={selectedLayer.color} onChange={(event) => updateLayer(selectedLayer.id, { color: event.target.value })} className="h-9 w-9 cursor-pointer rounded border-0 bg-transparent" title="Màu chữ" /></>}
              <button type="button" onClick={() => updateLayer(selectedLayer.id, { width: Math.max(15, selectedLayer.width - 5) })} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold">Thu nhỏ</button>
              <button type="button" onClick={() => updateLayer(selectedLayer.id, { width: Math.min(95, selectedLayer.width + 5) })} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold">Phóng to</button>
              <button type="button" onClick={() => removeLayer(selectedLayer.id)} className="rounded-lg p-2 text-rose-600 hover:bg-rose-50" title="Xóa"><Trash2 className="h-5 w-5" /></button>
            </div>
          ) : <div className="flex items-center gap-2 text-sm font-medium text-slate-500"><MousePointer2 className="h-4 w-4" /> Chọn chữ hoặc ảnh trên mẫu để chỉnh sửa</div>}
          <button type="button" onClick={() => setGeneratedCount(readyCount)} disabled={readyCount === 0} className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl bg-indigo-600 px-5 text-sm font-extrabold text-white hover:bg-indigo-700 disabled:bg-slate-300"><Sparkles className="h-4 w-4" /> Tạo {readyCount} thiết kế</button>
        </div>

        {generatedCount > 0 && <div className="mx-5 mt-4 flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800"><span className="inline-flex items-center gap-2"><Check className="h-4 w-4" /> Đã kiểm tra thành công {generatedCount} thiết kế trong bản thử.</span><button type="button" onClick={() => setGeneratedCount(0)} className="text-emerald-700">Đóng</button></div>}

        <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-8">
          <div>
            <div ref={canvasRef} className={`relative aspect-square w-[min(62vh,620px)] min-w-[420px] overflow-hidden bg-white shadow-[0_10px_35px_rgba(15,23,42,0.18)] ${backgroundImage ? '' : selectedBackground?.className || ''}`} style={backgroundImage ? { backgroundImage: `url(${backgroundImage})`, backgroundPosition: 'center', backgroundSize: 'cover' } : undefined}>
              {layers.map((layer) => {
                const value = activeRow?.values[layer.id] || '';
                const selected = selectedLayerId === layer.id;
                return (
                  <div
                    key={layer.id}
                    onPointerDown={(event) => handlePointerDown(event, layer)}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onPointerCancel={handlePointerUp}
                    className={`absolute cursor-move touch-none select-none text-left ${selected ? 'outline outline-2 outline-indigo-500' : 'hover:outline hover:outline-1 hover:outline-indigo-300'}`}
                    style={{ left: `${layer.x}%`, top: `${layer.y}%`, width: `${layer.width}%` }}
                  >
                    {layer.type === 'text' ? <span className="block whitespace-pre-wrap font-black leading-tight [text-shadow:0_2px_7px_rgba(15,23,42,0.5)]" style={{ color: layer.color, fontSize: `${layer.fontSize}px` }}>{value || layer.label}</span> : value ? <img src={value} alt={layer.label} className="block h-auto w-full object-contain" draggable={false} /> : <span className="flex aspect-square w-full items-center justify-center border-2 border-dashed border-white/80 bg-slate-900/20 p-3 text-center text-sm font-bold text-white"><ImagePlus className="mr-2 h-5 w-5" /> {layer.label}</span>}
                    {selected && <>
                      <span className="pointer-events-none absolute -left-1.5 -top-1.5 h-3 w-3 rounded-sm border border-indigo-600 bg-white" />
                      <span className="pointer-events-none absolute -right-1.5 -top-1.5 h-3 w-3 rounded-sm border border-indigo-600 bg-white" />
                      <span className="pointer-events-none absolute -bottom-1.5 -left-1.5 h-3 w-3 rounded-sm border border-indigo-600 bg-white" />
                      <button type="button" aria-label="Kéo để thay đổi kích thước" title="Kéo để thay đổi kích thước" onPointerDown={(event) => handleResizeStart(event, layer)} onPointerMove={handleResizeMove} onPointerUp={handleResizeEnd} onPointerCancel={handleResizeEnd} className="absolute -bottom-2 -right-2 h-4 w-4 cursor-nwse-resize touch-none rounded-sm border-2 border-white bg-indigo-600 shadow-sm" />
                    </>}
                  </div>
                );
              })}
              {layers.length === 0 && <div className="absolute inset-0 flex items-center justify-center"><button type="button" onClick={() => addLayer('text')} className="rounded-xl bg-white/90 px-5 py-3 text-sm font-extrabold text-slate-800 shadow-lg"><Plus className="mr-2 inline h-4 w-4" /> Thêm nội dung đầu tiên</button></div>}
            </div>
            <div className="mt-4 flex items-center justify-between text-sm text-slate-500"><span>Dòng dữ liệu {Math.max(1, rows.findIndex((row) => row.id === activeRowId) + 1)}/{rows.length}</span><span>Kéo nội dung để di chuyển · Kéo nút góc phải để đổi kích thước</span></div>
          </div>
        </div>
      </main>
    </div>
  );
}

interface EditorPanelProps {
  activeTool: EditorTool;
  backgroundId: string;
  backgroundImage: string;
  layers: TemplateLayer[];
  rows: DataRow[];
  activeRowId: string;
  sheetInput: string;
  onBackground: (id: string) => void;
  onBackgroundUpload: (value: string) => void;
  onAddLayer: (type: LayerType, initialValue?: string) => void;
  onSelectLayer: (id: string) => void;
  onSheetInput: (value: string) => void;
  onImportSheet: () => void;
  onAddRow: () => void;
  onSelectRow: (id: string) => void;
  onUpdateCell: (rowId: string, layerId: string, value: string) => void;
  onDuplicateRow: (row: DataRow) => void;
  onRemoveRow: (id: string) => void;
  onClose: () => void;
}

function EditorPanel(props: EditorPanelProps) {
  const { activeTool, backgroundId, backgroundImage, layers, rows, activeRowId, sheetInput } = props;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-5"><div><h3 className="text-lg font-extrabold text-slate-900">{TOOLS.find((tool) => tool.id === activeTool)?.label}</h3><p className="mt-1 text-sm text-slate-500">{activeTool === 'data' ? 'Mỗi dòng tạo ra một thiết kế.' : 'Chọn hoặc thêm nội dung vào mẫu.'}</p></div><button type="button" onClick={props.onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-indigo-600" title="Ẩn bảng tùy chọn"><PanelLeftClose className="h-5 w-5" /></button></div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {activeTool === 'background' && <div className="space-y-4">
          <label className={`flex min-h-28 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-4 text-center hover:border-indigo-500 hover:bg-indigo-50 ${backgroundImage ? 'border-indigo-500 bg-indigo-50' : 'border-slate-300'}`}><Upload className="mb-2 h-6 w-6 text-indigo-600" /><span className="text-sm font-extrabold">Tải ảnh nền của bạn</span><span className="mt-1 text-xs text-slate-500">PNG hoặc JPG</span><input type="file" accept="image/*" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) readImage(file, props.onBackgroundUpload); }} /></label>
          <div><p className="mb-3 text-sm font-extrabold text-slate-700">Mẫu nền có sẵn</p><div className="grid grid-cols-2 gap-3">{BACKGROUNDS.map((background) => { const active = !backgroundImage && backgroundId === background.id; return <button key={background.id} type="button" onClick={() => props.onBackground(background.id)} className={`overflow-hidden rounded-xl border-2 text-left ${active ? 'border-indigo-500' : 'border-slate-200'}`}><div className={`h-24 ${background.className}`} /><div className="flex items-center justify-between px-3 py-2 text-xs font-bold"><span>{background.name}</span>{active && <Check className="h-4 w-4 text-indigo-600" />}</div></button>; })}</div></div>
        </div>}

        {activeTool === 'text' && <div className="space-y-3"><button type="button" onClick={() => props.onAddLayer('text')} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 text-sm font-extrabold text-white"><Type className="h-5 w-5" /> Thêm ô văn bản</button><p className="px-1 pt-2 text-sm font-bold text-slate-600">Văn bản trên mẫu</p>{layers.filter((layer) => layer.type === 'text').map((layer) => <button key={layer.id} type="button" onClick={() => props.onSelectLayer(layer.id)} className="flex w-full items-center gap-3 rounded-xl border border-slate-200 p-3 text-left hover:border-indigo-400"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600"><Type className="h-4 w-4" /></span><span className="text-sm font-bold">{layer.label}</span></button>)}</div>}

        {activeTool === 'image' && <div className="space-y-3"><button type="button" onClick={() => props.onAddLayer('image')} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 text-sm font-extrabold text-white"><ImagePlus className="h-5 w-5" /> Thêm khung ảnh</button><label className="flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-xl border border-slate-300 text-sm font-bold text-slate-700"><Upload className="h-4 w-4" /> Tải ảnh và thêm vào mẫu<input type="file" accept="image/*" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) readImage(file, (value) => props.onAddLayer('image', value)); }} /></label><p className="px-1 pt-2 text-sm font-bold text-slate-600">Hình ảnh trên mẫu</p>{layers.filter((layer) => layer.type === 'image').map((layer) => <button key={layer.id} type="button" onClick={() => props.onSelectLayer(layer.id)} className="flex w-full items-center gap-3 rounded-xl border border-slate-200 p-3 text-left hover:border-indigo-400"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600"><ImageIcon className="h-4 w-4" /></span><span className="text-sm font-bold">{layer.label}</span></button>)}</div>}

        {activeTool === 'data' && <DataPanel layers={layers} rows={rows} activeRowId={activeRowId} sheetInput={sheetInput} {...props} />}
      </div>
    </div>
  );
}

function DataPanel(props: EditorPanelProps) {
  const { layers, rows, activeRowId, sheetInput } = props;
  return (
    <div className="space-y-4">
      {layers.length === 0 ? <div className="rounded-xl bg-slate-50 p-5 text-center text-sm text-slate-500">Hãy thêm chữ hoặc ảnh trước. Các phần đó sẽ tự động thành cột dữ liệu.</div> : <>
        <details className="rounded-xl border border-slate-200 bg-slate-50" open><summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-extrabold"><span className="inline-flex items-center gap-2"><FileSpreadsheet className="h-4 w-4 text-indigo-600" /> Dán từ bảng tính</span><ChevronDown className="h-4 w-4" /></summary><div className="border-t border-slate-200 p-3"><p className="mb-2 text-xs leading-relaxed text-slate-500">Cột: {layers.map((layer) => layer.label).join(' → ')}</p><textarea value={sheetInput} onChange={(event) => props.onSheetInput(event.target.value)} rows={4} placeholder="Sao chép các ô từ Excel hoặc Google Sheets rồi dán vào đây" className="w-full resize-none rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500" /><button type="button" onClick={props.onImportSheet} disabled={!sheetInput.trim()} className="mt-2 h-10 w-full rounded-lg bg-slate-800 text-sm font-bold text-white disabled:bg-slate-300">Dùng dữ liệu đã dán</button></div></details>
        <div className="flex items-center justify-between"><p className="text-sm font-extrabold">Dữ liệu thiết kế</p><button type="button" onClick={props.onAddRow} className="inline-flex items-center gap-1 text-sm font-bold text-indigo-650"><Plus className="h-4 w-4" /> Thêm dòng</button></div>
        {rows.map((row, index) => <div key={row.id} className={`rounded-xl border p-3 ${activeRowId === row.id ? 'border-indigo-500 bg-indigo-50/40' : 'border-slate-200'}`}><button type="button" onClick={() => props.onSelectRow(row.id)} className="mb-3 flex w-full items-center justify-between text-left"><span className="text-sm font-extrabold">Thiết kế {index + 1}</span>{activeRowId === row.id && <span className="rounded-full bg-indigo-100 px-2 py-1 text-xs font-bold text-indigo-700">Đang xem</span>}</button><div className="space-y-3">{layers.map((layer) => <label key={layer.id} className="block"><span className="mb-1 block text-xs font-bold text-slate-600">{layer.label}</span>{layer.type === 'text' ? <input value={row.values[layer.id] || ''} onChange={(event) => props.onUpdateCell(row.id, layer.id, event.target.value)} className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-indigo-500" placeholder="Nhập nội dung" /> : <label className="flex h-10 cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 bg-white text-xs font-bold text-slate-600">{row.values[layer.id] ? <><Check className="h-4 w-4 text-emerald-600" /> Đã chọn ảnh</> : <><Upload className="h-4 w-4" /> Chọn ảnh</>}<input type="file" accept="image/*" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) readImage(file, (value) => props.onUpdateCell(row.id, layer.id, value)); }} /></label>}</label>)}</div><div className="mt-3 flex justify-end gap-1 border-t border-slate-100 pt-2"><button type="button" onClick={() => props.onDuplicateRow(row)} className="rounded-lg p-2 text-slate-500 hover:bg-white" title="Nhân bản"><Copy className="h-4 w-4" /></button><button type="button" onClick={() => props.onRemoveRow(row.id)} className="rounded-lg p-2 text-rose-500 hover:bg-white" title="Xóa"><Trash2 className="h-4 w-4" /></button></div></div>)}
      </>}
    </div>
  );
}
