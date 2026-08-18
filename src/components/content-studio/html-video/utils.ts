import type { CandidateStatus, HtmlVideoCandidate, HtmlVideoReference } from './types';

export function seekableCompositionDocument(compositionHtml: string, frameSeconds: number, isPlaying: boolean) {
  const override = `<style data-preview-frame>*:not(svg):not(path),*:not(svg):not(path)::before,*:not(svg):not(path)::after{animation-delay:-${Math.max(0, frameSeconds).toFixed(3)}s !important;animation-play-state:${isPlaying ? 'running' : 'paused'} !important;animation-fill-mode:both !important}</style>`;
  return compositionHtml.includes('</head>')
    ? compositionHtml.replace(/<\/head>/i, `${override}</head>`)
    : `${compositionHtml}${override}`;
}

export function automaticDuration(prompt: string) {
  const normalized = prompt
    .toLocaleLowerCase('vi-VN')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
  const explicit = normalized.match(/(?:^|[^\d])(\d{1,3})\s*(?:-\s*)?(?:giay|seconds?|secs?|sec|s)\b/i);
  if (explicit) return Math.max(1, Math.min(180, Number(explicit[1])));

  const contextual = normalized.match(/(?:duration|thoi luong|dai)\s*(?:la|:|=)?\s*(\d{1,3})\b/i);
  if (contextual) return Math.max(1, Math.min(180, Number(contextual[1])));

  const numberWords = '(?:khong|mot|hai|ba|bon|tu|nam|lam|sau|bay|tam|chin|muoi|tram|linh|le)';
  const written = normalized.match(new RegExp(`((?:${numberWords})(?:[\\s-]+${numberWords}){0,5})\\s*(?:giay|seconds?|secs?|sec)\\b`, 'i'));
  if (written) {
    const values: Record<string, number> = {
      khong: 0,
      mot: 1,
      hai: 2,
      ba: 3,
      bon: 4,
      tu: 4,
      nam: 5,
      lam: 5,
      sau: 6,
      bay: 7,
      tam: 8,
      chin: 9,
    };
    let total = 0;
    let current = 0;
    for (const word of written[1].split(/[\s-]+/)) {
      if (word === 'tram') {
        total += (current || 1) * 100;
        current = 0;
      } else if (word === 'muoi') {
        current = (current || 1) * 10;
      } else if (word !== 'linh' && word !== 'le' && word in values) {
        current += values[word];
      }
    }
    const parsed = total + current;
    if (parsed > 0) return Math.max(1, Math.min(180, parsed));
  }

  if (prompt.length > 420) return 30;
  if (prompt.length > 160) return 15;
  return 10;
}

export function formatVideoTime(seconds: number) {
  const safeSeconds = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  const minutes = Math.floor(safeSeconds / 60);
  return `${minutes}:${String(safeSeconds % 60).padStart(2, "0")}`;
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
  if (candidate.promptHistoryId && !candidate.html && !candidate.render) return `Bấm để dùng lại prompt v${candidate.promptRevision || 1}`;
  if (candidate.status === 'generating') return 'Đang tạo bản dựng';
  if (candidate.status === 'ready') return candidate.preview ? 'Sẵn sàng render' : 'Chờ cập nhật preview';
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
