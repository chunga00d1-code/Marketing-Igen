/* eslint-disable @typescript-eslint/no-explicit-any */
import { registerRoot, Composition } from 'remotion';
import { VideoComposition } from '../../src/components/content-studio/video-composition';
import React from 'react';
import { getRenderDimensions } from "../service/video-project-render-policy";

const defaultCompositionDimensions = getRenderDimensions("16:9", "720p");

export function getVideoCompositionMetadata(blueprint: Record<string, unknown>) {
  const duration = Number(blueprint.duration);
  const durationInFrames = Number.isFinite(duration) && duration > 0
    ? Math.round(duration * 30)
    : 300;
  const aspectRatio = typeof blueprint.aspectRatio === "string" ? blueprint.aspectRatio : "16:9";
  const resolution = typeof blueprint.resolution === "string" ? blueprint.resolution : "720p";
  const { width, height } = getRenderDimensions(aspectRatio, resolution);

  return { durationInFrames, width, height };
}

export const Root: React.FC = () => {
  return (
    <Composition
      id="video-edit"
      component={VideoComposition as any}
      durationInFrames={300} // Default
      fps={30}
      width={defaultCompositionDimensions.width}
      height={defaultCompositionDimensions.height}
      defaultProps={{
        blueprint: {
          duration: 10,
          aspectRatio: "16:9",
          resolution: "720p",
          timeline: []
        }
      }}
      calculateMetadata={async ({ props }) => {
        const blueprint = (props as { blueprint?: Record<string, unknown> })?.blueprint || {};
        return getVideoCompositionMetadata(blueprint);
      }}
    />
  );
};

registerRoot(Root);
