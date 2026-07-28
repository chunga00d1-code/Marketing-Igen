export type CreativeImageFormat = "1:1" | "4:5" | "9:16" | "1.91:1";

export type CreativeImageCanvas = {
  format: CreativeImageFormat;
  width: number;
  height: number;
};

export type CreativeFieldType = "text" | "textarea" | "color" | "image";

export type CreativeTemplateField = {
  key: string;
  label: string;
  type: CreativeFieldType;
  maxLength?: number;
  placeholder?: string;
};

export type CreativeImageTemplate = {
  id: string;
  version: number;
  name: string;
  description: string;
  accent: string;
  fields: CreativeTemplateField[];
  defaults: Record<string, string>;
};

export type CreativeImageProjectData = Record<string, string>;

export const CREATIVE_IMAGE_CANVASES: Record<CreativeImageFormat, CreativeImageCanvas> = {
  "1:1": { format: "1:1", width: 1080, height: 1080 },
  "4:5": { format: "4:5", width: 1080, height: 1350 },
  "9:16": { format: "9:16", width: 1080, height: 1920 },
  "1.91:1": { format: "1.91:1", width: 1200, height: 630 },
};
