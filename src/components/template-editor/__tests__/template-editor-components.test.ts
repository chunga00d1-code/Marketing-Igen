import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TemplateEditorAssetPanel } from '../TemplateEditorAssetPanel';
import { TemplateEditorProperties } from '../TemplateEditorProperties';
import { TemplateEditorSidebar } from '../TemplateEditorSidebar';
import { TemplateEditorTimeline } from '../TemplateEditorTimeline';
import { TemplateEditorTopbar } from '../TemplateEditorTopbar';
import { TemplateExportModal } from '../TemplateExportModal';
import { TemplateEditorCanvas } from '../TemplateEditorCanvas';
import {
  browserPreviewSourceForItem,
  resolveRenderedTemplatePreviewUrl,
  shouldUseRenderedTemplatePreview,
} from '../template-editor-media';
import type {
  MediaAsset,
  TemplateEditorItem,
  TemplateEditorProject,
} from '../types';

const noop = () => {};

function findElementByType(
  node: React.ReactNode,
  type: string
): React.ReactElement<Record<string, unknown>> | null {
  if (!React.isValidElement(node)) return null;
  const element = node as React.ReactElement<Record<string, unknown>>;
  if (element.type === type) return element;
  for (const child of React.Children.toArray(element.props.children as React.ReactNode)) {
    const match = findElementByType(child, type);
    if (match) return match;
  }
  return null;
}

const boundVisual: TemplateEditorItem = {
  id: 'shotstack-clip',
  trackId: 'shotstack-visual',
  type: 'video',
  start: 0,
  duration: 5,
  sourceUrl: 'https://example.test/clip.mp4',
  thumbnailUrl: 'https://example.test/clip.jpg',
  replaceable: true,
  volume: 0.6,
  fitMode: 'fit',
  label: 'Clip mẫu',
  order: 0,
  providerBinding: {
    provider: 'shotstack',
    trackIndex: 0,
    clipIndex: 0,
  },
};

const unboundSoundtrack: TemplateEditorItem = {
  id: 'legacy-soundtrack',
  trackId: 'track-audio',
  type: 'audio',
  start: 0,
  duration: 5,
  sourceUrl: 'https://example.test/music.mp3',
  label: 'Nhạc trong mẫu',
  order: 0,
};

const localAudio: TemplateEditorItem = {
  ...unboundSoundtrack,
  id: 'local-audio',
  label: 'Nhạc tự chọn',
};

const shotstackProject: TemplateEditorProject = {
  id: 'shotstack-project',
  title: 'Mẫu Shotstack',
  aspectRatio: '9:16',
  duration: 5,
  mode: 'edit-project',
  tracks: [
    { id: 'shotstack-visual', type: 'video', name: 'Hình ảnh' },
    { id: 'track-audio', type: 'audio', name: 'Âm thanh' },
  ],
  items: [boundVisual, unboundSoundtrack],
};

const audioAsset: MediaAsset = {
  id: 'audio-asset',
  name: 'Audio upload',
  type: 'audio',
  url: 'https://example.test/upload.mp3',
  thumbnailUrl: '',
};

const renderAssetPanel = (
  projectItems: TemplateEditorItem[],
  selectedItem: TemplateEditorItem | null = null
) => renderToStaticMarkup(React.createElement(TemplateEditorAssetPanel, {
  activeTab: 'audio',
  mediaAssets: [audioAsset],
  selectedItem,
  projectItems,
  onUploadFiles: noop,
  onAddMediaAsset: noop,
  onReplaceMediaAsset: noop,
  onAddTextPreset: noop,
  onAddAudioTrack: noop,
}));

test('properties and timeline render no destructive controls for a provider-bound clip', () => {
  const propertiesMarkup = renderToStaticMarkup(React.createElement(TemplateEditorProperties, {
    selectedItem: boundVisual,
    projectItems: shotstackProject.items,
    onUpdateItem: noop,
    onRemoveItem: noop,
    onClose: noop,
  }));
  const timelineMarkup = renderToStaticMarkup(React.createElement(TemplateEditorTimeline, {
    project: shotstackProject,
    currentTime: 0,
    selectedItemId: boundVisual.id,
    isPlaying: false,
    onTogglePlay: noop,
    onSelectItem: noop,
    onSeek: noop,
    onRemoveItem: noop,
    onDuplicateItem: noop,
    onReorderItem: noop,
    mediaAssets: [],
    onReplaceItemMedia: noop,
  }));

  assert.doesNotMatch(propertiesMarkup, /Xóa khỏi timeline/);
  assert.doesNotMatch(timelineMarkup, /title="Xóa clip"/);
  assert.doesNotMatch(timelineMarkup, /title="Nhân bản clip"/);
  assert.doesNotMatch(timelineMarkup, /title="Chuyển sang (trái|phải)"/);
  assert.match(timelineMarkup, /Nhạc trong mẫu/);
  assert.match(timelineMarkup, /Đã khóa/);
  assert.match(propertiesMarkup, /data-provider-properties="readonly"/);
  assert.match(propertiesMarkup, /data-provider-field="duration"[^>]*>5 giây</);
  assert.match(propertiesMarkup, /data-provider-field="volume"[^>]*>60%</);
  assert.match(propertiesMarkup, /data-provider-field="fit"[^>]*>Fit</);
  assert.doesNotMatch(propertiesMarkup, /<(input|textarea|select)\b/);
});

