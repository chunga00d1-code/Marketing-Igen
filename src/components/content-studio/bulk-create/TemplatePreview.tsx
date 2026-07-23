import React from 'react';
import { Image as ImageIcon } from 'lucide-react';
import type { BulkTemplate } from '../../../services/bulkCreateService';

interface TemplatePreviewProps {
  template: BulkTemplate;
}

export function TemplatePreview({ template }: TemplatePreviewProps) {
  const backgroundStyle =
    template.background.type === 'image'
      ? {
          backgroundImage: `url(${template.background.imageUrl})`,
          backgroundPosition: 'center',
          backgroundSize: 'cover',
        }
      : template.background.type === 'gradient'
        ? {
            backgroundImage: `linear-gradient(135deg, ${(
              template.background.colors || ['#ffffff', '#e2e8f0']
            ).join(', ')})`,
          }
        : { backgroundColor: template.background.color || '#ffffff' };

  return (
    <div className="relative aspect-square overflow-hidden bg-slate-100" style={backgroundStyle}>
      {template.layers
        .slice()
        .sort((a, b) => a.zIndex - b.zIndex)
        .map((layer) => (
          <div
            key={layer.id}
            className="absolute overflow-hidden"
            style={{
              left: `${layer.x}%`,
              top: `${layer.y}%`,
              width: `${layer.width}%`,
              height: `${layer.height}%`,
              transform: `rotate(${layer.rotation}deg)`,
              color: layer.color,
              fontFamily: layer.fontFamily,
              fontSize: `${Math.max(5, (layer.fontSize || 60) / 8)}px`,
              fontWeight: layer.fontWeight,
              fontStyle: layer.fontStyle || 'normal',
              textDecoration: layer.textDecoration || 'none',
              textTransform: layer.textTransform || 'none',
              letterSpacing: `${(layer.letterSpacing || 0) / 8}px`,
              lineHeight: layer.lineHeight || 1.22,
              textAlign: layer.textAlign,
            }}
          >
            {layer.type === 'text' ? (
              layer.fieldName
            ) : (
              <span className="flex h-full items-center justify-center border border-dashed border-white/80 bg-black/10">
                <ImageIcon className="h-4 w-4 text-white" />
              </span>
            )}
          </div>
        ))}
    </div>
  );
}
