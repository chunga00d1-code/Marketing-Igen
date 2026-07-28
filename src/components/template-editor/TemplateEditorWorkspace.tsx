import React, { useEffect, useRef, useState } from 'react';
import { useTemplateEditor } from './hooks/useTemplateEditor';
import { TemplateEditorTopbar } from './TemplateEditorTopbar';
import { TemplateEditorCanvas } from './TemplateEditorCanvas';
import { TemplateEditorTimeline } from './TemplateEditorTimeline';
import { TemplateExportModal } from './TemplateExportModal';
import { TemplateExportHistory } from './TemplateExportHistory';
import { TemplateEditorMode, TemplateEditorProject } from './types';
import {
  createTemplateEditorAutosaveQueue,
  requireTemplateEditorAutosaveQueue,
  retryTemplateEditorAutosave,
  type TemplateEditorAutosaveQueue,
  type TemplateEditorSaveStatus,
} from './template-editor-autosave';
import { Play, Pause, Minimize2, Monitor } from 'lucide-react';
import { videoTemplateService } from '../../services/videoTemplateService';
import { toast } from '../../pages/Toast';
import type { SaveVideoProjectInput } from '../../types/video-template';
import { findShortVideoReplacementIssues } from './template-editor-replacement';
import { resolveRenderedTemplatePreviewUrl } from './template-editor-media';

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
  const [saveStatus, setSaveStatus] = useState<TemplateEditorSaveStatus>('loading');
  const [isExportHistoryOpen, setIsExportHistoryOpen] = useState(false);
  const readyRef = useRef(false);
  const lastSavedRef = useRef('');
  const latestSnapshotRef = useRef('');
  const autosaveRef = useRef<TemplateEditorAutosaveQueue<SaveVideoProjectInput> | null>(null);

  const {
    project,
    selectedItem,
    selectedItemId,
    mediaAssets,
    currentTime,
    isPlaying,
    zoomLevel,
    isExportModalOpen,
    canUndo,
    canRedo,
    setZoomLevel,
    togglePlay,
    seekTo,
    setProjectTitle,
    setAspectRatio,
    selectItem,
    removeItem,
    duplicateItem,
    reorderItem,
    replaceItemMedia,
    replaceItemWithFile,
    toggleItemReplaceable,
    undo,
    redo,
    openExportModal,
    closeExportModal,
    hydrateProject,
  } = useTemplateEditor(initialMode, initialProjectData, onBackToLibrary);

  const [isFullscreenPreview, setIsFullscreenPreview] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullscreenPreview) {
        setIsFullscreenPreview(false);
        if (document.fullscreenElement) {
          document.exitFullscreen().catch(() => {});
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreenPreview]);

  const toggleFullscreenPreview = () => {
    setIsFullscreenPreview((prev) => {
      const next = !prev;
      if (next) {
        document.documentElement.requestFullscreen().catch(() => {});
      } else if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
      return next;
    });
  };

  useEffect(() => {
    let cancelled = false;
    let autosaveQueue: TemplateEditorAutosaveQueue<SaveVideoProjectInput> | null = null;
    autosaveRef.current?.dispose();
    autosaveRef.current = null;
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
          previewVideoUrl: resolveRenderedTemplatePreviewUrl(
            data.sourceMediaUrl,
            project.previewVideoUrl,
            initialProjectData?.previewVideoUrl
          ),
        } as unknown as TemplateEditorProject;
        const loadedSnapshot = JSON.stringify(loadedProject);
        lastSavedRef.current = loadedSnapshot;
        latestSnapshotRef.current = loadedSnapshot;
        hydrateProject(loadedProject);
        autosaveQueue = createTemplateEditorAutosaveQueue<SaveVideoProjectInput>({
          initialRevision: data.revision,
          persist: (input, expectedRevision) =>
            videoTemplateService.updateProject(data.id, { ...input, expectedRevision }),
          onAttempt: () => {
            if (!cancelled) setSaveStatus('saving');
          },
          onPersisted: (serialized) => {
            if (cancelled) return;
            lastSavedRef.current = serialized;
            if (latestSnapshotRef.current === serialized) {
              setSaveStatus('saved');
            }
          },
          onError: (error) => {
            if (cancelled) return;
            setSaveStatus('error');
            toast.error(error instanceof Error ? error.message : 'Không thể tự động lưu dự án.');
          },
        });
        autosaveRef.current = autosaveQueue;
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
      readyRef.current = false;
      autosaveQueue?.dispose();
      if (autosaveRef.current === autosaveQueue) {
        autosaveRef.current = null;
      }
    };
    // Initialization is intentionally scoped to the selected project.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialProjectData?.id, initialMode]);

  useEffect(() => {
    if (!readyRef.current) return;
    const snapshot = JSON.stringify(project);
    latestSnapshotRef.current = snapshot;
    if (snapshot === lastSavedRef.current) return;
    setSaveStatus('saving');
    const timer = window.setTimeout(() => {
      autosaveRef.current?.enqueue({
        serialized: snapshot,
        value: {
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
        },
      });
    }, 800);
    return () => window.clearTimeout(timer);
  }, [project]);

  const ensureAutosave = async (): Promise<void> => {
    const autosaveQueue = requireTemplateEditorAutosaveQueue({
      isReady: readyRef.current,
      saveStatus,
      queue: autosaveRef.current,
    });
    const snapshot = JSON.stringify(project);
    latestSnapshotRef.current = snapshot;
    if (snapshot !== lastSavedRef.current) {
      setSaveStatus('saving');
      autosaveQueue.enqueue({
        serialized: snapshot,
        value: {
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
        },
      });
    }
    await autosaveQueue.flush();
  };

  const retryAutosave = (): void => {
    try {
      retryTemplateEditorAutosave({
        isReady: readyRef.current,
        saveStatus,
        queue: autosaveRef.current,
      });
      toast.info('Đang thử lưu lại dự án.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Không thể thử lưu lại dự án.');
    }
  };

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
        onOpenHistory={() => setIsExportHistoryOpen(true)}
        onBack={onBackToLibrary}
        saveStatus={saveStatus}
        onRetrySave={readyRef.current ? retryAutosave : undefined}
      />

      {/* Main Workspace Body */}
      <div className="flex-1 flex min-h-0 overflow-hidden relative">
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
            onReplaceItemWithFile={replaceItemWithFile}
            onToggleFullscreen={toggleFullscreenPreview}
            isFullscreenPreview={isFullscreenPreview}
          />
        </div>
      </div>

      {/* Fullscreen Theater Preview Modal */}
      {isFullscreenPreview && (
        <div className="fixed inset-0 z-50 bg-slate-950 flex flex-col justify-between p-4 md:p-6 select-none animate-in fade-in duration-200">
          {/* Top Bar */}
          <div className="flex items-center justify-between text-white border-b border-slate-800/80 pb-3 px-2">
            <div className="flex items-center gap-3">
              <span className="font-bold text-sm text-slate-100">{project.title}</span>
              <span className="rounded bg-slate-800 px-2 py-0.5 text-[11px] font-semibold text-slate-300">
                {project.aspectRatio}
              </span>
            </div>

            <button
              type="button"
              onClick={toggleFullscreenPreview}
              className="flex items-center gap-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs px-3 py-1.5 transition-all cursor-pointer"
            >
              <Minimize2 className="h-4 w-4 text-cyan-400" />
              Thoát toàn màn hình (Esc)
            </button>
          </div>

          {/* Center Canvas Viewport */}
          <div className="flex-1 flex items-center justify-center py-4 overflow-hidden">
            <TemplateEditorCanvas
              project={project}
              currentTime={currentTime}
              isPlaying={isPlaying}
              selectedItem={selectedItem}
              onSelectItem={selectItem}
              zoomLevel={100}
            />
          </div>

          {/* Bottom Playback Scrubber Control Bar */}
          <div className="flex items-center gap-4 bg-slate-900/90 border border-slate-800 rounded-2xl px-5 py-3 text-white max-w-4xl mx-auto w-full shadow-2xl backdrop-blur-md">
            <button
              type="button"
              onClick={togglePlay}
              aria-label={isPlaying ? 'Pause' : 'Play'}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-cyan-500 text-white shadow-md hover:bg-cyan-400 active:scale-95 transition-all cursor-pointer shrink-0"
            >
              {isPlaying ? <Pause className="h-4 w-4 fill-white" /> : <Play className="h-4 w-4 fill-white translate-x-0.5" />}
            </button>

            <div className="font-mono text-xs font-semibold text-slate-300 shrink-0">
              <span>{Math.floor(currentTime / 60).toString().padStart(2, '0')}:{Math.floor(currentTime % 60).toString().padStart(2, '0')}</span>
              <span className="text-slate-500 mx-1">/</span>
              <span>{Math.floor(project.duration / 60).toString().padStart(2, '0')}:{Math.floor(project.duration % 60).toString().padStart(2, '0')}</span>
            </div>

            <input
              type="range"
              min={0}
              max={project.duration}
              step={0.01}
              value={currentTime}
              onChange={(e) => seekTo(Number(e.target.value))}
              className="flex-1 h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-400"
            />
          </div>
        </div>
      )}

      {/* Render Export Modal */}
      <TemplateExportModal
        isOpen={isExportModalOpen}
        onClose={closeExportModal}
        projectTitle={project.title}
        projectId={project.id}
        onEnsureAutosave={ensureAutosave}
        validationIssues={findShortVideoReplacementIssues(project.items)}
      />

      {/* Export History Drawer */}
      <TemplateExportHistory
        isOpen={isExportHistoryOpen}
        onClose={() => setIsExportHistoryOpen(false)}
        projectId={project.id}
      />
    </div>
  );
}
