import type { HtmlVideoAspectRatio, HtmlVideoAsset, HtmlVideoPreview, HtmlVideoRenderDetail, HtmlVideoResolution } from '../../../services/htmlVideoRenderService';

export type CandidateStatus = 'generating' | 'ready' | 'queued' | 'rendering' | 'uploading' | 'completed' | 'failed';

export type HtmlVideoCandidate = {
  id: string;
  label: string;
  prompt: string;
  html: string;
  css: string;
  durationSeconds: number;
  resolution: HtmlVideoResolution;
  status: CandidateStatus;
  preview: HtmlVideoPreview | null;
  render: HtmlVideoRenderDetail | null;
  error: string | null;
  createdAt: string;
  promptHistoryId?: string;
  promptRevision?: number;
  promptAspectRatio?: HtmlVideoAspectRatio;
  editMode?: boolean;
  projectName?: string;
  referenceNames?: string[];
  referenceContext?: string;
  referenceAssets?: HtmlVideoAsset[];
};

export type CandidateFilter = 'all' | 'active' | 'completed' | 'failed';

export type HtmlVideoReference = {
  id: string;
  name: string;
  kind: 'document' | 'image' | 'video';
  status: 'analyzing' | 'ready' | 'failed';
  context: string;
  error: string | null;
  assetUrl?: string;
  role?: 'background' | 'hero' | 'logo' | 'overlay';
  includeInVideo?: boolean;
};
