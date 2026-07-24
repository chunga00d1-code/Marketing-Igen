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
