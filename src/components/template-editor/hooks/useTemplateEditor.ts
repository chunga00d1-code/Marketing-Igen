import { useState, useEffect, useRef, useCallback } from 'react';
import {
  TemplateEditorProject,
  TemplateEditorItem,
  SidebarTabType,
  AspectRatioType,
  MediaAsset,
  ItemType,
  TemplateEditorMode,
} from '../types';
import { createDefaultProject } from '../mockData';
import { toast } from '../../../pages/Toast';
import {
  uploadEditorMedia,
  validateEditorMediaMetadata,
} from '../../../services/videoProjectMediaService';
import { selectInitialEditorItemId } from '../template-editor-selection';
import { createEditorItemMediaReplacementTransition } from '../template-editor-replacement';
import {
  loadSavedUploadedMediaAssets,
  saveUploadedMediaAssets,
} from '../template-editor-media';

export function useTemplateEditor(
  initialMode: TemplateEditorMode = 'edit-project',
  initialProjectData?: Partial<TemplateEditorProject>,
  onBackToLibrary?: () => void
) {
  // Project State
  const [project, setProject] = useState<TemplateEditorProject>(() =>
    createDefaultProject(initialMode, initialProjectData)
  );

  // History Undo/Redo stack - initialized with step 0
  const [history, setHistory] = useState<TemplateEditorProject[]>(() => [
    JSON.parse(JSON.stringify(createDefaultProject(initialMode, initialProjectData))),
  ]);
  const [historyIndex, setHistoryIndex] = useState<number>(0);

  // Push to history when project state mutates
  const pushHistory = useCallback((newProj: TemplateEditorProject) => {
    setHistory((prev) => {
      const sliced = prev.slice(0, historyIndex + 1);
      return [...sliced, JSON.parse(JSON.stringify(newProj))];
    });
    setHistoryIndex((prev) => prev + 1);
  }, [historyIndex]);

  // Sidebar & Asset Panel State
  const [activeSidebarTab, setActiveSidebarTab] = useState<SidebarTabType>('media');
  const [mediaAssets, setMediaAssets] = useState<MediaAsset[]>(() => loadSavedUploadedMediaAssets());

  // Auto-persist user uploaded media assets
  useEffect(() => {
    saveUploadedMediaAssets(mediaAssets);
  }, [mediaAssets]);

  // Playback & Selection State
  const [selectedItemId, setSelectedItemId] = useState<string | null>('item-v1');
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [zoomLevel, setZoomLevel] = useState<number>(100);

  // Modals
  const [isExportModalOpen, setIsExportModalOpen] = useState<boolean>(false);

  // Animation Frame for Playhead Progression
  const lastTickRef = useRef<number | null>(null);
  useEffect(() => {
    let animId: number;
    const tick = (timestamp: number) => {
      if (lastTickRef.current !== null && isPlaying) {
        const delta = (timestamp - lastTickRef.current) / 1000;
        setCurrentTime((prev) => {
          const next = prev + delta;
          if (next >= project.duration) {
            setIsPlaying(false);
            return 0;
          }
          return next;
        });
      }
      lastTickRef.current = timestamp;
      if (isPlaying) {
        animId = requestAnimationFrame(tick);
      }
    };

    if (isPlaying) {
      lastTickRef.current = performance.now();
      animId = requestAnimationFrame(tick);
    }

    return () => {
      cancelAnimationFrame(animId);
    };
  }, [isPlaying, project.duration]);

  // Actions
  const togglePlay = () => setIsPlaying(!isPlaying);

  const seekTo = (time: number) => {
    const clamped = Math.max(0, Math.min(time, project.duration));
    setCurrentTime(clamped);
  };

  const setProjectTitle = (title: string) => {
    setProject((prev) => {
      const next = { ...prev, title };
      pushHistory(next);
      return next;
    });
  };

  const setProjectDescription = (description: string) => {
    setProject((prev) => {
      const next = { ...prev, description };
      pushHistory(next);
      return next;
    });
  };

  const setAspectRatio = (aspectRatio: AspectRatioType) => {
    setProject((prev) => {
      const next = { ...prev, aspectRatio };
      pushHistory(next);
      return next;
    });
  };

  const selectItem = (id: string | null) => {
    setSelectedItemId(id);
  };

  const updateItem = (itemId: string, patch: Partial<TemplateEditorItem>) => {
    setProject((prev) => {
      const updatedItems = prev.items.map((item) =>
        item.id === itemId ? { ...item, ...patch } : item
      );
      // Recalculate project total duration if video track length changes
      const videoItems = updatedItems.filter((i) => i.type === 'video');
      const maxVideoEnd = videoItems.reduce((acc, curr) => Math.max(acc, curr.start + curr.duration), 0);
      const newDuration = Math.max(maxVideoEnd, 5);

      const next = { ...prev, items: updatedItems, duration: Number(newDuration.toFixed(1)) };
      pushHistory(next);
      return next;
    });
  };

  const addItem = (type: ItemType, payload: Partial<TemplateEditorItem>) => {
    setProject((prev) => {
      let trackId = 'track-video';
      if (type === 'text') trackId = 'track-text';
      if (type === 'audio') trackId = 'track-audio';

      const existingTrackItems = prev.items.filter((i) => i.trackId === trackId);
      const start = payload.start ?? (type === 'video' ? prev.duration : 0);
      const duration = payload.duration ?? (type === 'video' ? 5 : 4);

      const newItem: TemplateEditorItem = {
        id: `item-${Date.now().toString().slice(-6)}`,
        trackId,
        type,
        start,
        duration,
        sourceUrl: payload.sourceUrl,
        thumbnailUrl: payload.thumbnailUrl,
        text: payload.text,
        replaceable: payload.replaceable ?? false,
        style: payload.style,
        volume: payload.volume ?? 1,
        fitMode: payload.fitMode ?? 'cover',
        rotation: payload.rotation ?? 0,
        label: payload.label || (type === 'video' ? `Clip ${existingTrackItems.length + 1}` : type),
        order: existingTrackItems.length + 1,
      };

      const updatedItems = [...prev.items, newItem];
      const videoItems = updatedItems.filter((i) => i.type === 'video');
      const maxVideoEnd = videoItems.reduce((acc, curr) => Math.max(acc, curr.start + curr.duration), 0);
      const newDuration = Math.max(maxVideoEnd, 5);

      const next = { ...prev, items: updatedItems, duration: Number(newDuration.toFixed(1)) };
      pushHistory(next);
      setSelectedItemId(newItem.id);
      return next;
    });
  };

  const removeItem = (itemId: string) => {
    setProject((prev) => {
      const updatedItems = prev.items.filter((i) => i.id !== itemId);
      const next = { ...prev, items: updatedItems };
      pushHistory(next);
      if (selectedItemId === itemId) setSelectedItemId(null);
      return next;
    });
    toast.info('Đã xóa clip/thành phần khỏi timeline.');
  };

  const duplicateItem = (itemId: string) => {
    const target = project.items.find((i) => i.id === itemId);
    if (!target) return;

    addItem(target.type, {
      ...target,
      start: target.start + target.duration,
      label: `${target.label || target.type} (Bản sao)`,
    });
    toast.success('Đã nhân bản clip.');
  };

  const reorderItem = (itemId: string, direction: 'left' | 'right') => {
    setProject((prev) => {
      const videoItems = prev.items.filter((i) => i.type === 'video').sort((a, b) => a.start - b.start);
      const idx = videoItems.findIndex((i) => i.id === itemId);
      if (idx === -1) return prev;

      const swapIdx = direction === 'left' ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= videoItems.length) return prev;

      // Swap positions and start times
      const current = videoItems[idx];
      const swapTarget = videoItems[swapIdx];

      const newStartCurrent = swapTarget.start;
      const newStartTarget = current.start;

      const updatedItems = prev.items.map((item) => {
        if (item.id === current.id) return { ...item, start: newStartCurrent };
        if (item.id === swapTarget.id) return { ...item, start: newStartTarget };
        return item;
      });

      const next = { ...prev, items: updatedItems };
      pushHistory(next);
      return next;
    });
  };

  const replaceItemMedia = (itemId: string, newAsset: MediaAsset) => {
    const transition = createEditorItemMediaReplacementTransition({
      project,
      history,
      historyIndex,
      mediaAssets,
      selectedItemId,
      itemId,
      asset: newAsset,
    });

    if (transition.ok === false) {
      toast.error(transition.reason);
      return;
    }

    setProject(transition.state.project);
    setHistory(transition.state.history);
    setHistoryIndex(transition.state.historyIndex);
    setMediaAssets(transition.state.mediaAssets);
    toast.success(transition.successMessage);
  };

  const replaceItemWithFile = (itemId: string, file: File) => {
    let type: ItemType = 'video';
    try {
      type = validateEditorMediaMetadata(file).mediaType;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'File không hợp lệ.');
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    const asset: MediaAsset = {
      id: `asset-${Date.now().toString().slice(-6)}-${Math.random().toString(36).slice(-4)}`,
      name: file.name,
      type,
      url: objectUrl,
      thumbnailUrl: objectUrl,
      added: false,
      uploadStatus: 'uploading',
      uploadProgress: 0,
      sourceFile: file,
    };

    replaceItemMedia(itemId, asset);
    void uploadAsset(asset.id, file, objectUrl);
  };

  const toggleItemReplaceable = (itemId: string) => {
    setProject((prev) => {
      const updatedItems = prev.items.map((item) =>
        item.id === itemId ? { ...item, replaceable: !item.replaceable } : item
      );
      const next = { ...prev, items: updatedItems };
      pushHistory(next);
      return next;
    });
  };

  const uploadAsset = async (assetId: string, file: File, localUrl: string) => {
    try {
      const uploaded = await uploadEditorMedia(file, (uploadProgress) => {
        setMediaAssets((prev) => prev.map((asset) =>
          asset.id === assetId ? { ...asset, uploadProgress } : asset
        ));
      });
      setMediaAssets((prev) => prev.map((asset) =>
        asset.id === assetId
          ? {
              ...asset,
              type: uploaded.mediaType,
              url: uploaded.url,
              thumbnailUrl: uploaded.url,
              duration: uploaded.duration || asset.duration,
              uploadStatus: 'ready',
              uploadProgress: 100,
              uploadError: undefined,
              sourceFile: undefined,
            }
          : asset
      ));
      setProject((prev) => ({
        ...prev,
        items: prev.items.map((item) => {
          if (item.sourceUrl !== localUrl) return item;
          const isVisual = uploaded.mediaType === 'video' || uploaded.mediaType === 'image';
          return {
            ...item,
            sourceUrl: uploaded.url,
            thumbnailUrl: uploaded.url,
            type: uploaded.mediaType,
            ...(isVisual
              ? {
                  replacement: {
                    originalType: item.replacement?.originalType ?? (item.type === 'video' || item.type === 'image' ? item.type : 'video'),
                    sourceType: uploaded.mediaType as 'video' | 'image',
                    ...(uploaded.mediaType === 'video' && (uploaded.duration || item.replacement?.sourceDuration)
                      ? { sourceDuration: uploaded.duration || item.replacement?.sourceDuration }
                      : {}),
                  },
                }
              : {}),
          };
        }),
      }));
      URL.revokeObjectURL(localUrl);
    } catch (error) {
      const uploadError = error instanceof Error ? error.message : 'Không thể tải media lên.';
      setMediaAssets((prev) => prev.map((asset) =>
        asset.id === assetId
          ? { ...asset, uploadStatus: 'error', uploadError, uploadProgress: 0 }
          : asset
      ));
    }
  };

  const uploadMediaFiles = async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;
    const uploadJobs = fileArray.map((file) => {
      const objectUrl = URL.createObjectURL(file);
      let type: ItemType = 'video';
      let uploadError: string | undefined;
      try {
        type = validateEditorMediaMetadata(file).mediaType;
      } catch (error) {
        uploadError = error instanceof Error ? error.message : 'File không hợp lệ.';
      }
      const asset: MediaAsset = {
        id: `asset-${Date.now().toString().slice(-6)}-${Math.random().toString(36).slice(-4)}`,
        name: file.name,
        type,
        url: objectUrl,
        thumbnailUrl: objectUrl,
        added: false,
        uploadStatus: uploadError ? 'error' : 'uploading',
        uploadProgress: 0,
        uploadError,
        sourceFile: file,
      };
      return { asset, file, objectUrl };
    });

    setMediaAssets((prev) => [...uploadJobs.map(({ asset }) => asset), ...prev]);
    const validJobs = uploadJobs.filter(({ asset }) => asset.uploadStatus === 'uploading');
    let nextJobIndex = 0;
    const worker = async () => {
      while (nextJobIndex < validJobs.length) {
        const job = validJobs[nextJobIndex++];
        await uploadAsset(job.asset.id, job.file, job.objectUrl);
      }
    };
    await Promise.all(Array.from({ length: Math.min(3, validJobs.length) }, () => worker()));
    if (validJobs.length > 0) toast.success(`Đã xử lý ${validJobs.length} media tải lên.`);
  };

  const uploadMediaFile = (file: File) => {
    void uploadMediaFiles([file]);
  };

  const retryMediaUpload = (assetId: string) => {
    const asset = mediaAssets.find((candidate) => candidate.id === assetId);
    if (!asset?.sourceFile || !asset.url.startsWith('blob:')) return;
    setMediaAssets((prev) => prev.map((candidate) =>
      candidate.id === assetId
        ? { ...candidate, uploadStatus: 'uploading', uploadProgress: 0, uploadError: undefined }
        : candidate
    ));
    void uploadAsset(asset.id, asset.sourceFile, asset.url);
  };

  const deleteMediaAsset = (assetId: string) => {
    setMediaAssets((prev) => {
      const asset = prev.find((candidate) => candidate.id === assetId);
      if (asset?.url.startsWith('blob:')) URL.revokeObjectURL(asset.url);
      return prev.filter((a) => a.id !== assetId);
    });
    toast.info('Đã xóa phương tiện khỏi lịch sử lưu trữ.');
  };

  const undo = () => {
    if (historyIndex > 0) {
      const prevIdx = historyIndex - 1;
      setProject(JSON.parse(JSON.stringify(history[prevIdx])));
      setHistoryIndex(prevIdx);
    }
  };

  const redo = () => {
    if (historyIndex < history.length - 1) {
      const nextIdx = historyIndex + 1;
      setProject(JSON.parse(JSON.stringify(history[nextIdx])));
      setHistoryIndex(nextIdx);
    }
  };

  const selectedItem = project.items.find((i) => i.id === selectedItemId) || null;

  const hydrateProject = useCallback((nextProject: TemplateEditorProject) => {
    const snapshot = JSON.parse(JSON.stringify(nextProject)) as TemplateEditorProject;
    setProject(snapshot);
    setHistory([snapshot]);
    setHistoryIndex(0);
    setSelectedItemId(selectInitialEditorItemId(snapshot.items));
    setCurrentTime(0);
    setIsPlaying(false);
  }, []);

  return {
    project,
    selectedItem,
    selectedItemId,
    activeSidebarTab,
    mediaAssets,
    currentTime,
    isPlaying,
    zoomLevel,
    isExportModalOpen,
    canUndo: historyIndex > 0,
    canRedo: historyIndex < history.length - 1,
    // Methods
    setActiveSidebarTab,
    setSelectedItemId,
    setZoomLevel,
    togglePlay,
    seekTo,
    setProjectTitle,
    setProjectDescription,
    setAspectRatio,
    selectItem,
    updateItem,
    addItem,
    removeItem,
    duplicateItem,
    reorderItem,
    replaceItemMedia,
    replaceItemWithFile,
    toggleItemReplaceable,
    uploadMediaFile,
    uploadMediaFiles,
    retryMediaUpload,
    deleteMediaAsset,
    undo,
    redo,
    hydrateProject,
    openExportModal: () => setIsExportModalOpen(true),
    closeExportModal: () => setIsExportModalOpen(false),
    handleBack: onBackToLibrary,
  };
}
