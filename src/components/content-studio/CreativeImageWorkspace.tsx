import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Download, ImagePlus, LayoutTemplate, Loader2, Save, Sparkles, Upload } from "lucide-react";
import { creativeImageApi, type CreativeProject, type CreativeRender } from "../../api/creative-image";
import { CreativeImageTemplate } from "../../creative-image/CreativeImageTemplate";
import { CREATIVE_IMAGE_CANVASES, type CreativeImageCanvas, type CreativeImageProjectData, type CreativeImageTemplate as Template } from "../../creative-image/types";
import { toast } from "../../pages/Toast";

type Props = { onMediaSaved?: (cardId: string, mediaUrl: string, type: "image" | "video" | "audio") => void; cardId?: string };

function createKey() {
  return globalThis.crypto?.randomUUID?.() || `creative-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Không thể đọc tệp ảnh."));
    reader.readAsDataURL(file);
  });
}

export function CreativeImageWorkspace({ onMediaSaved, cardId }: Props) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templateId, setTemplateId] = useState("");
  const [canvas, setCanvas] = useState<CreativeImageCanvas>(CREATIVE_IMAGE_CANVASES["4:5"]);
  const [data, setData] = useState<CreativeImageProjectData>({});
  const [project, setProject] = useState<CreativeProject | null>(null);
  const [activeRender, setActiveRender] = useState<CreativeRender | null>(null);
  const [history, setHistory] = useState<CreativeRender[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [uploadingField, setUploadingField] = useState<string | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const [previewWidth, setPreviewWidth] = useState(360);

  const selectedTemplate = useMemo(() => templates.find((item) => item.id === templateId) || null, [templates, templateId]);
  const scale = Math.min(1, previewWidth / canvas.width);

  const refreshHistory = useCallback(async () => {
    try { setHistory(await creativeImageApi.listRenders()); } catch { /* The editor stays usable if history is temporarily unavailable. */ }
  }, []);

  useEffect(() => {
    void creativeImageApi.listTemplates().then((items) => {
      setTemplates(items);
      const initial = items[0];
      if (initial) { setTemplateId(initial.id); setData(initial.defaults); }
    }).catch((error: Error) => toast.error(error.message));
    void refreshHistory();
  }, [refreshHistory]);

  useEffect(() => {
    const element = previewRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setPreviewWidth(Math.max(240, Math.floor(entry.contentRect.width))));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!activeRender || !["queued", "rendering"].includes(activeRender.status)) return;
    const timer = window.setInterval(() => {
      void creativeImageApi.getRender(activeRender._id).then((render) => {
        setActiveRender(render);
        if (render.status === "completed") { void refreshHistory(); toast.success("Ảnh PNG đã xuất xong."); }
        if (render.status === "failed") toast.error(render.error || "Không thể xuất ảnh.");
      }).catch((error: Error) => { window.clearInterval(timer); toast.error(error.message); });
    }, 1_500);
    return () => window.clearInterval(timer);
  }, [activeRender, refreshHistory]);

  const updateData = (key: string, value: string) => setData((current) => ({ ...current, [key]: value }));
  const changeTemplate = (next: Template) => { setTemplateId(next.id); setData(next.defaults); };
  const changeFormat = (format: keyof typeof CREATIVE_IMAGE_CANVASES) => setCanvas(CREATIVE_IMAGE_CANVASES[format]);

  const saveProject = useCallback(async () => {
    if (!templateId) throw new Error("Hãy chọn một mẫu thiết kế.");
    setIsSaving(true);
    try {
      const input = { templateId, canvas, data };
      const saved = project ? await creativeImageApi.updateProject(project._id, input) : await creativeImageApi.createProject(input);
      setProject(saved);
      return saved;
    } finally { setIsSaving(false); }
  }, [canvas, data, project, templateId]);

  const handleUpload = async (field: string, file?: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("Vui lòng chọn một tệp ảnh."); return; }
    setUploadingField(field);
    try {
      const fileData = await readFileAsDataUrl(file);
      const token = localStorage.getItem("accessToken");
      const response = await fetch("/api/v1/media/upload", { method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ file: fileData, folder: "igen_erp/creative-image/input" }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message || "Không thể tải ảnh lên.");
      updateData(field, result.url);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Không thể tải ảnh lên."); }
    finally { setUploadingField(null); }
  };

  const handleSave = async () => {
    try { await saveProject(); toast.success("Đã lưu bản nháp thiết kế."); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Không thể lưu thiết kế."); }
  };

  const handleExport = async () => {
    try {
      const saved = await saveProject();
      const render = await creativeImageApi.createRender(saved._id, createKey());
      setActiveRender(render);
      toast.success("Đã đưa ảnh vào hàng đợi xuất PNG.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Không thể xuất ảnh."); }
  };

  const completedUrl = activeRender?.status === "completed" ? activeRender.outputUrl : "";
  return <div className="mx-auto grid w-full max-w-[1540px] gap-4 xl:grid-cols-[260px_minmax(0,1fr)_300px]">
    <aside className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="mb-3 flex items-center gap-2 px-1 text-sm font-extrabold text-slate-800"><LayoutTemplate className="h-4 w-4 text-indigo-600" /> Mẫu thiết kế</div>
      <div className="space-y-2">{templates.map((item) => <button key={item.id} type="button" onClick={() => changeTemplate(item)} className={`w-full rounded-xl border p-3 text-left transition ${item.id === templateId ? "border-indigo-500 bg-indigo-50 ring-1 ring-indigo-200" : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"}`}>
        <div className="mb-1 h-1.5 rounded-full" style={{ backgroundColor: item.accent }} />
        <div className="text-xs font-extrabold text-slate-800">{item.name}</div><div className="mt-1 text-[11px] leading-4 text-slate-500">{item.description}</div>
      </button>)}</div>
      <div className="mt-5 border-t border-slate-100 pt-4"><div className="mb-2 text-xs font-bold text-slate-600">Kích thước xuất</div><div className="grid grid-cols-2 gap-2">{Object.values(CREATIVE_IMAGE_CANVASES).map((item) => <button type="button" key={item.format} onClick={() => changeFormat(item.format)} className={`rounded-lg border px-2 py-2 text-[11px] font-bold ${canvas.format === item.format ? "border-indigo-500 bg-indigo-50 text-indigo-700" : "border-slate-200 text-slate-500"}`}>{item.format}</button>)}</div></div>
    </aside>

    <main className="min-w-0 rounded-2xl border border-slate-200 bg-slate-100/70 p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between"><div><h2 className="text-sm font-extrabold text-slate-800">Xem trước thiết kế</h2><p className="text-xs text-slate-500">{canvas.width} × {canvas.height}px · PNG</p></div>{activeRender && <span className={`rounded-full px-3 py-1 text-[11px] font-bold ${activeRender.status === "completed" ? "bg-emerald-100 text-emerald-700" : activeRender.status === "failed" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>{activeRender.status === "queued" ? "Đang xếp hàng" : activeRender.status === "rendering" ? "Đang xuất ảnh" : activeRender.status === "completed" ? "Đã hoàn tất" : "Xuất ảnh lỗi"}</span>}</div>
      <div ref={previewRef} className="flex min-h-[460px] items-center justify-center overflow-auto rounded-xl bg-slate-200 p-4"><div style={{ width: canvas.width * scale, height: canvas.height * scale, position: "relative", flex: "0 0 auto" }}><div style={{ width: canvas.width, height: canvas.height, position: "absolute", left: 0, top: 0, transform: `scale(${scale})`, transformOrigin: "top left", boxShadow: "0 20px 44px rgba(15,23,42,.22)" }}><CreativeImageTemplate templateId={templateId || "product-promo-v1"} canvas={canvas} data={data} /></div></div></div>
      {completedUrl && <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3"><Check className="h-4 w-4 text-emerald-600" /><span className="mr-auto text-xs font-semibold text-emerald-800">Ảnh đã sẵn sàng.</span><a href={completedUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg bg-white px-3 py-1.5 text-xs font-bold text-emerald-700 shadow-sm"><Download className="h-3.5 w-3.5" /> Tải ảnh</a>{cardId && onMediaSaved && <button type="button" onClick={() => onMediaSaved(cardId, completedUrl, "image")} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white">Dùng cho bài viết</button>}</div>}
      {history.length > 0 && <div className="mt-4"><div className="mb-2 text-xs font-bold text-slate-600">Ảnh đã xuất gần đây</div><div className="flex gap-2 overflow-x-auto pb-1">{history.slice(0, 8).map((render) => <button key={render._id} type="button" onClick={() => setActiveRender(render)} className="h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-white"><img src={render.outputUrl} alt="Ảnh đã xuất" className="h-full w-full object-cover" /></button>)}</div></div>}
    </main>

    <aside className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="mb-4 flex items-center gap-2 text-sm font-extrabold text-slate-800"><Sparkles className="h-4 w-4 text-indigo-600" /> Nội dung mẫu</div>{selectedTemplate ? <div className="space-y-3">{selectedTemplate.fields.map((field) => <label key={field.key} className="block text-xs font-bold text-slate-600">{field.label}
      {field.type === "textarea" ? <textarea value={data[field.key] || ""} maxLength={field.maxLength} placeholder={field.placeholder} onChange={(event) => updateData(field.key, event.target.value)} className="mt-1 min-h-20 w-full rounded-lg border border-slate-200 p-2 text-xs font-medium text-slate-800 outline-none focus:border-indigo-400" />
        : field.type === "color" ? <input type="color" value={data[field.key] || selectedTemplate.defaults[field.key]} onChange={(event) => updateData(field.key, event.target.value)} className="mt-1 h-9 w-full cursor-pointer rounded-lg border border-slate-200 bg-white p-1" />
        : field.type === "image" ? <div className="mt-1 space-y-2"><input value={data[field.key] || ""} placeholder="Dán URL Cloudinary hoặc tải ảnh" onChange={(event) => updateData(field.key, event.target.value)} className="w-full rounded-lg border border-slate-200 p-2 text-xs font-medium text-slate-800 outline-none focus:border-indigo-400" /><label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50"><Upload className="h-3.5 w-3.5" />{uploadingField === field.key ? "Đang tải..." : "Tải ảnh lên"}<input type="file" accept="image/*" className="hidden" disabled={uploadingField === field.key} onChange={(event) => void handleUpload(field.key, event.target.files?.[0])} /></label></div>
        : <input value={data[field.key] || ""} maxLength={field.maxLength} placeholder={field.placeholder} onChange={(event) => updateData(field.key, event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-xs font-medium text-slate-800 outline-none focus:border-indigo-400" />}
    </label>)}</div> : <div className="flex justify-center py-12 text-slate-400"><Loader2 className="h-5 w-5 animate-spin" /></div>}
      <div className="mt-5 grid grid-cols-2 gap-2 border-t border-slate-100 pt-4"><button type="button" onClick={() => void handleSave()} disabled={isSaving} className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 disabled:opacity-60"><Save className="h-3.5 w-3.5" /> Lưu nháp</button><button type="button" onClick={() => void handleExport()} disabled={isSaving || !templateId} className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-60"><ImagePlus className="h-3.5 w-3.5" /> Xuất PNG</button></div>
    </aside>
  </div>;
}
