import { useEffect, useState } from 'react';
import { ContentStudioWorkspace } from '../components/content-studio/ContentStudioWorkspace';
import { marketingService } from '../services/marketingService';
import { SEOHead } from '../seo/SEOHead';
import { CONTENT_STUDIO_SEO_MAP } from '../seo/seo-config';
import { toast } from './Toast';
import {
  clearContentStudioLaunchParams,
  CONTENT_STUDIO_TAB_ROUTES,
  contentStudioPathToTab,
  readContentStudioLaunchParams,
  type ContentStudioTab,
} from '../utils/contentStudioNavigation';

export default function ContentStudioPage() {
  const [initialParams] = useState(readContentStudioLaunchParams);
  const [activeTab, setActiveTab] = useState<ContentStudioTab>(() => initialParams?.tab || contentStudioPathToTab(window.location.pathname) || 'image');

  useEffect(() => {
    if (!contentStudioPathToTab(window.location.pathname)) {
      window.history.replaceState(null, '', CONTENT_STUDIO_TAB_ROUTES[activeTab]);
    }
    const handlePopState = () => {
      const tab = contentStudioPathToTab(window.location.pathname);
      if (tab) setActiveTab(tab);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [activeTab]);

  const handleTabChange = (tab: ContentStudioTab) => {
    setActiveTab(tab);
    const nextPath = CONTENT_STUDIO_TAB_ROUTES[tab];
    if (window.location.pathname !== nextPath) window.history.pushState(null, '', nextPath);
  };

  const handleMediaSaved = async (cardId: string, mediaUrl: string, type: 'image' | 'video' | 'audio') => {
    if (!cardId || !mediaUrl || type === 'audio') return;
    const updateData = type === 'video'
      ? { videoUrl: mediaUrl, mediaType: 'video' as const }
      : { imageUrl: mediaUrl, mediaType: 'image' as const };
    try {
      await marketingService.updateCard(cardId, updateData);
      toast.success('Đã gắn nội dung vừa tạo vào bài marketing.');
    } catch (error) {
      console.error('Không thể lưu media vào card marketing:', error);
      toast.error('Nội dung đã tạo xong nhưng chưa thể gắn vào bài marketing.');
    }
  };

  return (
    <>
      <SEOHead meta={CONTENT_STUDIO_SEO_MAP[activeTab]} />
      <div className="h-full min-h-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <h1 className="sr-only">{CONTENT_STUDIO_SEO_MAP[activeTab].title}</h1>
        <ContentStudioWorkspace
          initialParams={initialParams}
          initialTab={activeTab}
          onTabChange={handleTabChange}
          onClearParams={clearContentStudioLaunchParams}
          onMediaSaved={handleMediaSaved}
        />
      </div>
    </>
  );
}
