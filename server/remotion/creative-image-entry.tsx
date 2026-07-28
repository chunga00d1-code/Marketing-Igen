import React from "react";
import { Composition, registerRoot } from "remotion";
import { CreativeImageTemplate } from "../../src/creative-image/CreativeImageTemplate";
import { CREATIVE_IMAGE_CANVASES } from "../../src/creative-image/types";

type CreativeInput = {
  templateId: string;
  canvas: { format: keyof typeof CREATIVE_IMAGE_CANVASES; width: number; height: number };
  data: Record<string, string>;
};

export const CreativeRoot: React.FC = () => (
  <Composition
    id="creative-image"
    component={CreativeImageTemplate as React.FC<CreativeInput>}
    durationInFrames={1}
    fps={30}
    width={1080}
    height={1080}
    defaultProps={{ templateId: "product-promo-v1", canvas: CREATIVE_IMAGE_CANVASES["1:1"], data: {} }}
    calculateMetadata={({ props }) => ({
      durationInFrames: 1,
      width: props.canvas.width,
      height: props.canvas.height,
    })}
  />
);

registerRoot(CreativeRoot);
