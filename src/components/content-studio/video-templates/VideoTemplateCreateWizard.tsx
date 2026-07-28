import { useMemo, useState } from 'react';
import { ArrowLeft, Check, Loader2, UploadCloud } from 'lucide-react';
import { toast } from '../../../pages/Toast';
import { videoTemplateService } from '../../../services/videoTemplateService';

interface VideoTemplateCreateWizardProps {
  onCancel: () => void;
  onPublished: () => void;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function uploadTemplateVideo(file: File) {
  const response = await fetch('/api/v1/media/upload', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${localStorage.getItem('accessToken')}`,
    },
    body: JSON.stringify({ file: await fileToBase64(file), folder: 'igen_erp/video_templates' }),
  });
  const payload = await response.json().catch(() => ({})) as { url?: string; message?: string };
  if (!response.ok || !payload.url) throw new Error(payload.message || 'Không thể tải video mẫu lên.');
  return payload.url;
}

function readVideoDuration(url: string): Promise<number> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.onloadedmetadata = () => resolve(Number.isFinite(video.duration) ? video.duration : 15);
    video.onerror = () => resolve(15);
    video.src = url;
  });
}

export function VideoTemplateCreateWizard({ onCancel, onPublished }: VideoTemplateCreateWizardProps) {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [uploadedUrl, setUploadedUrl] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState('sales');
  const [duration, setDuration] = useState(15);
  const [isSaving, setIsSaving] = useState(false);
  const [savedTemplateId, setSavedTemplateId] = useState<string | null>(null);

  const categoryName = useMemo(() => ({
    sales: 'Bán hàng',
    tiktok: 'TikTok',
    education: 'Giáo dục',
    vlog: 'Vlog',
    promo: 'Khuyến mãi',
  }[categoryId] || 'Bán hàng'), [categoryId]);

  const handleFile = async (selected: File | null) => {
    if (!selected) return;
    if (selected.size > 200 * 1024 * 1024) {
      toast.warning('Video mẫu vượt quá giới hạn 200MB.');
      return;
    }
    if (previewUrl.startsWith('blob:')) URL.revokeObjectURL(previewUrl);
    const localUrl = URL.createObjectURL(selected);
    setFile(selected);
    setPreviewUrl(localUrl);
    setUploadedUrl('');
    setDuration(await readVideoDuration(localUrl));
  };

  const save = async (publish: boolean) => {
    if (!file && !uploadedUrl) {
      toast.warning('Hãy tải video mẫu lên trước.');
      return;
    }
    if (title.trim().length < 3) {
      toast.warning('Tên mẫu cần ít nhất 3 ký tự.');
      return;
    }
    setIsSaving(true);
    try {
      const videoUrl = uploadedUrl || await uploadTemplateVideo(file as File);
      setUploadedUrl(videoUrl);
      setPreviewUrl(videoUrl);
      const input = {
        title: title.trim(),
        description: description.trim(),
        thumbnailUrl: '/brand-icon.png',
        previewVideoUrl: videoUrl,
        duration,
        aspectRatio: '9:16' as const,
        categoryId,
        categoryName,
        tags: [],
      };
      const result = savedTemplateId
        ? await videoTemplateService.updateTemplate(savedTemplateId, input)
        : await videoTemplateService.createTemplate(input);
      setSavedTemplateId(result.id);
      if (publish) {
        await videoTemplateService.publishTemplate(result.id);
        toast.success('Đã xuất bản mẫu video.');
        onPublished();
      } else {
        toast.success('Đã lưu bản nháp.');
      }
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Không thể lưu mẫu video.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-[1500px] px-2 pb-10">
      <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-indigo-600">Mẫu video</p>
            <h2 className="mt-1 text-2xl font-bold text-slate-900">Tạo mẫu mới</h2>
            <p className="mt-1 text-sm text-slate-500">Tải video hoàn chỉnh lên và xuất bản để người dùng có thể sử dụng ngay.</p>
          </div>
          <button onClick={onCancel} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700">
            <ArrowLeft className="h-4 w-4" /> Quay lại thư viện
          </button>
        </div>

        <div className="mt-5 grid gap-5 lg:grid-cols-[380px_1fr]">
          <label className="flex min-h-[520px] cursor-pointer items-center justify-center overflow-hidden rounded-3xl border-2 border-dashed border-slate-300 bg-slate-50">
            {previewUrl ? (
              <video src={previewUrl} controls playsInline className="max-h-[520px] w-full bg-black object-contain" />
            ) : (
              <div className="text-center">
                <UploadCloud className="mx-auto h-10 w-10 text-indigo-500" />
                <p className="mt-3 text-sm font-bold text-slate-800">Tải video mẫu hoàn chỉnh</p>
                <p className="mt-1 text-xs text-slate-500">MP4, MOV, WEBM · tối đa 200MB</p>
              </div>
            )}
            <input type="file" accept="video/*" className="hidden" onChange={(event) => void handleFile(event.target.files?.[0] || null)} />
          </label>

          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Tên mẫu" className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
              <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm">
                <option value="sales">Bán hàng</option>
                <option value="tiktok">TikTok</option>
                <option value="education">Giáo dục</option>
                <option value="vlog">Vlog</option>
                <option value="promo">Khuyến mãi</option>
              </select>
            </div>
            <textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Mô tả mẫu" rows={4} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
            <div className="rounded-2xl border border-cyan-100 bg-cyan-50 p-4 text-sm text-cyan-900">
              Video được lưu nguyên bản. Người dùng xem mẫu và bấm “Dùng mẫu này” để sử dụng ngay.
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button disabled={isSaving || (!file && !uploadedUrl)} onClick={() => void save(false)} className="rounded-xl border border-slate-300 px-4 py-2.5 text-xs font-bold text-slate-700 disabled:opacity-50">Lưu nháp</button>
              <button disabled={isSaving || (!file && !uploadedUrl)} onClick={() => void save(true)} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50">
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Xuất bản
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
