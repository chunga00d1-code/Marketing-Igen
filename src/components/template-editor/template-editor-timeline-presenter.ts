import {
  buildVisualClipSegments,
  isShotstackProviderTemplate,
  transitionLabel,
  type VisualClipSegment,
} from './template-editor-clips';
import type { TemplateEditorItem } from './types';

export { isShotstackProviderTemplate } from './template-editor-clips';

export interface TimelineVisualSegment extends VisualClipSegment {
  label: string;
  transitionLabel: string | null;
  lane: number;
}

export interface TimelineAudioSegment {
  item: TemplateEditorItem;
  label: string;
  locked: boolean;
}

export interface TemplateTimelinePresenter {
  visualSegments: TimelineVisualSegment[];
  visualLaneCount: number;
  audioSegments: TimelineAudioSegment[];
  canAddAudio: boolean;
}

export function buildTemplateTimelinePresenter(
  items: TemplateEditorItem[]
): TemplateTimelinePresenter {
  const isProviderTemplate = isShotstackProviderTemplate(items);
  const labeledVisualSegments = buildVisualClipSegments(items)
    .filter((segment) => segment.replacementNumber !== null)
    .map((segment) => {
      const rawTransition = segment.item.providerBinding?.rawTransition;

      return {
        ...segment,
        label: `Đoạn ${segment.replacementNumber}`,
        transitionLabel: rawTransition
          ? transitionLabel(rawTransition) ?? 'Chuyển cảnh'
          : null,
      };
    });
  const laneEnds: number[] = [];
  const visualSegments = labeledVisualSegments.map((segment) => {
    const lane = laneEnds.findIndex((laneEnd) => laneEnd <= segment.item.start);
    const assignedLane = lane === -1 ? laneEnds.length : lane;
    laneEnds[assignedLane] = segment.item.start + segment.item.duration;
    return { ...segment, lane: assignedLane };
  });

  const audioSegments = items
    .filter((item) => item.type === 'audio')
    .sort((left, right) => left.start - right.start)
    .map((item) => ({
      item,
      label: item.label || 'Nhạc trong mẫu',
      locked: isProviderTemplate,
    }));

  return {
    visualSegments,
    visualLaneCount: Math.max(1, laneEnds.length),
    audioSegments,
    canAddAudio: !isProviderTemplate,
  };
}

export function activateTimelineSegment(
  item: TemplateEditorItem,
  onSelectItem: (itemId: string | null) => void,
  onSeek: (time: number) => void
): void {
  onSelectItem(item.id);
  onSeek(item.start);
}

export function shouldShowDestructiveItemControls(
  item: TemplateEditorItem | null,
  projectItems: TemplateEditorItem[]
): boolean {
  if (!item || item.providerBinding) return false;
  if (item.type === 'audio' && isShotstackProviderTemplate(projectItems)) return false;

  return true;
}
