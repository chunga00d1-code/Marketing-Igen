import type { BulkLayer } from '../../../services/bulkCreateService';

export function readImage(file: File, callback: (value: string) => void) {
  const reader = new FileReader();
  reader.onload = () => {
    if (typeof reader.result === 'string') callback(reader.result);
  };
  reader.readAsDataURL(file);
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function resolveTextFontSize(
  layer: BulkLayer,
  value: string,
  canvas?: { width: number; height: number }
) {
  const baseSize = layer.fontSize || 60;
  if (!canvas || !value.trim()) return baseSize;

  const boxWidth = Math.max(1, canvas.width * layer.width / 100);
  const boxHeight = Math.max(1, canvas.height * layer.height / 100);
  const lineHeight = layer.lineHeight || 1.22;
  const charactersPerLine = Math.max(6, Math.floor(boxWidth / (baseSize * 0.58)));
  const lineCount = value.split(/\r?\n/u).reduce(
    (total, line) => total + Math.max(1, Math.ceil(Array.from(line).length / charactersPerLine)),
    0
  );
  const heightFit = boxHeight / Math.max(1, lineCount * lineHeight * 1.12);
  return Math.max(8, Math.min(baseSize, heightFit));
}
