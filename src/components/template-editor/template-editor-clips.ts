import type { TemplateEditorItem } from './types';

export interface VisualClipSegment {
  item: TemplateEditorItem;
  replacementNumber: number | null;
  locked: boolean;
}

const visualItemTypes = new Set<TemplateEditorItem['type']>(['video', 'image']);

export function hasValidShotstackBinding(item: TemplateEditorItem): boolean {
  const binding = item.providerBinding;
  return binding?.provider === 'shotstack'
    && Number.isInteger(binding.trackIndex)
    && binding.trackIndex >= 0
    && Number.isInteger(binding.clipIndex)
    && binding.clipIndex >= 0;
}

export function isShotstackProviderItem(item: TemplateEditorItem): boolean {
  return item.providerBinding?.provider === 'shotstack'
    || /^shotstack-\d+-\d+$/.test(item.id);
}

export function isShotstackProviderTemplate(items: TemplateEditorItem[]): boolean {
  return items.some(isShotstackProviderItem);
}

const providerIndex = (
  item: TemplateEditorItem,
  key: 'trackIndex' | 'clipIndex'
): number => item.providerBinding?.[key] ?? Number.MAX_SAFE_INTEGER;

export function buildVisualClipSegments(items: TemplateEditorItem[]): VisualClipSegment[] {
  const isProviderTemplate = isShotstackProviderTemplate(items);
  const visualItems = items
    .filter((item) => visualItemTypes.has(item.type))
    .sort(
      (left, right) =>
        left.start - right.start ||
        providerIndex(left, 'trackIndex') - providerIndex(right, 'trackIndex') ||
        providerIndex(left, 'clipIndex') - providerIndex(right, 'clipIndex')
    );

  let replacementNumber = 0;

  return visualItems.map((item) => {
    const replaceable = item.replaceable === true
      && (!isProviderTemplate || hasValidShotstackBinding(item));

    if (replaceable) replacementNumber += 1;

    return {
      item,
      replacementNumber: replaceable ? replacementNumber : null,
      locked: !replaceable,
    };
  });
}

export function transitionLabel(rawTransition?: Record<string, unknown>): string | null {
  if (!rawTransition) return null;

  const transitionIn = rawTransition.in;
  const transitionOut = rawTransition.out;
  const labels: string[] = [];

  if (typeof transitionIn === 'string' && transitionIn) labels.push(`Vào: ${transitionIn}`);
  if (typeof transitionOut === 'string' && transitionOut) labels.push(`Ra: ${transitionOut}`);

  return labels.length > 0 ? labels.join(' · ') : null;
}
