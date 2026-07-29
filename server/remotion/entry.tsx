/* eslint-disable @typescript-eslint/no-explicit-any */
import { registerRoot, Composition } from 'remotion';
import { VideoComposition } from '../../src/components/content-studio/video-composition';
import React from 'react';
import { getRenderDimensions } from "../service/video-project-render-policy";
import { getVideoCompositionMetadata } from "./video-composition-metadata";

const defaultCompositionDimensions = getRenderDimensions("16:9", "720p");

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
