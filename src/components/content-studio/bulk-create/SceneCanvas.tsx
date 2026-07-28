import React from 'react';
import type { BulkLayer, BulkTemplatePayload } from '../../../services/bulkCreateService';

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

export function SceneLayerContent({
  layer,
  value,
  scale = 1,
  showPlaceholder = false,
}: {
  layer: BulkLayer;
  value: string;
  scale?: number;
  showPlaceholder?: boolean;
}) {
  if (layer.type === 'image') {
    if (value) {
      return (
        <img
          src={value}
          alt=""
          draggable={false}
          style={{
            display: 'block',
            width: '100%',
            height: '100%',
            objectFit: layer.fit || 'contain',
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

  return (
    <span
      style={{
        display: 'block',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        whiteSpace: 'pre-wrap',
        overflowWrap: 'break-word',
        color: layer.color || '#000000',
        fontFamily: layer.fontFamily || 'DejaVu Sans',
        fontSize: `${(layer.fontSize || 60) * scale}px`,
        fontWeight: layer.fontWeight || 700,
        fontStyle: layer.fontStyle || 'normal',
        textDecoration: layer.textDecoration || 'none',
        letterSpacing: `${(layer.letterSpacing || 0) * scale}px`,
        lineHeight: layer.lineHeight || 1.22,
        textAlign: layer.textAlign || 'left',
        textShadow: '0 2px 7px rgba(15,23,42,0.5)',
      }}
    >
      {resolveTextTransform(value || layer.defaultValue || layer.fieldName, layer.textTransform)}
    </span>
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
              overflow: 'hidden',
              transform: `rotate(${layer.rotation || 0}deg)`,
              transformOrigin: 'center center',
              zIndex: layer.zIndex,
            }}
          >
            <SceneLayerContent
              layer={layer}
              value={String(values[layer.id] ?? values[layer.fieldName] ?? '')}
              scale={scale}
              showPlaceholder={showPlaceholders}
            />
          </div>
        ))}
    </div>
  );
}
