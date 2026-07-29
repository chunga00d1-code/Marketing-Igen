import { Document, Types } from "mongoose";

export type BulkLayerType = "text" | "image";
export type BulkLayerKind = "text" | "shape" | "badge" | "cta" | "icon";
export type BulkImageFit = "cover" | "contain";
export const BULK_FONT_FAMILIES = [
  "DejaVu Sans",
  "Noto Sans",
  "Noto Serif",
  "Inter",
  "Montserrat",
  "Poppins",
  "Raleway",
  "Roboto",
  "Oswald",
  "Bebas Neue",
  "Fredoka",
  "Righteous",
  "Space Grotesk",
  "Be Vietnam Pro",
  "Nunito",
  "Quicksand",
  "Anton",
  "Sora",
  "Manrope",
  "Arial",
  "Playfair Display",
  "Lora",
  "Merriweather",
  "Abril Fatface",
  "Georgia",
  "Times New Roman",
  "Lobster",
  "Pacifico",
  "Dancing Script",
  "Caveat",
  "Permanent Marker",
  "JetBrains Mono",
] as const;

export interface IBulkCanvas {
  width: number;
  height: number;
}

export interface IBulkBackground {
  type: "color" | "gradient" | "image";
  color?: string;
  colors?: string[];
  imageUrl?: string;
}

export interface IBulkLayer {
  id: string;
  type: BulkLayerType;
  layerKind?: BulkLayerKind;
  groupId?: string;
  fieldName: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  zIndex: number;
  locked?: boolean;
  fit?: BulkImageFit;
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: number;
  fontStyle?: "normal" | "italic";
  color?: string;
  textAlign?: "left" | "center" | "right";
  textDecoration?: "none" | "underline" | "line-through";
  textTransform?: "none" | "uppercase" | "lowercase" | "capitalize";
  letterSpacing?: number;
  lineHeight?: number;
  autoFit?: boolean;
  minFontSize?: number;
  maxLines?: number;
  fillColor?: string;
  borderColor?: string;
  borderWidth?: number;
  borderRadius?: number;
  opacity?: number;
  padding?: number;
  defaultValue?: string;
  dataBinding?: {
    columnKey: string;
    columnLabel: string;
  };
}

export interface IBulkTemplate extends Document {
  sceneVersion: number;
  companyCode: string;
  createdBy: string;
  name: string;
  canvas: IBulkCanvas;
  background: IBulkBackground;
  layers: IBulkLayer[];
  thumbnailUrl?: string;
  visibility: "private" | "public";
  publishedAt?: Date;
  useCount: number;
  version: number;
  status: "active" | "archived";
  createdAt: Date;
  updatedAt: Date;
}

export interface IBulkAsset extends Document {
  companyCode: string;
  createdBy: string;
  url: string;
  originalName: string;
  status: "active" | "archived";
  createdAt: Date;
  updatedAt: Date;
}

export type BulkJobStatus = "queued" | "processing" | "completed" | "partial" | "failed" | "cancelled";
export type BulkItemStatus = "queued" | "processing" | "completed" | "failed" | "cancelled";

export interface IBulkRenderJob extends Document {
  companyCode: string;
  createdBy: string;
  templateId?: Types.ObjectId;
  templateName: string;
  templateSnapshot: {
    sceneVersion?: number;
    canvas: IBulkCanvas;
    background: IBulkBackground;
    layers: IBulkLayer[];
  };
  status: BulkJobStatus;
  totalItems: number;
  completedItems: number;
  failedItems: number;
  progress: number;
  idempotencyKey: string;
  errorMessage?: string;
  lockId?: string;
  lockedAt?: Date;
  lockExpiresAt?: Date;
  startedAt?: Date;
  completedAt?: Date;
  cancelRequestedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface IBulkRenderItem extends Document {
  companyCode: string;
  jobId: Types.ObjectId;
  rowIndex: number;
  values: Record<string, string>;
  status: BulkItemStatus;
  outputUrl?: string;
  errorMessage?: string;
  attempts: number;
  startedAt?: Date;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}
