export type ShotstackEnvironment = "stage" | "v1";

export type ShotstackProviderFields = Record<string, unknown>;

export interface ShotstackTemplateSummary extends ShotstackProviderFields {
  id: string;
  name?: string;
}

export interface ShotstackTemplate extends ShotstackProviderFields {
  id: string;
}

export interface ShotstackRenderRequest extends ShotstackProviderFields {
  templateId: string;
  merge?: Array<Record<string, unknown>>;
}

export interface ShotstackRenderStatus extends ShotstackProviderFields {
  id: string;
  status: string;
}

export interface ShotstackAsset extends ShotstackProviderFields {
  type: string;
  src?: string;
  html?: string;
  text?: string;
  trim?: number;
  volume?: number;
  color?: string;
  size?: string;
  position?: string;
  offset?: {
    x?: number;
    y?: number;
  };
}

export interface ShotstackClip extends ShotstackProviderFields {
  asset: ShotstackAsset;
  start: number;
  length: number | string;
  fit?: string;
  scale?: number;
  opacity?: number;
  position?: string;
  offset?: {
    x?: number;
    y?: number;
  };
  transform?: {
    rotate?: {
      angle?: number | Array<Record<string, unknown>>;
    };
    [key: string]: unknown;
  };
  transition?: Record<string, unknown>;
}

export interface ShotstackTrack extends ShotstackProviderFields {
  clips: ShotstackClip[];
}

export interface ShotstackSoundtrack extends ShotstackProviderFields {
  src: string;
  volume?: number;
}

export interface ShotstackTimeline extends ShotstackProviderFields {
  tracks: ShotstackTrack[];
  soundtrack?: ShotstackSoundtrack;
}

export interface ShotstackOutput extends ShotstackProviderFields {
  format: string;
  aspectRatio?: string;
  size?: {
    width: number;
    height: number;
  };
}

export interface ShotstackEdit extends ShotstackProviderFields {
  timeline: ShotstackTimeline;
  output: ShotstackOutput;
}
