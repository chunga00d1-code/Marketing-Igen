import {
  ArrowLeft,
  ChevronDown,
  Cloud,
  CloudCheck,
  CloudOff,
  Download,
  FilePlus2,
  Link,
  LoaderCircle,
  Redo2,
  Search,
  Share2,
  Sparkles,
  Undo2,
  Users,
} from 'lucide-react';
import type { BulkRenderJob } from '../../../services/bulkCreateService';
import type { UserProfile } from '../../../types';
import { toast } from '../../../pages/Toast';

type AutoSaveStatus = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

interface BulkWorkspaceHeaderProps {
  onClose?: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onCreateNew: () => void;
  templateName: string;
  onTemplateNameChange: (value: string) => void;
  autoSaveStatus: AutoSaveStatus;
  pagesCreated: boolean;
  readyCount: number;
  busy: boolean;
  activeJob: BulkRenderJob | null;
  assetUploadProgress: { completed: number; total: number } | null;
  onStartGeneration: () => void;
  shareMenuOpen: boolean;
  onToggleShareMenu: () => void;
  companyMembers: UserProfile[];
  memberSearchQuery: string;
  onMemberSearchQueryChange: (value: string) => void;
  templateId: string;
  visibility: 'private' | 'public';
  onVisibilityChange: (visibility: 'private' | 'public') => void;
  downloadingJob: boolean;
  onDownloadJob: (job: BulkRenderJob) => void;
}

const AUTO_SAVE_LABELS: Record<AutoSaveStatus, string> = {
  idle: 'Tự động lưu khi bắt đầu thiết kế',
  dirty: 'Sẽ tự động lưu',
  saving: 'Đang tự động lưu...',
  saved: 'Đã tự động lưu',
  error: 'Tự động lưu thất bại',
};

function AutoSaveIcon({ status }: { status: AutoSaveStatus }) {
  if (status === 'saving') return <LoaderCircle className="h-3 w-3 animate-spin" />;
  if (status === 'saved') return <CloudCheck className="h-3 w-3" />;
  if (status === 'error') return <CloudOff className="h-3 w-3" />;
  return <Cloud className="h-3 w-3" />;
}

