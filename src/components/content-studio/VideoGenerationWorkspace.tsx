/* eslint-disable @typescript-eslint/no-unused-vars */
import { Suspense, lazy, useState, useEffect } from 'react';
import { Clapperboard, Sparkles, Wand2, Film, Scissors, LayoutTemplate } from 'lucide-react';
import { SimpleVideoWorkspace } from './SimpleVideoWorkspace';
import { EditVideoWorkspace } from './EditVideoWorkspace';
import LongToShortTab from '../../pages/LongToShortTab';
import { VideoTemplateLibrary } from './video-templates/VideoTemplateLibrary';
import { TemplateEditorWorkspace } from '../template-editor/TemplateEditorWorkspace';
import { AspectRatioType, TemplateEditorProject } from '../template-editor/types';

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

export type VideoToolTab = 'templates' | 'veo' | 'heygen' | 'kling-motion' | 'edit-video' | 'long-to-short';

const VIDEO_TOOL_TABS: Array<{
  id: VideoToolTab;
  label: string;
  icon: typeof Sparkles;
}> = [
  { id: 'templates', label: 'Mẫu video', icon: LayoutTemplate },
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
  initialVideoTab = 'templates',
  initialImage,
  autoTrigger,
  engineType,
  usePersonalVoice,
}: VideoGenerationWorkspaceProps) {
  const [activeVideoTab, setActiveVideoTab] = useState<VideoToolTab>(initialVideoTab);
  const [editVideoSourceUrl, setEditVideoSourceUrl] = useState<string | null>(null);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [templateEditorConfig, setTemplateEditorConfig] = useState<{
    initialData?: Partial<TemplateEditorProject>;
  } | null>(null);

  useEffect(() => {
    if (initialVideoTab) {
      setActiveVideoTab(initialVideoTab);
    }
  }, [initialVideoTab]);

  return (
    <div className="flex flex-col gap-4">
      <div className="mx-auto flex w-full max-w-[1500px] items-center justify-start px-2">
        <div className="inline-flex w-fit items-center gap-1 rounded-2xl border border-slate-200 bg-white/90 p-1 shadow-xs">
          {VIDEO_TOOL_TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setActiveVideoTab(id)}
              className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold transition-all cursor-pointer ${
                activeVideoTab === id
                  ? 'bg-slate-950 text-white shadow-xs'
                  : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {activeVideoTab === 'templates' && (
        <VideoTemplateLibrary
          onSelectEditTab={(projectId, mediaUrl, title, aspectRatio, duration) => {
            if (projectId) {
              setActiveProjectId(projectId);
            }
            if (mediaUrl) {
              setEditVideoSourceUrl(mediaUrl);
            }
            setTemplateEditorConfig({
              initialData: {
                id: projectId,
                title: title || 'Dự án từ mẫu TikTok',
                aspectRatio: (aspectRatio as AspectRatioType) || '9:16',
                duration: duration,
                previewVideoUrl: mediaUrl,
                thumbnailUrl: mediaUrl,
              },
            });
          }}
        />
      )}

      {templateEditorConfig && (
        <TemplateEditorWorkspace
          initialProjectData={templateEditorConfig.initialData}
          onBackToLibrary={() => setTemplateEditorConfig(null)}
        />
      )}

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
          onClearInitialVideoUrl={() => {
            setEditVideoSourceUrl(null);
            setActiveProjectId(null);
          }}
        />
      )}

      {activeVideoTab === 'long-to-short' && (
        <LongToShortTab />
      )}
    </div>
  );
}
