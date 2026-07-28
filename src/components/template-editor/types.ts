export type TemplateEditorMode = 'edit-project' | 'create-template';

export type AspectRatioType = '9:16' | '1:1' | '16:9' | '3:4';

export type SidebarTabType = 'media' | 'templates' | 'stock_video' | 'images' | 'text' | 'audio';

export type ItemType = 'video' | 'image' | 'text' | 'audio';

export interface TextStyle {
  fontFamily: string;
  fontSize: number;
  color: string;
  align: 'left' | 'center' | 'right';
  bold: boolean;
  italic: boolean;
  x?: number; // percentage 0-100
  y?: number; // percentage 0-100
}

export interface ShotstackTextMergeFieldBinding {
  key: string;
  assetType: 'title' | 'html';
  source: string;
  prefix: string;
  suffix: string;
}

export interface TemplateEditorItem {
  id: string;
  trackId: string;
  type: ItemType;
  start: number; // in seconds
  duration: number; // in seconds
  sourceUrl?: string;
  thumbnailUrl?: string;
  text?: string;
  mergeValue?: string;
  replaceable?: boolean;
  replacement?: {
    originalType: 'video' | 'image';
    sourceType: 'video' | 'image';
    sourceDuration?: number;
  };
  providerBinding?: {
    provider: 'shotstack';
    trackIndex: number;
    clipIndex: number;
    rawTransition?: Record<string, unknown>;
    textMergeField?: ShotstackTextMergeFieldBinding;
  };
  trim?: number;
  opacity?: number;
  scale?: number;
  style?: TextStyle;
  volume?: number; // 0 to 1
  fitMode?: 'cover' | 'fit';
  rotation?: number;
  label?: string;
  order: number;
}

export interface TemplateEditorTrack {
  id: string;
  type: 'video' | 'text' | 'audio';
  name: string;
}

export type TemplateSubmissionStatus = 'draft' | 'pending_approval' | 'published';

export interface TemplateEditorProject {
  id: string;
  title: string;
  description?: string;
  categoryId?: string;
  tags?: string[];
  aspectRatio: AspectRatioType;
  duration: number;
  mode: TemplateEditorMode;
  tracks: TemplateEditorTrack[];
  items: TemplateEditorItem[];
  submissionStatus?: TemplateSubmissionStatus;
  coverUrl?: string;
  previewVideoUrl?: string;
  thumbnailUrl?: string;
}

export interface MediaAsset {
  id: string;
  name: string;
  type: ItemType;
  url: string;
  thumbnailUrl: string;
  duration?: number;
  added?: boolean;
  category?: string;
  uploadStatus?: 'uploading' | 'ready' | 'error';
  uploadProgress?: number;
  uploadError?: string;
  sourceFile?: File;
}
