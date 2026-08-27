import { useEffect, useRef, useState } from 'react';
import { ImageIcon, Layers3 } from 'lucide-react';
import { BulkCreateWorkspace } from './BulkCreateWorkspace';
import { ImageGenerationWorkspace } from './ImageGenerationWorkspace';
import type { ContentStudioLaunchParams, ContentStudioTab } from '../../utils/contentStudioNavigation';

interface ContentStudioWorkspaceProps {
  initialTab?: ContentStudioTab;
  initialParams?: ContentStudioLaunchParams | null;
  onClearParams?: () => void;
  onMediaSaved?: (cardId: string, mediaUrl: string, type: 'image' | 'video' | 'audio') => void;
  onTabChange?: (tab: ContentStudioTab) => void;
}

function resolvedTab(tab: ContentStudioTab | 'template' | undefined): ContentStudioTab {
  return tab === 'template' ? 'bulk' : tab || 'image';
}

export function ContentStudioWorkspace({ initialParams, initialTab, onClearParams, onMediaSaved, onTabChange }: ContentStudioWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<ContentStudioTab>(() => resolvedTab(initialParams?.tab || initialTab));
  const [prevTab, setPrevTab] = useState<ContentStudioTab>('image');
  const clearParamsRef = useRef(onClearParams);

  const changeTab = (tab: ContentStudioTab) => {
    if (activeTab !== 'bulk') setPrevTab(activeTab);
    setActiveTab(tab);
    onTabChange?.(tab);
  };

  useEffect(() => {
    clearParamsRef.current = onClearParams;
  }, [onClearParams]);

  useEffect(() => {
    if (initialParams) setActiveTab(resolvedTab(initialParams.tab));
  }, [initialParams]);

  useEffect(() => {
    if (initialTab) setActiveTab(resolvedTab(initialTab));
  }, [initialTab]);

  useEffect(() => () => clearParamsRef.current?.(), []);

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-[linear-gradient(180deg,#fcfdfd_0%,#f4f8fb_100%)]" id="content_studio_workspace_root">
      <div className="shrink-0 border-b border-slate-200/80 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/75">
        <div className="mx-auto flex w-full max-w-[1500px] items-center justify-center px-4 py-1.5 md:px-6">
          <div className="inline-flex w-fit items-center gap-1.5 rounded-2xl border border-slate-100 bg-slate-50/80 p-1 shadow-2xs">
            <button
              type="button"
              onClick={() => changeTab('image')}
              className={`inline-flex cursor-pointer items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition-all select-none ${activeTab === 'image' ? 'bg-[#0284c7] text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100/60 hover:text-slate-900'}`}
            >
              <ImageIcon className={`h-4 w-4 ${activeTab === 'image' ? 'text-white' : 'text-slate-500'}`} />
              Tạo hình ảnh
            </button>
            <button
              type="button"
              onClick={() => changeTab('bulk')}
              className={`inline-flex cursor-pointer items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition-all select-none ${activeTab === 'bulk' ? 'bg-[#0284c7] text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100/60 hover:text-slate-900'}`}
            >
              <Layers3 className={`h-4 w-4 ${activeTab === 'bulk' ? 'text-white' : 'text-slate-500'}`} />
              Thiết kế hàng loạt
            </button>
          </div>
        </div>
      </div>

      <div className={`min-h-0 flex-1 ${activeTab === 'bulk' ? 'overflow-hidden' : 'overflow-y-auto px-4 py-3 md:px-6 md:py-4'}`} id="content_studio_tab_body">
        {activeTab === 'image' && (
          <ImageGenerationWorkspace
            initialPrompt={initialParams?.prompt}
            cardId={initialParams?.cardId}
            onMediaSaved={onMediaSaved}
            initialImage={initialParams?.image}
            autoTrigger={initialParams?.autoTrigger}
          />
        )}
        {activeTab === 'bulk' && (
          <BulkCreateWorkspace
            onClose={() => changeTab(prevTab)}
            cardId={initialParams?.cardId}
            initialCampaignId={initialParams?.campaignId}
            onMediaSaved={onMediaSaved}
          />
        )}
      </div>
    </div>
  );
}