test('Shotstack project data hides the audio sidebar and renders the locked asset-panel state', () => {
  const sidebarMarkup = renderToStaticMarkup(React.createElement(TemplateEditorSidebar, {
    activeTab: 'media',
    onSelectTab: noop,
    projectItems: shotstackProject.items,
  }));
  const assetPanelMarkup = renderAssetPanel(shotstackProject.items, unboundSoundtrack);

  assert.doesNotMatch(sidebarMarkup, />Âm thanh</);
  assert.match(assetPanelMarkup, /Nhạc trong mẫu đã khóa/);
  assert.doesNotMatch(assetPanelMarkup, /Kho nhạc quảng cáo/);
  assert.doesNotMatch(assetPanelMarkup, /Audio upload/);
});

test('standalone editor keeps its audio sidebar and asset-panel library', () => {
  const sidebarMarkup = renderToStaticMarkup(React.createElement(TemplateEditorSidebar, {
    activeTab: 'audio',
    onSelectTab: noop,
    projectItems: [localAudio],
  }));
  const assetPanelMarkup = renderAssetPanel([localAudio], localAudio);

  assert.match(sidebarMarkup, />Âm thanh</);
  assert.match(assetPanelMarkup, /Kho nhạc quảng cáo/);
  assert.doesNotMatch(assetPanelMarkup, /Nhạc trong mẫu đã khóa/);
});

test('overlapping replacements render in separate clickable lanes without a batch control', () => {
  const overlappingProject: TemplateEditorProject = {
    ...shotstackProject,
    duration: 8,
    items: [
      boundVisual,
      {
        ...boundVisual,
        id: 'shotstack-overlap',
        start: 2,
        duration: 4,
        providerBinding: {
          provider: 'shotstack',
          trackIndex: 1,
          clipIndex: 0,
        },
      },
    ],
  };
  const markup = renderToStaticMarkup(React.createElement(TemplateEditorTimeline, {
    project: overlappingProject,
    currentTime: 0,
    selectedItemId: boundVisual.id,
    isPlaying: false,
    onTogglePlay: noop,
    onSelectItem: noop,
    onSeek: noop,
    onRemoveItem: noop,
    onDuplicateItem: noop,
    onReorderItem: noop,
    mediaAssets: [],
    onReplaceItemMedia: noop,
  }));

  assert.match(markup, /data-visual-lane-count="2"/);
  assert.match(markup, /data-lane-index="0"/);
  assert.match(markup, /data-lane-index="1"/);
  assert.doesNotMatch(markup, /Thay thế hàng loạt/);
});

test('provider merge-field text is editable while literal provider text remains read-only', () => {
  const mergeText: TemplateEditorItem = {
    id: 'shotstack-merge-text',
    trackId: 'track-text',
    type: 'text',
    start: 0,
    duration: 3,
    text: 'Headline: Sale',
    mergeValue: 'Sale',
    replaceable: true,
    label: 'Merge title',
    order: 1,
    providerBinding: {
      provider: 'shotstack',
      trackIndex: 0,
      clipIndex: 1,
      textMergeField: {
        key: 'HEADLINE',
        assetType: 'title',
        source: 'Headline: {{ HEADLINE }}',
        prefix: 'Headline: ',
        suffix: '',
      },
    },
  };
  const literalText: TemplateEditorItem = {
    ...mergeText,
    id: 'shotstack-literal-text',
    text: 'Locked literal title',
    replaceable: false,
    label: 'Literal title',
    providerBinding: {
      provider: 'shotstack',
      trackIndex: 0,
      clipIndex: 2,
    },
  };
  const renderProperties = (selectedItem: TemplateEditorItem) =>
    renderToStaticMarkup(React.createElement(TemplateEditorProperties, {
      selectedItem,
      projectItems: [boundVisual, mergeText, literalText],
      onUpdateItem: noop,
      onRemoveItem: noop,
      onClose: noop,
    }));

  const editableMarkup = renderProperties(mergeText);
  const literalMarkup = renderProperties(literalText);

  assert.match(editableMarkup, /data-provider-merge-field="editable"/);
  assert.match(editableMarkup, /<textarea\b[^>]*>Sale<\/textarea>/);
  assert.doesNotMatch(editableMarkup, /Headline: Sale|Headline: \{\{ HEADLINE \}\}/);
  assert.doesNotMatch(editableMarkup, /type="color"|type="number"|type="range"/);
  assert.doesNotMatch(literalMarkup, /data-provider-merge-field="editable"/);
  assert.doesNotMatch(literalMarkup, /<(input|textarea|select)\b/);
});

