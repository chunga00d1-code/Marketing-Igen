import React, { useEffect, useRef, useState } from 'react';
import type { BulkLayer, BulkTemplatePayload } from '../../../services/bulkCreateService';
import { fitTextElement, getLayerFrameStyle, resolveTextFontSize } from './utils';

export const BULK_SCENE_VERSION = 2;

export type BulkSceneDocument = Pick<
  BulkTemplatePayload,
  'canvas' | 'background' | 'layers'
> & {
  sceneVersion?: number;
};

function resolveTextTransform(value: string, transform: BulkLayer['textTransform']) {
  if (transform === 'uppercase') return value.toLocaleUpperCase('vi-VN');
  if (transform === 'lowercase') return value.toLocaleLowerCase('vi-VN');
  if (transform === 'capitalize') {
    return value.replace(/(^|\s)(\S)/gu, (match) => match.toLocaleUpperCase('vi-VN'));
  }
  return value;
}

function AutoFitText({
  layer,
  value,
  scale,
  canvas,
  showOverflowWarning,
}: {
  layer: BulkLayer;
  value: string;
  scale: number;
  canvas?: { width: number; height: number };
  showOverflowWarning: boolean;
}) {
  const textRef = useRef<HTMLSpanElement>(null);
  const [overflow, setOverflow] = useState(false);
  const preferredFontSize = (layer.fontSize || 60) * scale;
  const minimumFontSize = Math.min(
    preferredFontSize,
    (layer.minFontSize || 12) * scale
  );

  useEffect(() => {
    const element = textRef.current;
    if (!element) return;
    let disposed = false;
    const fit = () => {
      if (disposed || !element.clientWidth || !element.clientHeight) return;
      if (layer.autoFit === false) {
        element.style.fontSize = `${preferredFontSize}px`;
        element.dataset.textOverflow = 'false';
        setOverflow(false);
        return;
      }
      const result = fitTextElement(element, {
        preferredFontSize,
        minimumFontSize,
        maximumLines: layer.maxLines,
      });
      setOverflow(result.overflow);
    };
    const resizeObserver = new ResizeObserver(fit);
    resizeObserver.observe(element);
    void document.fonts?.ready.then(fit);
    fit();
    return () => {
      disposed = true;
      resizeObserver.disconnect();
    };
  }, [
    layer.autoFit,
    layer.fontFamily,
    layer.fontStyle,
    layer.fontWeight,
    layer.letterSpacing,
    layer.lineHeight,
    layer.maxLines,
    minimumFontSize,
    preferredFontSize,
    value,
  ]);

  return (
    <>
      <span
        ref={textRef}
        data-autofit-text={layer.autoFit === false ? 'false' : 'true'}
        data-preferred-font-size={preferredFontSize}
        data-min-font-size={minimumFontSize}
        data-max-lines={layer.maxLines || ''}
        style={{
          display: layer.layerKind === 'badge' || layer.layerKind === 'cta' || layer.layerKind === 'icon'
            ? 'flex'
            : 'block',
          alignItems: 'center',
          width: '100%',
          height: '100%',
          overflow: (layer.borderRadius || 0) > 0 ? 'hidden' : 'visible',
          whiteSpace: 'pre-wrap',
          overflowWrap: 'break-word',
          color: layer.color || '#000000',
          fontFamily: layer.fontFamily || 'DejaVu Sans',
          fontSize: `${resolveTextFontSize(layer, value, canvas) * scale}px`,
          fontWeight: layer.fontWeight || 700,
          fontStyle: layer.fontStyle || 'normal',
          textDecoration: layer.textDecoration || 'none',
          letterSpacing: `${(layer.letterSpacing || 0) * scale}px`,
          lineHeight: layer.lineHeight || 1.22,
          textAlign: layer.textAlign || 'left',
          WebkitTextStroke: (layer.textStrokeWidth || 0) > 0
            ? `${(layer.textStrokeWidth || 0) * scale}px ${layer.textStrokeColor || layer.color || '#000000'}`
            : undefined,
          paintOrder: 'stroke fill',
          textShadow: (layer.textShadowBlur || 0) > 0
            ? `0 0 ${(layer.textShadowBlur || 0) * scale}px ${layer.textShadowColor || layer.color || '#000000'}`
            : '0 2px 7px rgba(15,23,42,0.5)',
        }}
      >
        {value}
      </span>
      {showOverflowWarning && overflow && (
        <span
          title="Nội dung vẫn vượt khung ở cỡ chữ nhỏ nhất. Hãy mở rộng khung hoặc rút gọn nội dung."
          style={{
            position: 'absolute',
            right: 0,
            bottom: 0,
            zIndex: 1003,
            borderRadius: 999,
            background: '#e11d48',
            padding: '2px 6px',
            color: '#ffffff',
            fontSize: 9,
            fontWeight: 800,
            lineHeight: 1.2,
            boxShadow: '0 2px 6px rgba(15,23,42,0.2)',
          }}
        >
          Chữ quá dài
        </span>
      )}
    </>
  );
}

