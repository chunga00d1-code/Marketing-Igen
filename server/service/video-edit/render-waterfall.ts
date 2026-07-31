import type {
  VideoRenderAdapter,
  VideoRenderExecutionContext,
  VideoRenderInput,
} from "./render-adapter";

export type RenderWaterfallEngine = "hyperframes" | "remotion" | "ffmpeg";

export interface RenderWaterfallOptions {
  selectedEngine: string;
  hyperframesAdapter: VideoRenderAdapter;
  hyperframesInput: VideoRenderInput;
  hyperframesContext: VideoRenderExecutionContext;
  renderWithRemotion: () => Promise<string>;
  renderWithFfmpeg: () => Promise<string>;
  onFailure: (
    engine: Exclude<RenderWaterfallEngine, "ffmpeg">,
    error: unknown
  ) => void | Promise<void>;
}

export async function runRenderWaterfall(
  options: RenderWaterfallOptions
): Promise<{ engine: RenderWaterfallEngine; outputUrl: string }> {
  if (options.selectedEngine !== "remotion") {
    try {
      const result = await options.hyperframesAdapter.render(
        options.hyperframesInput,
        options.hyperframesContext
      );
      return {
        engine: "hyperframes",
        outputUrl: result.outputUrl,
      };
    } catch (error) {
      await options.onFailure("hyperframes", error);
    }
  }

  try {
    return {
      engine: "remotion",
      outputUrl: await options.renderWithRemotion(),
    };
  } catch (error) {
    await options.onFailure("remotion", error);
  }

  return {
    engine: "ffmpeg",
    outputUrl: await options.renderWithFfmpeg(),
  };
}
