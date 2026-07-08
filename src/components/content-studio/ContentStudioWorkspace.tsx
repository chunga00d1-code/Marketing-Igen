import { useState, useEffect, useRef } from 'react';
import { ImageIcon, Mic, Video } from 'lucide-react';
import { ImageGenerationWorkspace } from './ImageGenerationWorkspace';
import { VideoGenerationWorkspace } from './VideoGenerationWorkspace';
import { VoiceGenerationWorkspace } from './VoiceGenerationWorkspace';

interface ContentStudioWorkspaceProps {
  initialParams?: {
    tab: 'image' | 'video' | 'voice';
    prompt: string;
    cardId: string;
    image?: string;
    autoTrigger?: boolean;
    videoSubTab?: 'veo' | 'heygen' | 'edit-video';
    title?: string;
    description?: string;
    engineType?: string;
    usePersonalVoice?: boolean;
  } | null;
  onClearParams?: () => void;
  onMediaSaved?: (cardId: string, mediaUrl: string, type: 'image' | 'video' | 'audio') => void;
}

export function ContentStudioWorkspace({ initialParams, onClearParams, onMediaSaved }: ContentStudioWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<'image' | 'video' | 'voice'>(initialParams?.tab || 'image');
  const [videoSubTab, setVideoSubTab] = useState<'veo' | 'heygen' | 'edit-video'>('veo');
  const clearParamsRef = useRef(onClearParams);

  useEffect(() => {
    clearParamsRef.current = onClearParams;
  }, [onClearParams]);

  useEffect(() => {
    if (initialParams) {
      setActiveTab(initialParams.tab);
      if (initialParams.tab === 'video') {
        setVideoSubTab(initialParams.videoSubTab || 'veo');
      }
    }
  }, [initialParams]);

  useEffect(() => {
    return () => {
      clearParamsRef.current?.();
    };
  }, []);

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-[linear-gradient(180deg,#fcfdfd_0%,#f4f8fb_100%)]" id="content_studio_workspace_root">
      <div className="shrink-0 border-b border-slate-200/80 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/75">
        <div className="mx-auto flex w-full max-w-[1500px] items-center justify-center py-1.5 px-4 md:px-6">
          <div className="inline-flex w-fit items-center gap-1 rounded-2xl border border-slate-200/50 bg-slate-100/80 p-1 shadow-2xs">
            <button
              onClick={() => setActiveTab('image')}
              className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'image' ? 'bg-white text-indigo-700 shadow-sm border border-slate-200/40 ring-1 ring-slate-100' : 'text-slate-500 hover:bg-white/60 hover:text-slate-800'
              }`}
            >
              <ImageIcon className="h-3.5 w-3.5" />
              Tạo hình ảnh
            </button>
            <button
              onClick={() => setActiveTab('video')}
              className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'video' ? 'bg-white text-indigo-700 shadow-sm border border-slate-200/40 ring-1 ring-slate-100' : 'text-slate-500 hover:bg-white/60 hover:text-slate-800'
              }`}
            >
              <Video className="h-3.5 w-3.5" />
              Tạo video
            </button>
            <button
              onClick={() => setActiveTab('voice')}
              className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'voice' ? 'bg-white text-indigo-700 shadow-sm border border-slate-200/40 ring-1 ring-slate-100' : 'text-slate-500 hover:bg-white/60 hover:text-slate-800'
              }`}
            >
              <Mic className="h-3.5 w-3.5" />
              Tạo giọng nói
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 md:px-6 md:py-4" id="content_studio_tab_body">
        {activeTab === 'image' && (
          <ImageGenerationWorkspace
            initialPrompt={initialParams?.prompt}
            cardId={initialParams?.cardId}
            onMediaSaved={onMediaSaved}
            initialImage={initialParams?.image}
            autoTrigger={initialParams?.autoTrigger}
          />
        )}
        {activeTab === 'video' && (
          <VideoGenerationWorkspace
            initialPrompt={initialParams?.prompt}
            cardId={initialParams?.cardId}
            onMediaSaved={onMediaSaved}
            initialVideoTab={videoSubTab}
            initialImage={initialParams?.image}
            autoTrigger={initialParams?.autoTrigger}
            engineType={initialParams?.engineType}
            usePersonalVoice={initialParams?.usePersonalVoice}
          />
        )}
        {activeTab === 'voice' && (
          <VoiceGenerationWorkspace
            initialText={initialParams?.prompt}
            initialTitle={initialParams?.title}
            initialDescription={initialParams?.description}
            cardId={initialParams?.cardId}
            autoTrigger={initialParams?.autoTrigger}
            onMediaSaved={onMediaSaved}
            onNavigateToHumanVideo={() => {
              setVideoSubTab('heygen');
              setActiveTab('video');
            }}
          />
        )}
      </div>
    </div>
  );
}