test('provider merge-field input survives JSON reload and updates only its value', () => {
  const mergeText = JSON.parse(JSON.stringify({
    id: 'shotstack-merge-text-reloaded',
    trackId: 'track-text',
    type: 'text',
    start: 0,
    duration: 3,
    text: 'Headline: Sale',
    mergeValue: 'Sale',
    replaceable: true,
    label: 'Merge title',
    order: 1,
    providerBinding: {
      provider: 'shotstack',
      trackIndex: 0,
      clipIndex: 1,
      textMergeField: {
        key: 'HEADLINE',
        assetType: 'title',
        source: 'Headline: {{ HEADLINE }}',
        prefix: 'Headline: ',
        suffix: '',
      },
    },
  })) as TemplateEditorItem;
  const updates: Array<{ id: string; patch: Partial<TemplateEditorItem> }> = [];
  const tree = TemplateEditorProperties({
    selectedItem: mergeText,
    projectItems: [boundVisual, mergeText],
    onUpdateItem: (id, patch) => updates.push({ id, patch }),
    onRemoveItem: noop,
    onClose: noop,
  });
  const textarea = findElementByType(tree, 'textarea');
  const onChange = textarea?.props.onChange as
    | ((event: { target: { value: string } }) => void)
    | undefined;

  assert.ok(textarea);
  assert.equal(textarea.props.value, 'Sale');
  assert.ok(onChange);
  onChange?.({ target: { value: 'Updated' } });
  assert.deepEqual(updates, [{
    id: mergeText.id,
    patch: {
      text: 'Headline: Updated',
      mergeValue: 'Updated',
    },
  }]);
});

test('provider text without authoritative merge metadata never exposes its full presentation', () => {
  const missingMetadata: TemplateEditorItem = {
    id: 'shotstack-merge-text-without-metadata',
    trackId: 'track-text',
    type: 'text',
    start: 0,
    duration: 3,
    text: 'Locked prefix: rendered value',
    replaceable: true,
    label: 'Unsafe legacy merge title',
    order: 1,
    providerBinding: {
      provider: 'shotstack',
      trackIndex: 0,
      clipIndex: 1,
    },
  };
  const markup = renderToStaticMarkup(React.createElement(TemplateEditorProperties, {
    selectedItem: missingMetadata,
    projectItems: [boundVisual, missingMetadata],
    onUpdateItem: noop,
    onRemoveItem: noop,
    onClose: noop,
  }));

  assert.doesNotMatch(markup, /data-provider-merge-field="editable"/);
  assert.doesNotMatch(markup, /<(input|textarea|select)\b/);
});

test('provider visual without a valid binding has no segment number, replacement mode, or replace button', () => {
  const missingBinding: TemplateEditorItem = {
    ...boundVisual,
    id: 'shotstack-missing-binding',
    start: 5,
    providerBinding: undefined,
  };
  const project = {
    ...shotstackProject,
    duration: 10,
    items: [boundVisual, missingBinding, unboundSoundtrack],
  };
  const timelineMarkup = renderToStaticMarkup(React.createElement(TemplateEditorTimeline, {
    project,
    currentTime: 0,
    selectedItemId: missingBinding.id,
    isPlaying: false,
    onTogglePlay: noop,
    onSelectItem: noop,
    onSeek: noop,
    onRemoveItem: noop,
    onDuplicateItem: noop,
    onReorderItem: noop,
    mediaAssets: [],
    onReplaceItemMedia: noop,
  }));
  const assetPanelMarkup = renderToStaticMarkup(React.createElement(TemplateEditorAssetPanel, {
    activeTab: 'media',
    mediaAssets: [],
    selectedItem: missingBinding,
    selectedReplacementNumber: null,
    projectItems: project.items,
    onUploadFiles: noop,
    onAddMediaAsset: noop,
    onReplaceMediaAsset: noop,
    onAddTextPreset: noop,
    onAddAudioTrack: noop,
  }));

  assert.equal((timelineMarkup.match(/>Thay thế</g) || []).length, 1);
  assert.doesNotMatch(assetPanelMarkup, /Đang thay:/);
  assert.doesNotMatch(assetPanelMarkup, /Đang thay đoạn đã chọn/);
});

