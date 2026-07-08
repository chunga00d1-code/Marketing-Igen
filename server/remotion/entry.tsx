import { registerRoot, Composition } from 'remotion';
import { VideoComposition } from '../../src/components/content-studio/video-composition';
import React from 'react';

export const Root: React.FC = () => {
  return (
    <Composition
      id="video-edit"
      component={VideoComposition}
      durationInFrames={300} // Default
      fps={30}
      width={1280}
      height={720}
      defaultProps={{
        blueprint: {
          timeline: []
        }
      }}
      calculateMetadata={async ({ props }) => {
        const blueprint = (props as any)?.blueprint || {};
        const timeline = blueprint.timeline || [];
        const videoClips = timeline.filter((item: any) => item.type === "video");
        let durationSeconds = 0;
        if (videoClips.length > 0) {
          durationSeconds = videoClips.reduce((sum: number, item: any) => {
            const clipDuration = (item.end ?? 5) - (item.start ?? 0);
            const rate = item.playbackRate ?? 1;
            return sum + (clipDuration / rate);
          }, 0);
        } else {
          durationSeconds = 10;
        }
        const durationInFrames = Math.max(30, Math.round(durationSeconds * 30));

        // Determine aspect ratio resolution
        const aspect = blueprint.aspectRatio || "16:9";
        let width = 1280;
        let height = 720;
        if (aspect === "9:16") {
          width = 720;
          height = 1280;
        } else if (aspect === "1:1") {
          width = 720;
          height = 720;
        }

        return {
          durationInFrames,
          width,
          height,
        };
      }}
    />
  );
};

registerRoot(Root);
