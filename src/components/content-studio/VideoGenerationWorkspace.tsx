import { Suspense, lazy, useState, useEffect } from 'react';
import { Clapperboard, Sparkles, Wand2, Film, Scissors } from 'lucide-react';
import { SimpleVideoWorkspace } from './SimpleVideoWorkspace';
import { EditVideoWorkspace } from './EditVideoWorkspace';
import LongToShortTab from '../../pages/LongToShortTab';

const HeyGenWorkspace = lazy(() =>
  import('./HeyGenWorkspace').then((module) => ({ default: module.HeyGenWorkspace }))
);

const KlingMotionWorkspace = lazy(() =>
  import('./KlingMotionWorkspace').then((module) => ({ default: module.KlingMotionWorkspace }))
);

interface VideoGenerationWorkspaceProps {
  initialPrompt?: string;
  cardId?: string;
  onMediaSaved?: (cardId: string, mediaUrl: string, type: 'image' | 'video' | 'audio') => void;
  initialVideoTab?: VideoToolTab;
  initialImage?: string;
  autoTrigger?: boolean;
  engineType?: string;
  usePersonalVoice?: boolean;
}

type VideoToolTab = 'veo' | 'heygen' | 'edit-video' | 'kling-motion' | 'long-to-short';

const VIDEO_TOOL_TABS: Array<{
  id: VideoToolTab;
  label: string;
  icon: typeof Sparkles;
}> = [
  { id: 'veo', label: 'Tạo video AI', icon: Sparkles },
  { id: 'heygen', label: 'Tạo video người thật', icon: Clapperboard },
  { id: 'kling-motion', label: 'Motion Control', icon: Film },
  { id: 'edit-video', label: 'Chỉnh sửa video', icon: Wand2 },
  { id: 'long-to-short', label: 'Long to Short', icon: Scissors },
];

export function VideoGenerationWorkspace({
  initialPrompt,
  cardId,
  onMediaSaved,
  initialVideoTab = 'veo',
  initialImage,
  autoTrigger,
  engineType,
  usePersonalVoice,
}: VideoGenerationWorkspaceProps) {
  const [activeVideoTab, setActiveVideoTab] = useState<VideoToolTab>(initialVideoTab);
  const [editVideoSourceUrl, setEditVideoSourceUrl] = useState<string | null>(null);

  useEffect(() => {
    if (initialVideoTab) {
      setActiveVideoTab(initialVideoTab);
    }
  }, [initialVideoTab]);

  return (
    <div className="flex flex-col gap-4">
      <div className="mx-auto flex w-full max-w-[1500px] items-center justify-start px-2">
        <div className="inline-flex w-fit items-center gap-1 rounded-2xl border border-slate-200 bg-white/90 p-1 shadow-sm">
          {VIDEO_TOOL_TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setActiveVideoTab(id)}
              className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold transition-all ${
                activeVideoTab === id
                  ? 'bg-slate-950 text-white shadow-sm'
                  : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {activeVideoTab === 'veo' && (
        <SimpleVideoWorkspace
          initialPrompt={initialPrompt}
          cardId={cardId}
          onMediaSaved={onMediaSaved}
          onEditVideo={(url) => {
            setEditVideoSourceUrl(url);
            setActiveVideoTab('edit-video');
          }}
          initialImage={initialImage}
          autoTrigger={autoTrigger}
        />
      )}

      {activeVideoTab === 'heygen' && (
        <Suspense
          fallback={
            <div className="mx-auto w-full max-w-[1500px] px-2">
              <div className="flex min-h-[420px] items-center justify-center rounded-[28px] border border-slate-200 bg-white/80 text-sm font-medium text-slate-500 shadow-sm">
                Đang tải HeyGen workspace...
              </div>
            </div>
          }
        >
          <HeyGenWorkspace
            initialPrompt={initialPrompt}
            cardId={cardId}
            onEditVideo={(url) => {
              setEditVideoSourceUrl(url);
              setActiveVideoTab('edit-video');
            }}
            onMediaSaved={onMediaSaved}
            autoTrigger={autoTrigger}
            engineType={engineType}
            usePersonalVoice={usePersonalVoice}
          />
        </Suspense>
      )}

      {activeVideoTab === 'kling-motion' && (
        <Suspense
          fallback={
            <div className="mx-auto w-full max-w-[1500px] px-2">
              <div className="flex min-h-[420px] items-center justify-center rounded-[28px] border border-slate-200 bg-white/80 text-sm font-medium text-slate-500 shadow-sm">
                Đang tải Motion Control workspace...
              </div>
            </div>
          }
        >
          <KlingMotionWorkspace
            cardId={cardId}
            onMediaSaved={onMediaSaved}
          />
        </Suspense>
      )}

      {activeVideoTab === 'edit-video' && (
        <EditVideoWorkspace
          initialVideoUrl={editVideoSourceUrl}
          onClearInitialVideoUrl={() => setEditVideoSourceUrl(null)}
        />
      )}

      {activeVideoTab === 'long-to-short' && (
        <LongToShortTab />
      )}
    </div>
  );
}

function VideoToolPlaceholder({
  title,
  description,
  badge,
}: {
  title: string;
  description: string;
  badge: string;
}) {
  return (
    <div className="mx-auto w-full max-w-[1500px] px-2">
      <div className="rounded-[28px] border border-slate-200 bg-[linear-gradient(135deg,#ffffff_0%,#f5fafc_100%)] p-8 shadow-sm">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-cyan-700">Video Studio</p>
            <h3 className="mt-2 text-2xl font-bold text-slate-900">{title}</h3>
          </div>
          <span className="rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-[11px] font-semibold text-cyan-700">
            {badge}
          </span>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-3xl border border-slate-200 bg-white p-5">
            <p className="text-sm font-semibold text-slate-900">Trạng thái</p>
            <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
          </div>
          <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-5">
            <p className="text-sm font-semibold text-slate-900">Gợi ý use case</p>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Tách công cụ chuyển biệt khỏi lượng Video hiện tại để giao diện rõ ràng hơn cho người vận hành.
            </p>
          </div>
          <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-5">
            <p className="text-sm font-semibold text-slate-900"> sẵn sàng mở rộng</p>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Khi cần, mình có thể nối tiếp API và khu preview riêng cho từng tab mà không phải sửa lại cấu trúc tổng.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
