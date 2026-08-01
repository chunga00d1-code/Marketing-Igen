import type { CandidateStatus, HtmlVideoCandidate, HtmlVideoReference } from './types';

export function seekableCompositionDocument(compositionHtml: string, frameSeconds: number, isPlaying: boolean) {
  const override = `<style data-preview-frame>*:not(svg):not(path),*:not(svg):not(path)::before,*:not(svg):not(path)::after{animation-delay:-${Math.max(0, frameSeconds).toFixed(3)}s !important;animation-play-state:${isPlaying ? 'running' : 'paused'} !important;animation-fill-mode:both !important}</style>`;
  return compositionHtml.includes('</head>')
    ? compositionHtml.replace(/<\/head>/i, `${override}</head>`)
    : `${compositionHtml}${override}`;
}

export function automaticDuration(prompt: string) {
  if (prompt.length > 420) return 30;
  if (prompt.length > 160) return 15;
  return 10;
}

export function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function parseAiComposition(text: string) {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const parsed: unknown = JSON.parse(cleaned);
  if (!parsed || typeof parsed !== 'object' || typeof (parsed as { html?: unknown }).html !== 'string' || typeof (parsed as { css?: unknown }).css !== 'string') {
    throw new Error('AI không trả về bản dựng HTML/CSS hợp lệ.');
  }
  return parsed as { html: string; css: string };
}

export function candidateStatusLabel(candidate: HtmlVideoCandidate) {
  if (candidate.status === 'generating') return 'Đang tạo bản dựng';
  if (candidate.status === 'ready') return 'Sẵn sàng render';
  if (candidate.status === 'queued') return 'Đang xếp hàng';
  if (candidate.status === 'rendering') return 'Đang render';
  if (candidate.status === 'uploading') return 'Đang hoàn tất';
  if (candidate.status === 'completed') return 'Hoàn tất';
  return 'Cần xử lý';
}

export function candidateStatusClass(status: CandidateStatus) {
  if (status === 'completed') return 'bg-emerald-100 text-emerald-700';
  if (status === 'failed') return 'bg-rose-100 text-rose-700';
  if (status === 'ready') return 'bg-sky-100 text-sky-700';
  return 'bg-amber-100 text-amber-700';
}

export function isCandidateActive(status: CandidateStatus) {
  return status === 'generating' || status === 'queued' || status === 'rendering' || status === 'uploading';
}

export function referenceKind(file: File): HtmlVideoReference['kind'] {
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('video/')) return 'video';
  return 'document';
}

export function fileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Không thể đọc tệp đã chọn.'));
    reader.readAsDataURL(file);
  });
}