test('failed autosave exposes an explicit retry action only in the error state', () => {
  const renderTopbar = (saveStatus: 'saved' | 'error') =>
    renderToStaticMarkup(React.createElement(TemplateEditorTopbar, {
      title: 'Project',
      aspectRatio: '9:16',
      zoomLevel: 100,
      canUndo: false,
      canRedo: false,
      onSetTitle: noop,
      onSetAspectRatio: noop,
      onSetZoomLevel: noop,
      onUndo: noop,
      onRedo: noop,
      onOpenExport: noop,
      onBack: noop,
      saveStatus,
      onRetrySave: noop,
    }));

  assert.match(renderTopbar('error'), /data-autosave-retry="true"/);
  assert.match(renderTopbar('error'), /Thử lưu lại/);
  assert.doesNotMatch(renderTopbar('saved'), /data-autosave-retry="true"/);
});

test('short-video warning displays trim-aware required duration', () => {
  const markup = renderToStaticMarkup(React.createElement(TemplateExportModal, {
    isOpen: true,
    onClose: noop,
    projectTitle: 'Project',
    projectId: 'project-1',
    onEnsureAutosave: async () => undefined,
    validationIssues: [{
      itemId: 'short-video',
      label: 'Đoạn 1',
      segmentDuration: 5,
      requiredDuration: 7.5,
      sourceDuration: 7.499,
    }],
  }));

  assert.match(markup, /7\.5s/);
  assert.doesNotMatch(markup, /đoạn mẫu\s*5s/);
});

test('Shotstack MOV source uses the rendered MP4 preview instead of a black browser frame', () => {
  const movItem: TemplateEditorItem = {
    ...boundVisual,
    sourceUrl: 'https://templates.shotstack.io/example/source.mov',
  };
  const project: TemplateEditorProject = {
    ...shotstackProject,
    previewVideoUrl: 'https://res.cloudinary.com/app/video/upload/template-preview.mp4',
    items: [movItem, unboundSoundtrack],
  };

  assert.equal(shouldUseRenderedTemplatePreview(project.items, project.previewVideoUrl), true);
  assert.equal(
    browserPreviewSourceForItem(movItem, project.previewVideoUrl),
    project.previewVideoUrl
  );

  const markup = renderToStaticMarkup(React.createElement(TemplateEditorCanvas, {
    project,
    currentTime: 0,
    isPlaying: false,
    selectedItem: movItem,
    onSelectItem: noop,
    zoomLevel: 100,
  }));

  assert.match(markup, /template-preview\.mp4/);
  assert.doesNotMatch(markup, /source\.mov/);
});

test('browser-compatible MP4 source remains the direct canvas source', () => {
  assert.equal(
    browserPreviewSourceForItem(boundVisual, 'https://cdn.example.com/template-preview.mp4'),
    boundVisual.sourceUrl
  );
});

test('unresolved Shotstack merge-field source uses the rendered template preview', () => {
  const unresolvedItem: TemplateEditorItem = {
    ...boundVisual,
    sourceUrl: '{{ FOOTAGE_3 }}',
  };

  assert.equal(
    browserPreviewSourceForItem(
      unresolvedItem,
      'https://res.cloudinary.com/app/video/upload/template-preview.mp4'
    ),
    'https://res.cloudinary.com/app/video/upload/template-preview.mp4'
  );
});

test('loaded project source media restores the rendered template preview', () => {
  assert.equal(
    resolveRenderedTemplatePreviewUrl(
      'https://res.cloudinary.com/app/video/upload/template-preview.mp4',
      undefined
    ),
    'https://res.cloudinary.com/app/video/upload/template-preview.mp4'
  );
  assert.equal(
    resolveRenderedTemplatePreviewUrl(
      'https://res.cloudinary.com/app/image/upload/template-cover.jpg',
      undefined
    ),
    undefined
  );
});

test('timeline thumbnails use the rendered MP4 when Shotstack clips are MOV files', () => {
  const project: TemplateEditorProject = {
    ...shotstackProject,
    previewVideoUrl: 'https://res.cloudinary.com/app/video/upload/template-preview.mp4',
    items: [{
      ...boundVisual,
      sourceUrl: 'https://templates.shotstack.io/example/source.mov',
    }, unboundSoundtrack],
  };

  const markup = renderToStaticMarkup(React.createElement(TemplateEditorTimeline, {
    project,
    currentTime: 0,
    selectedItemId: null,
    isPlaying: false,
    onTogglePlay: noop,
    onSelectItem: noop,
    onSeek: noop,
    onRemoveItem: noop,
    onDuplicateItem: noop,
    onReorderItem: noop,
    mediaAssets: [],
    onReplaceItemMedia: noop,
  }));

  assert.match(markup, /template-preview\.mp4/);
  assert.doesNotMatch(markup, /source\.mov/);
});
