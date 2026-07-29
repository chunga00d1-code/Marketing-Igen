import { useRef, useState } from 'react';
import {
  FileText,
  ImagePlus,
  Loader2,
  Paperclip,
  RotateCcw,
  Send,
  WandSparkles,
  X,
} from 'lucide-react';
import {
  bulkCreateService,
  type BulkAiAttachment,
  type BulkAiHistoryMessage,
  type BulkAiOperation,
  type BulkAiScene,
  type BulkAiSceneResult,
} from '../../../services/bulkCreateService';
import { toast } from '../../../pages/Toast';

type BulkAiPanelProps = {
  scene: BulkAiScene;
  values: Record<string, string>;
  history: BulkAiHistoryMessage[];
  onHistoryChange: (history: BulkAiHistoryMessage[]) => void;
  onApply: (result: BulkAiSceneResult) => void;
  onUndo: () => void;
  onClose: () => void;
};

function readFile(file: File, asDataUrl = false) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Không thể đọc tệp.'));
    if (asDataUrl) reader.readAsDataURL(file);
    else reader.readAsText(file);
  });
}

export function BulkAiPanel({
  scene,
  values,
  history,
  onHistoryChange,
  onApply,
  onUndo,
  onClose,
}: BulkAiPanelProps) {
  const [prompt, setPrompt] = useState('');
  const [attachments, setAttachments] = useState<BulkAiAttachment[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [lastOperations, setLastOperations] = useState<BulkAiOperation[]>([]);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const documentInputRef = useRef<HTMLInputElement>(null);

  const addImage = async (file?: File) => {
    if (!file) return;
    if (attachments.length >= 4) {
      toast.error('Có thể đính kèm tối đa 4 tệp.');
      return;
    }
    if (!file.type.startsWith('image/')) {
      toast.error('Vui lòng chọn một tệp ảnh.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error('Ảnh chỉ được tối đa 10 MB.');
      return;
    }

    setUploading(true);
    try {
      const asset = await bulkCreateService.uploadLibraryAsset(
        await readFile(file, true),
        file.name
      );
      const attachment: BulkAiAttachment = {
        type: 'image',
        name: file.name,
        url: asset.url,
      };
      setAttachments((current) => [
        ...current,
        attachment,
      ].slice(0, 4));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Không thể tải ảnh lên.');
    } finally {
      setUploading(false);
    }
  };

  const addDocument = async (file?: File) => {
    if (!file) return;
    if (attachments.length >= 4) {
      toast.error('Có thể đính kèm tối đa 4 tệp.');
      return;
    }
    const supported = /\.(txt|md|csv|json|html?)$/i.test(file.name)
      || file.type.startsWith('text/')
      || file.type === 'application/json';
    if (!supported) {
      toast.error('Hiện hỗ trợ TXT, Markdown, CSV, JSON hoặc HTML.');
      return;
    }
    try {
      const attachment: BulkAiAttachment = {
        type: 'document',
        name: file.name,
        text: (await readFile(file)).slice(0, 20_000),
      };
      setAttachments((current) => [
        ...current,
        attachment,
      ].slice(0, 4));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Không thể đọc tài liệu.');
    }
  };

  const submit = async () => {
    const normalizedPrompt = prompt.trim();
    if (normalizedPrompt.length < 2) {
      toast.error('Hãy nhập yêu cầu thiết kế hoặc chỉnh sửa.');
      return;
    }
    setSubmitting(true);
    try {
      const result = await bulkCreateService.updateSceneWithAi({
        prompt: normalizedPrompt,
        scene,
        values,
        attachments,
        history,
      });
      onApply(result);
      setLastOperations(result.operations || []);
      onHistoryChange([
        ...history,
        { role: 'user', content: normalizedPrompt },
        { role: 'assistant', content: result.reply },
      ].slice(-20) as BulkAiHistoryMessage[]);
      setPrompt('');
      setAttachments([]);
      toast.success(result.reply);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Không thể chỉnh sửa thiết kế bằng AI.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="flex min-h-0 w-[320px] flex-1 flex-col bg-white">
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-100 px-4">
        <div>
          <div className="flex items-center gap-2 text-base font-extrabold text-slate-900">
            <WandSparkles className="h-4 w-4 text-indigo-600" />
            Thiết kế bằng AI
          </div>
          <p className="mt-0.5 text-[11px] text-slate-500">AI chỉnh trực tiếp trang đang mở</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          title="Đóng bảng AI"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="mb-3 rounded-xl border border-indigo-100 bg-indigo-50/60 p-3 text-[11px] leading-5 text-indigo-800">
          Mỗi yêu cầu đều dựa trên canvas, layer và nội dung hiện tại. Kết quả vẫn là
          các phần tử có thể kéo, thả và sửa thủ công.
        </div>

        {history.length > 0 && (
          <div className="mb-3 max-h-52 space-y-2 overflow-y-auto rounded-xl bg-slate-50 p-2">
            {history.map((message, index) => (
              <div
                key={`${message.role}-${index}`}
                className={`rounded-lg px-2.5 py-2 text-[11px] leading-4 ${
                  message.role === 'user'
                    ? 'ml-3 bg-indigo-100 text-indigo-900'
                    : 'mr-3 bg-white text-slate-600 shadow-sm'
                }`}
              >
                <div className="mb-1 text-[9px] font-extrabold uppercase tracking-wide text-slate-400">
                  {message.role === 'user' ? 'Bạn' : 'AI'}
                </div>
                {message.content}
              </div>
            ))}
          </div>
        )}

        {lastOperations.length > 0 && (
          <div className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-[11px] font-extrabold text-emerald-800">
                AI vừa thay đổi {lastOperations.length} mục
              </span>
              <button
                type="button"
                onClick={() => {
                  onUndo();
                  setLastOperations([]);
                  toast.success('Đã hoàn tác lần chỉnh sửa AI gần nhất.');
                }}
                className="inline-flex items-center gap-1 rounded-lg bg-white px-2 py-1 text-[10px] font-extrabold text-slate-600 shadow-sm ring-1 ring-slate-200 hover:text-indigo-700"
              >
                <RotateCcw className="h-3 w-3" />
                Hoàn tác
              </button>
            </div>
            <div className="space-y-1">
              {lastOperations.slice(0, 8).map((operation, index) => (
                <div
                  key={`${operation.op}-${'layerId' in operation ? operation.layerId : index}`}
                  className="rounded-lg bg-white/80 px-2 py-1.5 text-[10px] font-semibold text-emerald-900"
                >
                  {operation.label}
                </div>
              ))}
              {lastOperations.length > 8 && (
                <div className="text-[10px] font-semibold text-emerald-700">
                  Và {lastOperations.length - 8} thay đổi khác
                </div>
              )}
            </div>
          </div>
        )}

        <label className="text-xs font-bold text-slate-700">
          {scene.layers.length > 0 ? 'Bạn muốn chỉnh gì trên trang này?' : 'Mô tả thiết kế bạn muốn tạo'}
          <div className="mt-1.5 overflow-hidden rounded-xl border border-slate-200 bg-white transition focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-100">
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              onKeyDown={(event) => {
                if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                  event.preventDefault();
                  void submit();
                }
              }}
              placeholder={
                scene.layers.length > 0
                  ? 'Ví dụ: Giữ nguyên nội dung, dùng ảnh đính kèm làm nền và tăng độ tương phản chữ...'
                  : 'Mục tiêu, headline, nội dung, CTA, phong cách, màu sắc...'
              }
              className="block min-h-32 w-full resize-y border-0 bg-transparent p-3 pb-2 text-xs font-medium leading-5 text-slate-800 outline-none"
              maxLength={4_000}
            />

            {attachments.length > 0 && (
              <div className="flex max-h-36 flex-wrap gap-2 overflow-y-auto px-3 pb-2">
                {attachments.map((attachment, index) => (
                  <div
                    key={`${attachment.name}-${index}`}
                    className="group relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50"
                  >
                    {attachment.type === 'image' && attachment.url ? (
                      <img
                        src={attachment.url}
                        alt={attachment.name}
                        className="h-full w-full object-contain"
                      />
                    ) : (
                      <div className="flex h-full w-full flex-col items-center justify-center px-1 text-center text-[9px] font-semibold text-slate-500">
                        <FileText className="mb-1 h-5 w-5 text-indigo-500" />
                        <span className="w-full truncate">{attachment.name}</span>
                      </div>
                    )}
                    <button
                      type="button"
                      title="Bỏ tệp"
                      onClick={() => setAttachments((current) =>
                        current.filter((_, itemIndex) => itemIndex !== index)
                      )}
                      className="absolute right-1 top-1 rounded-full bg-slate-900/75 p-0.5 text-white"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-center gap-1 border-t border-slate-100 px-2 py-1.5">
              <button
                type="button"
                title="Đính kèm ảnh"
                onClick={() => imageInputRef.current?.click()}
                disabled={uploading || attachments.length >= 4}
                className="rounded-lg p-1.5 text-slate-500 hover:bg-indigo-50 hover:text-indigo-600 disabled:opacity-40"
              >
                {uploading
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <ImagePlus className="h-4 w-4" />}
              </button>
              <button
                type="button"
                title="Đính kèm tài liệu"
                onClick={() => documentInputRef.current?.click()}
                disabled={attachments.length >= 4}
                className="rounded-lg p-1.5 text-slate-500 hover:bg-indigo-50 hover:text-indigo-600 disabled:opacity-40"
              >
                <FileText className="h-4 w-4" />
              </button>
              <Paperclip className="ml-1 h-3.5 w-3.5 text-slate-300" />
              <span className="ml-auto text-[9px] font-medium text-slate-400">
                {attachments.length}/4 tệp
              </span>
            </div>
          </div>
        </label>

        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => {
            void addImage(event.target.files?.[0]);
            event.currentTarget.value = '';
          }}
        />
        <input
          ref={documentInputRef}
          type="file"
          accept=".txt,.md,.csv,.json,.html,.htm,text/plain,text/markdown,text/csv,application/json"
          className="hidden"
          onChange={(event) => {
            void addDocument(event.target.files?.[0]);
            event.currentTarget.value = '';
          }}
        />

        <p className="mt-2 text-[10px] leading-4 text-slate-400">
          AI đọc ảnh và tài liệu đính kèm. Nếu chỉ yêu cầu đổi một phần, các layer còn
          lại sẽ được giữ nguyên.
        </p>

        <button
          type="button"
          onClick={() => void submit()}
          disabled={submitting || uploading}
          className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-3 text-xs font-extrabold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
        >
          {submitting
            ? <Loader2 className="h-4 w-4 animate-spin" />
            : <Send className="h-4 w-4" />}
          {submitting
            ? 'AI đang cập nhật trang...'
            : scene.layers.length > 0
              ? 'Chỉnh trang hiện tại'
              : 'Tạo thiết kế trên trang'}
        </button>
        <p className="mt-2 text-center text-[9px] text-slate-400">
          Ctrl/⌘ + Enter để gửi · phí AI text 0,5 credit/lần
        </p>
      </div>
    </section>
  );
}
