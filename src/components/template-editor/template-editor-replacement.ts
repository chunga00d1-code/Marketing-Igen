import type { MediaAsset, TemplateEditorItem, TemplateEditorProject } from './types';
import {
  hasValidShotstackBinding,
  isShotstackProviderTemplate,
} from './template-editor-clips';

export type EditorItemReplacementResult =
  | { ok: true; item: TemplateEditorItem }
  | { ok: false; reason: string };

export interface EditorItemMediaReplacementState {
  project: TemplateEditorProject;
  history: TemplateEditorProject[];
  historyIndex: number;
  mediaAssets: MediaAsset[];
  selectedItemId: string | null;
}

export type EditorItemMediaReplacementTransition =
  | { ok: true; state: EditorItemMediaReplacementState; successMessage: string }
  | { ok: false; state: EditorItemMediaReplacementState; reason: string };

export interface ShortVideoReplacementIssue {
  itemId: string;
  label: string;
  segmentDuration: number;
  requiredDuration: number;
  sourceDuration: number;
}

const isVisualType = (type: TemplateEditorItem['type']): type is 'video' | 'image' =>
  type === 'video' || type === 'image';

const isPositiveFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

const isNonNegativeFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;

export function replaceEditorItemMedia(
  item: TemplateEditorItem,
  asset: MediaAsset,
  projectItems: TemplateEditorItem[] = [item]
): EditorItemReplacementResult {
  if (item.replaceable !== true) {
    return { ok: false, reason: 'Clip is locked and cannot be replaced.' };
  }

  if (!isVisualType(item.type)) {
    return { ok: false, reason: 'Only visual clips can be replaced.' };
  }

  if (
    isShotstackProviderTemplate(projectItems)
    && !hasValidShotstackBinding(item)
  ) {
    return {
      ok: false,
      reason: 'Không thể xác định đoạn nguồn của mẫu.',
    };
  }

  if (!isVisualType(asset.type)) {
    return { ok: false, reason: 'Only image or video media can replace a clip.' };
  }

  if (
    asset.uploadStatus !== undefined &&
    asset.uploadStatus !== 'ready' &&
    !asset.url?.startsWith('blob:')
  ) {
    return { ok: false, reason: 'Media upload is not ready.' };
  }

  return {
    ok: true,
    item: {
      ...item,
      type: asset.type,
      sourceUrl: asset.url,
      thumbnailUrl: asset.thumbnailUrl,
      label: asset.name,
      replacement: {
        originalType: item.replacement?.originalType ?? item.type,
        sourceType: asset.type,
        ...(asset.type === 'video' && isPositiveFiniteNumber(asset.duration)
          ? { sourceDuration: asset.duration }
          : {}),
      },
    },
  };
}

export function findShortVideoReplacementIssues(
  items: TemplateEditorItem[]
): ShortVideoReplacementIssue[] {
  return items.flatMap((item) => {
    const sourceDuration = item.replacement?.sourceDuration;
    const trim = isNonNegativeFiniteNumber(item.trim) ? item.trim : 0;
    const requiredDuration = item.duration + trim;
    if (
      item.type !== 'video'
      || item.replacement?.sourceType !== 'video'
      || !isPositiveFiniteNumber(sourceDuration)
      || !isPositiveFiniteNumber(item.duration)
      || sourceDuration >= requiredDuration
    ) {
      return [];
    }

    return [{
      itemId: item.id,
      label: item.label || item.id,
      segmentDuration: item.duration,
      requiredDuration,
      sourceDuration,
    }];
  });
}

export function createEditorItemMediaReplacementTransition(
  state: EditorItemMediaReplacementState & { itemId: string; asset: MediaAsset }
): EditorItemMediaReplacementTransition {
  const target = state.project.items.find((item) => item.id === state.itemId);
  if (!target) {
    return { ok: false, state, reason: 'Không tìm thấy clip cần thay thế.' };
  }

  const result = replaceEditorItemMedia(target, state.asset, state.project.items);
  if (result.ok === false) {
    return { ok: false, state, reason: result.reason };
  }

  const project = {
    ...state.project,
    items: state.project.items.map((item) => item.id === state.itemId ? result.item : item),
  };
  const history = [
    ...state.history.slice(0, state.historyIndex + 1),
    JSON.parse(JSON.stringify(project)) as TemplateEditorProject,
  ];

  return {
    ok: true,
    state: {
      ...state,
      project,
      history,
      historyIndex: history.length - 1,
      mediaAssets: state.mediaAssets.map((asset) =>
        asset.id === state.asset.id ? { ...asset, added: true } : asset
      ),
    },
    successMessage: `Đã thay thế bằng media "${state.asset.name}".`,
  };
}