export function SceneLayerContent({
  layer,
  value,
  scale = 1,
  showPlaceholder = false,
  canvas,
}: {
  layer: BulkLayer;
  value: string;
  scale?: number;
  showPlaceholder?: boolean;
  canvas?: { width: number; height: number };
}) {
  const isImageLayer = layer.type === 'image' || (layer.layerKind === 'shape' && Boolean(value));
  if (isImageLayer) {
    if (value) {
      const crop = layer.sourceCrop;
      const cropStyle: React.CSSProperties | undefined = crop
        ? {
            position: 'absolute',
            left: `${-(crop.x / crop.width) * 100}%`,
            top: `${-(crop.y / crop.height) * 100}%`,
            width: `${10000 / crop.width}%`,
            height: `${10000 / crop.height}%`,
            maxWidth: 'none',
            objectFit: 'fill',
          }
        : undefined;
      return (
        <img
          src={value}
          alt=""
          draggable={false}
          style={{
            display: 'block',
            width: '100%',
            height: '100%',
            objectFit: layer.fit || (layer.layerKind === 'shape' ? 'cover' : 'contain'),
            ...cropStyle,
          }}
        />
      );
    }
    if (!showPlaceholder) return null;
    return (
      <span
        style={{
          display: 'flex',
          width: '100%',
          height: '100%',
          alignItems: 'center',
          justifyContent: 'center',
          border: '2px dashed rgba(255,255,255,0.8)',
          background: 'rgba(15,23,42,0.2)',
          color: '#ffffff',
          fontSize: 14,
          fontWeight: 700,
          textAlign: 'center',
        }}
      >
        {layer.fieldName}
      </span>
    );
  }

  if (layer.layerKind === 'shape') return null;

  const text = resolveTextTransform(
    value || layer.defaultValue || layer.fieldName,
    layer.textTransform
  );
  return (
    <AutoFitText
      layer={layer}
      value={text}
      scale={scale}
      canvas={canvas}
      showOverflowWarning={showPlaceholder}
    />
  );
}

export function SceneCanvas({
  scene,
  values,
  scale = 1,
  showPlaceholders = false,
}: {
  scene: BulkSceneDocument;
  values: Record<string, string>;
  scale?: number;
  showPlaceholders?: boolean;
}) {
  const backgroundStyle: React.CSSProperties =
    scene.background.type === 'image' && scene.background.imageUrl
      ? {
          backgroundImage: `url("${scene.background.imageUrl.replace(/"/g, '%22')}")`,
          backgroundPosition: 'center',
          backgroundSize: 'cover',
        }
      : scene.background.type === 'gradient'
        ? {
            backgroundImage: `linear-gradient(135deg, ${(
              scene.background.colors || ['#ffffff', '#ffffff']
            ).join(', ')})`,
          }
        : { backgroundColor: scene.background.color || '#ffffff' };

  return (
    <div
      data-bulk-scene-version={scene.sceneVersion || 1}
      data-scene-canvas="ready"
      style={{
        position: 'relative',
        width: scene.canvas.width * scale,
        height: scene.canvas.height * scale,
        overflow: 'hidden',
        ...backgroundStyle,
      }}
    >
      {scene.layers
        .slice()
        .sort((a, b) => a.zIndex - b.zIndex)
        .map((layer) => (
          <div
            key={layer.id}
            data-scene-layer={layer.id}
            style={{
              position: 'absolute',
              left: `${layer.x}%`,
              top: `${layer.y}%`,
              width: `${layer.width}%`,
              height: `${layer.height}%`,
              overflow: (layer.borderRadius || 0) > 0 ? 'hidden' : 'visible',
              transform: `rotate(${layer.rotation || 0}deg)`,
              transformOrigin: 'center center',
              zIndex: layer.zIndex,
              ...getLayerFrameStyle(layer, scale),
            }}
          >
            <SceneLayerContent
              layer={layer}
              value={String(values[layer.id] ?? values[layer.fieldName] ?? '')}
              scale={scale}
              showPlaceholder={showPlaceholders}
              canvas={scene.canvas}
            />
          </div>
        ))}
    </div>
  );
}
