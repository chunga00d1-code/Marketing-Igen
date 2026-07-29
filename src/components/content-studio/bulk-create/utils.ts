import type { CSSProperties } from 'react';
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

export function getLayerFrameStyle(
  layer: BulkLayer,
  scale = 1,
): CSSProperties {
  const variant = layer.layerKind || 'text';
  const textAlign = layer.textAlign || 'left';
  return {
    boxSizing: 'border-box',
    backgroundColor: layer.fillColor || undefined,
    border: layer.borderWidth
      ? `${Math.max(0, layer.borderWidth * scale)}px solid ${layer.borderColor || layer.color || '#000000'}`
      : undefined,
    borderRadius: `${Math.max(0, (layer.borderRadius || 0) * scale)}px`,
    opacity: layer.opacity ?? 1,
    padding: layer.padding ? `${Math.max(0, layer.padding * scale)}px` : undefined,
    display: variant === 'shape'
      ? 'block'
      : variant === 'badge' || variant === 'cta' || variant === 'icon'
        ? 'flex'
        : undefined,
    alignItems: variant === 'badge' || variant === 'cta' || variant === 'icon' ? 'center' : undefined,
    justifyContent:
      variant === 'icon' || textAlign === 'center'
        ? 'center'
        : textAlign === 'right'
          ? 'flex-end'
          : variant === 'badge' || variant === 'cta'
            ? 'flex-start'
            : undefined,
  };
}

export type TextFitResult = {
  fontSize: number;
  overflow: boolean;
  lineCount: number;
};

export function fitTextElement(
  element: HTMLElement,
  options: {
    preferredFontSize: number;
    minimumFontSize: number;
    maximumLines?: number;
  }
): TextFitResult {
  const preferredFontSize = clamp(options.preferredFontSize, 1, 1200);
  const minimumFontSize = clamp(options.minimumFontSize, 1, preferredFontSize);
  const maximumLines = options.maximumLines
    ? clamp(Math.round(options.maximumLines), 1, 20)
    : undefined;

  const measure = (fontSize: number) => {
    element.style.fontSize = `${fontSize}px`;
    const computed = window.getComputedStyle(element);
    const lineHeightValue = Number.parseFloat(computed.lineHeight);
    const lineHeight = Number.isFinite(lineHeightValue)
      ? lineHeightValue
      : fontSize * 1.22;
    const lineCount = Math.max(1, Math.ceil((element.scrollHeight - 0.5) / lineHeight));
    const fitsBounds = element.scrollWidth <= element.clientWidth + 0.5
      && element.scrollHeight <= element.clientHeight + 0.5;
    const fitsLines = maximumLines === undefined || lineCount <= maximumLines;
    return { fits: fitsBounds && fitsLines, lineCount };
  };

  let low = minimumFontSize;
  let high = preferredFontSize;
  let best = minimumFontSize;
  let bestLineCount = 1;
  for (let iteration = 0; iteration < 12; iteration += 1) {
    const middle = Math.round(((low + high) / 2) * 4) / 4;
    const measurement = measure(middle);
    if (measurement.fits) {
      best = middle;
      bestLineCount = measurement.lineCount;
      low = middle + 0.25;
    } else {
      high = middle - 0.25;
    }
    if (low > high) break;
  }

  const finalMeasurement = measure(best);
  const minimumMeasurement = finalMeasurement.fits
    ? finalMeasurement
    : measure(minimumFontSize);
  const overflow = !minimumMeasurement.fits;
  const fontSize = overflow ? minimumFontSize : best;
  element.style.fontSize = `${fontSize}px`;
  element.dataset.textOverflow = String(overflow);
  element.dataset.fittedFontSize = String(fontSize);
  element.dataset.fittedLineCount = String(
    overflow ? minimumMeasurement.lineCount : bestLineCount || finalMeasurement.lineCount
  );
  return {
    fontSize,
    overflow,
    lineCount: Number(element.dataset.fittedLineCount),
  };
}
