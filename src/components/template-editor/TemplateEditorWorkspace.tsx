import React, { useEffect, useRef, useState } from 'react';
import { useTemplateEditor } from './hooks/useTemplateEditor';
import { TemplateEditorSidebar } from './TemplateEditorSidebar';
import { TemplateEditorAssetPanel } from './TemplateEditorAssetPanel';
import { TemplateEditorTopbar } from './TemplateEditorTopbar';
import { TemplateEditorCanvas } from './TemplateEditorCanvas';
import { TemplateEditorTimeline } from './TemplateEditorTimeline';
import { TemplateEditorProperties } from './TemplateEditorProperties';
import { TemplateExportModal } from './TemplateExportModal';
import { TemplateEditorMode, TemplateEditorProject } from './types';
import { Monitor } from 'lucide-react';
import { videoTemplateService } from '../../services/videoTemplateService';
import { toast } from '../../pages/Toast';

interface TemplateEditorWorkspaceProps {
  initialMode?: TemplateEditorMode;
  initialProjectData?: Partial<TemplateEditorProject>;
  onBackToLibrary: () => void;
}

export function TemplateEditorWorkspace({
  initialMode = 'edit-project',
  initialProjectData,
  onBackToLibrary,
}: TemplateEditorWorkspaceProps) {
  const [saveStatus, setSaveStatus] = useState<'loading' | 'saving' | 'saved' | 'error'>('loading');
  const revisionRef = useRef(0);
  const readyRef = useRef(false);
  const lastSavedRef = useRef('');
  const {
    project,
    selectedItem,
    selectedItemId,
    activeSidebarTab,
    mediaAssets,
    currentTime,
    isPlaying,
    zoomLevel,
    isExportModalOpen,
    canUndo,
    canRedo,
    setActiveSidebarTab,
    setSelectedItemId,
    setZoomLevel,
    togglePlay,
    seekTo,
    setProjectTitle,
    setAspectRatio,
    selectItem,
    updateItem,
    addItem,
    removeItem,
    duplicateItem,
    reorderItem,
    replaceItemMedia,
    toggleItemReplaceable,
    uploadMediaFiles,
    retryMediaUpload,
    deleteMediaAsset,
    undo,
    redo,
    openExportModal,
    closeExportModal,
    hydrateProject,
  } = useTemplateEditor(initialMode, initialProjectData, onBackToLibrary);

  useEffect(() => {
    let cancelled = false;
    readyRef.current = false;
    setSaveStatus('loading');

    const load = async () => {
      try {
        const data = initialProjectData?.id
          ? await videoTemplateService.getProject(initialProjectData.id)
          : await videoTemplateService.createProject({
              title: project.title,
              description: project.description,
              categoryId: project.categoryId,
              tags: project.tags,
              aspectRatio: project.aspectRatio,
              duration: project.duration,
              mode: initialMode,
              tracks: project.tracks,
              items: project.items,
              coverUrl: project.coverUrl,
            });
        if (cancelled) return;
        const loadedProject = {
          ...project,
          ...data,
          mode: data.mode,
          tracks: data.tracks,
          items: data.items,
        } as unknown as TemplateEditorProject;
        revisionRef.current = data.revision;
        lastSavedRef.current = JSON.stringify(loadedProject);
        hydrateProject(loadedProject);
        readyRef.current = true;
        setSaveStatus('saved');
      } catch (error) {
        if (cancelled) return;
        setSaveStatus('error');
        toast.error(error instanceof Error ? error.message : 'Không thể tải dự án video.');
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
    // Initialization is intentionally scoped to the selected project.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialProjectData?.id, initialMode]);

  useEffect(() => {
    if (!readyRef.current) return;
    const snapshot = JSON.stringify(project);
    if (snapshot === lastSavedRef.current) return;
    setSaveStatus('saving');
    const timer = window.setTimeout(async () => {
      try {
        const saved = await videoTemplateService.updateProject(project.id, {
          title: project.title,
          description: project.description,
          categoryId: project.categoryId,
          tags: project.tags,
          aspectRatio: project.aspectRatio,
          duration: project.duration,
          mode: project.mode,
          tracks: project.tracks,
          items: project.items,
          coverUrl: project.coverUrl,
          expectedRevision: revisionRef.current,
        });
        revisionRef.current = saved.revision;
        lastSavedRef.current = snapshot;
        setSaveStatus('saved');
      } catch (error) {
        setSaveStatus('error');
        toast.error(error instanceof Error ? error.message : 'Không thể tự động lưu dự án.');
      }
    }, 800);
    return () => window.clearTimeout(timer);
  }, [project]);

  return (
    <div className="fixed inset-0 z-50 bg-slate-950 flex flex-col font-sans overflow-hidden select-none">
      {/* Small Screen Warning Notice (Desktop first) */}
      <div className="lg:hidden bg-amber-500 text-slate-950 px-4 py-1.5 text-center text-xs font-bold flex items-center justify-center gap-2 z-50 shrink-0">
        <Monitor className="h-4 w-4" />
        Trình chỉnh sửa CapCut Web hoạt động tốt nhất trên màn hình máy tính (khuyên dùng độ phân giải 1440px trở lên).
      </div>

      {/* Top Action Header Bar */}
      <TemplateEditorTopbar
        title={project.title}
        aspectRatio={project.aspectRatio}
        zoomLevel={zoomLevel}
        canUndo={canUndo}
        canRedo={canRedo}
        onSetTitle={setProjectTitle}
        onSetAspectRatio={setAspectRatio}
        onSetZoomLevel={setZoomLevel}
        onUndo={undo}
        onRedo={redo}
        onOpenExport={openExportModal}
        onBack={onBackToLibrary}
        saveStatus={saveStatus}
      />

      {/* Main Workspace Body */}
      <div className="flex-1 flex min-h-0 overflow-hidden relative">
        {/* Far-left dark toolbar */}
        <TemplateEditorSidebar
          activeTab={activeSidebarTab}
          onSelectTab={setActiveSidebarTab}
        />

        {/* Left Resource Asset Panel */}
        <TemplateEditorAssetPanel
          activeTab={activeSidebarTab}
          mediaAssets={mediaAssets}
          selectedItem={selectedItem}
          onUploadFiles={uploadMediaFiles}
          onDeleteMediaAsset={deleteMediaAsset}
          onRetryMediaUpload={retryMediaUpload}
          onAddMediaAsset={(asset) =>
            addItem(asset.type, {
              sourceUrl: asset.url,
              thumbnailUrl: asset.thumbnailUrl,
              label: asset.name,
              duration: asset.duration || 5,
            })
          }
          onReplaceMediaAsset={(itemId, asset) => replaceItemMedia(itemId, asset)}
          onAddTextPreset={(preset) =>
            addItem('text', {
              text: preset.text,
              style: {
                fontFamily: 'Inter',
                fontSize: preset.fontSize,
                color: preset.color,
                align: 'center',
                bold: preset.bold,
                italic: false,
                x: 50,
                y: 60,
              },
            })
          }
          onAddAudioTrack={(track) =>
            addItem('audio', {
              sourceUrl: track.url,
              label: track.name,
              duration: track.duration,
            })
          }
        />

        {/* Center Area: Viewport Canvas & Timeline */}
        <div className="flex-1 flex flex-col min-w-0 bg-slate-100 overflow-hidden relative">
          {/* Canvas Viewport */}
          <TemplateEditorCanvas
            project={project}
            currentTime={currentTime}
            isPlaying={isPlaying}
            selectedItem={selectedItem}
            onSelectItem={selectItem}
            zoomLevel={zoomLevel}
          />

          {/* Multi-track Timeline matching CapCut layout */}
          <TemplateEditorTimeline
            project={project}
            currentTime={currentTime}
            selectedItemId={selectedItemId}
            isPlaying={isPlaying}
            onTogglePlay={togglePlay}
            onSelectItem={selectItem}
            onSeek={seekTo}
            onRemoveItem={removeItem}
            onDuplicateItem={duplicateItem}
            onReorderItem={reorderItem}
            onToggleReplaceable={toggleItemReplaceable}
            mediaAssets={mediaAssets}
            onReplaceItemMedia={replaceItemMedia}
            onSelectSidebarTab={setActiveSidebarTab}
          />
        </div>

        {/* Right Properties Panel */}
        <TemplateEditorProperties
          selectedItem={selectedItem}
          onUpdateItem={updateItem}
          onRemoveItem={removeItem}
          onClose={() => setSelectedItemId(null)}
        />
      </div>

      {/* Simulated Modals */}
      <TemplateExportModal
        isOpen={isExportModalOpen}
        onClose={closeExportModal}
        projectTitle={project.title}
      />
    </div>
  );
}