export function BulkWorkspaceHeader({
  onClose,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onCreateNew,
  templateName,
  onTemplateNameChange,
  autoSaveStatus,
  pagesCreated,
  readyCount,
  busy,
  activeJob,
  assetUploadProgress,
  onStartGeneration,
  shareMenuOpen,
  onToggleShareMenu,
  companyMembers,
  memberSearchQuery,
  onMemberSearchQueryChange,
  templateId,
  visibility,
  onVisibilityChange,
  downloadingJob,
  onDownloadJob,
}: BulkWorkspaceHeaderProps) {
  const generationInProgress = !!activeJob && ['queued', 'processing'].includes(activeJob.status);

  const copyShareLink = () => {
    const link = `${window.location.origin}${window.location.pathname}?template=${templateId}`;
    void navigator.clipboard.writeText(link).then(() => {
      toast.success('Đã sao chép liên kết thiết kế!');
    });
  };

  return (
    <div className="relative flex h-14 shrink-0 items-center justify-between gap-3 bg-gradient-to-r from-blue-600 via-blue-600 to-indigo-600 px-4 text-white shadow-sm">
      <div className="flex shrink-0 items-center gap-2">
        {onClose && (
          <button type="button" onClick={onClose} className="flex items-center gap-1.5 rounded-lg bg-white/10 px-2.5 py-1.5 text-xs font-extrabold transition-colors hover:bg-white/20" title="Quay lại Xưởng nội dung">
            <ArrowLeft className="h-4 w-4" />
            <span>Xưởng nội dung</span>
          </button>
        )}
        {onClose && <span className="h-5 w-px bg-white/20" />}
        <button type="button" onClick={onUndo} disabled={!canUndo} className="rounded-lg p-2.5 hover:bg-white/15 disabled:opacity-30" title="Hoàn tác"><Undo2 className="h-5 w-5" /></button>
        <button type="button" onClick={onRedo} disabled={!canRedo} className="rounded-lg p-2.5 hover:bg-white/15 disabled:opacity-30" title="Làm lại"><Redo2 className="h-5 w-5" /></button>
        <button type="button" onClick={onCreateNew} className="flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-extrabold hover:bg-white/15" title="Tạo thiết kế mới">
          <FilePlus2 className="h-4 w-4" />
          <span className="hidden xl:inline">Tạo mới</span>
        </button>
      </div>

      <div className="flex max-w-xs min-w-[120px] flex-1 flex-col items-center justify-center md:max-w-md">
        <input
          type="text"
          value={templateName}
          onChange={(event) => onTemplateNameChange(event.target.value)}
          placeholder="Thiết kế chưa đặt tên"
          className="w-full rounded-lg border-0 border-b border-transparent bg-transparent px-2 py-0.5 text-center text-sm font-extrabold text-white outline-none transition placeholder-white/50 hover:border-white/20 hover:bg-white/10 focus:border-white focus:bg-white/15"
          title="Đổi tên thiết kế"
        />
        <span className={`mt-0.5 flex items-center gap-1 text-[10px] font-bold ${autoSaveStatus === 'error' ? 'text-rose-100' : 'text-white/70'}`}>
          <AutoSaveIcon status={autoSaveStatus} />
          {AUTO_SAVE_LABELS[autoSaveStatus]}
        </span>
      </div>

      <div className="relative flex items-center gap-2">
        {pagesCreated && (
          <button
            type="button"
            onClick={onStartGeneration}
            disabled={readyCount === 0 || busy || generationInProgress}
            className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-xl bg-blue-700 px-4 text-sm font-extrabold text-white shadow-sm hover:bg-blue-800 disabled:bg-white/30 disabled:text-white/70"
          >
            {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {assetUploadProgress
              ? `Đang tải ảnh ${assetUploadProgress.completed}/${assetUploadProgress.total}`
              : busy
                ? 'Đang đưa vào hàng chờ...'
                : `Tạo ${readyCount} ảnh`}
          </button>
        )}
        <button type="button" onClick={onToggleShareMenu} className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-xl bg-white px-4 text-sm font-extrabold text-blue-700 shadow-sm hover:bg-blue-50">
          <Share2 className="h-4 w-4" /> Chia sẻ
        </button>

        {shareMenuOpen && (
          <div className="absolute right-0 top-12 z-[1000] w-[340px] rounded-2xl border border-slate-200 bg-white p-4 text-slate-800 shadow-[0_12px_40px_rgba(15,23,42,0.18)]" onPointerDown={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h4 className="text-sm font-extrabold text-slate-900">Chia sẻ thiết kế</h4>
              <span className="flex items-center gap-1 text-[11px] font-bold text-slate-500"><Users className="h-3 w-3" /> {companyMembers.length} thành viên</span>
            </div>

            <div className="mt-3 space-y-3">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400">Thành viên có quyền truy cập</label>
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input type="text" placeholder="Tìm thành viên công ty..." value={memberSearchQuery} onChange={(event) => onMemberSearchQueryChange(event.target.value)} className="h-9 w-full rounded-lg border border-slate-250 pl-9 pr-3 text-xs outline-none focus:border-indigo-500" />
              </div>
              <div className="max-h-[140px] space-y-2 overflow-y-auto pr-1 [scrollbar-width:thin]">
                {companyMembers.filter((member) => {
                  const query = memberSearchQuery.toLowerCase();
                  return (member.displayName || '').toLowerCase().includes(query) || (member.email || '').toLowerCase().includes(query);
                }).map((member) => {
                  const initials = (member.displayName || member.email || 'US').slice(0, 2).toUpperCase();
                  return (
                    <div key={member.uid} className="flex items-center gap-2.5 py-1">
                      {member.photoURL
                        ? <img src={member.photoURL} alt={member.displayName} className="h-7 w-7 rounded-full border border-slate-100 object-cover" />
                        : <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-[10px] font-extrabold text-indigo-700">{initials}</div>}
                      <div className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-bold text-slate-800">{member.displayName}</span>
                        <span className="block truncate text-[10px] text-slate-500">{member.email}</span>
                      </div>
                      <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold uppercase text-slate-500">{member.role}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="mt-4 border-t border-slate-100 pt-3">
              <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-slate-400">Cấp độ truy cập</label>
              <div className="relative">
                <select value={visibility} onChange={(event) => onVisibilityChange(event.target.value as 'private' | 'public')} className="h-10 w-full appearance-none rounded-lg border border-slate-200 bg-slate-50 px-3 pl-9 pr-10 text-xs font-bold text-slate-700 outline-none focus:border-indigo-500">
                  <option value="private">🔒 Chỉ bạn mới có quyền truy cập</option>
                  <option value="public">🌐 Công khai (Kho mẫu cộng đồng)</option>
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-3 text-slate-500" />
              </div>
            </div>

            <button type="button" onClick={copyShareLink} className="mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-slate-200 text-xs font-bold hover:bg-slate-50">
              <Link className="h-3.5 w-3.5 text-slate-500" /> Sao chép liên kết
            </button>

            {activeJob && ['completed', 'partial'].includes(activeJob.status) && (
              <div className="mt-4 border-t border-slate-100 pt-3">
                <button type="button" onClick={() => onDownloadJob(activeJob)} disabled={downloadingJob} className="flex h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 text-xs font-bold text-emerald-700 transition-all duration-200 hover:-translate-y-0.5 hover:border-emerald-300 hover:bg-emerald-100 hover:shadow-sm active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:shadow-none">
                  {downloadingJob ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                  {downloadingJob ? 'Đang chuẩn bị file ZIP...' : 'Tải tất cả ảnh'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
