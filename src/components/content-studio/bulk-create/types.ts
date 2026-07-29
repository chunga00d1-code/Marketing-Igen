import type { BulkDataColumn, BulkLayer } from '../../../services/bulkCreateService';

export type EditorTool = 'background' | 'text' | 'image' | 'data' | 'history';
export type LayerType = 'text' | 'image';
export type TemplateLayer = BulkLayer;

export interface DataRow {
  id: string;
  name?: string;
  campaignAssetOrderId?: string;
  campaignSlotId?: string;
  values: Record<string, string>;
  sourceCells?: Record<string, string>;
  selected?: boolean;
}

export type PageRenderStatus =
  | 'queued'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface PageRenderState {
  status: PageRenderStatus;
  outputUrl?: string;
  errorMessage?: string;
}

export type DataColumn = BulkDataColumn;

export interface EditorSnapshot {
  layers: TemplateLayer[];
  rows: DataRow[];
  canvasSize: { width: number; height: number };
  backgroundId: string;
  backgroundImage: string;
  backgroundColor: string;
}

export type ResizeCorner = 'nw' | 'ne' | 'sw' | 'se' | 'w' | 'e';

export interface SelectionBox {
  left: number;
  top: number;
  width: number;
  height: number;
}
