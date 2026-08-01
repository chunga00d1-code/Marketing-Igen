import type { HtmlVideoPreview, HtmlVideoRenderDetail } from '../../../services/htmlVideoRenderService';

export type CandidateStatus = 'generating' | 'ready' | 'queued' | 'rendering' | 'uploading' | 'completed' | 'failed';

export type HtmlVideoCandidate = {
  id: string;
  label: string;
  prompt: string;
  html: string;
  css: string;
  status: CandidateStatus;
  preview: HtmlVideoPreview | null;
  render: HtmlVideoRenderDetail | null;
  error: string | null;
  createdAt: string;
};

export type CandidateFilter = 'all' | 'active' | 'completed' | 'failed';

export type HtmlVideoReference = {
  id: string;
  name: string;
  kind: 'document' | 'image' | 'video';
  status: 'analyzing' | 'ready' | 'failed';
  context: string;
  error: string | null;
};
