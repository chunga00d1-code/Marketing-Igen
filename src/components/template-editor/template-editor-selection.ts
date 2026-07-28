import type { TemplateEditorItem } from './types';

function isVisualItem(item: TemplateEditorItem): boolean {
  return (item.type === 'video' || item.type === 'image') && Boolean(item.sourceUrl);
}

export function findActiveVisualItem(
  items: TemplateEditorItem[],
  currentTime: number
): TemplateEditorItem | undefined {
  return findActiveVisualItems(items, currentTime).at(-1);
}

export function findActiveVisualItems(
  items: TemplateEditorItem[],
  currentTime: number
): TemplateEditorItem[] {
  return items.filter(
    (item) =>
      isVisualItem(item) &&
      currentTime >= item.start &&
      currentTime < item.start + item.duration
  ).sort((left, right) => {
    const leftTrack = left.providerBinding?.trackIndex;
    const rightTrack = right.providerBinding?.trackIndex;
    if (leftTrack !== undefined && rightTrack !== undefined && leftTrack !== rightTrack) {
      return rightTrack - leftTrack;
    }
    return left.order - right.order;
  });
}

export function selectInitialEditorItemId(items: TemplateEditorItem[]): string | null {
  return findActiveVisualItem(items, 0)?.id
    || items.find(isVisualItem)?.id
    || items[0]?.id
    || null;
}
