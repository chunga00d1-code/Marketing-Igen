import type { CandidateStatus, HtmlVideoCandidate, HtmlVideoReference } from './types';

export const MAX_DIRECT_PROMPT_LENGTH = 4_000;
// Keep room for the primary-prompt wrapper sent with the separate context field.
export const MAX_LONG_PROMPT_LENGTH = 23_000;
export const PRIMARY_PROMPT_FILE_NAME = 'prompt-day-du.txt';

export function isLongHtmlVideoPrompt(prompt: string) {
  return prompt.trim().length > MAX_DIRECT_PROMPT_LENGTH;
}

export function inferHtmlVideoAspectRatio(prompt: string): '9:16' | '1:1' | '16:9' | null {
  const normalized = prompt
    .toLocaleLowerCase('vi-VN')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u00d7x]/g, 'x')
    .replace(/\s+/g, ' ')
    .trim();

  const portraitPlatform =
    /(?:tik\s*tok|instagram\s*reels?|facebook\s*reels?|youtube\s*shorts?|social\s*(?:story|stories)|video\s*(?:dang\s*)?doc|khung\s*doc)/i;
  if (portraitPlatform.test(normalized)) return '9:16';
  if (/(?:9\s*:\s*16|1080\s*x\s*1920|portrait|vertical video|video doc|dang doc|khung doc)/i.test(normalized)) return '9:16';
  if (/(?:1\s*:\s*1|square|khung vuong)/i.test(normalized)) return '1:1';
  if (/(?:16\s*:\s*9|1920\s*x\s*1080|landscape|horizontal video|video ngang|dang ngang|khung ngang)/i.test(normalized)) return '16:9';
  return null;
}

export function seekableCompositionDocument(compositionHtml: string, frameSeconds: number, isPlaying: boolean) {
  const override = `<style data-preview-frame>#html-video-root,#html-video-root *:not(svg):not(path),#html-video-root *:not(svg):not(path)::before,#html-video-root *:not(svg):not(path)::after{animation-delay:-${Math.max(0, frameSeconds).toFixed(3)}s !important;animation-play-state:${isPlaying ? 'running' : 'paused'} !important;animation-fill-mode:both !important}</style>`;
  return compositionHtml.includes('</head>')
    ? compositionHtml.replace(/<\/head>/i, `${override}</head>`)
    : `${compositionHtml}${override}`;
}

export function inferExplicitHtmlVideoDuration(prompt: string): number | null {
  const normalized = prompt
    .toLocaleLowerCase('vi-VN')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
  const context = '(?:video|clip|teaser|duration|thoi luong|tong thoi luong|dai)';
  const unit = '(giay|seconds?|secs?|sec|s|phut|minutes?|mins?|min)';
  const before = normalized.match(new RegExp(`${context}[^.!?]{0,48}?(\\d{1,3}(?:[.,]\\d+)?)\\s*(?:-\\s*)?${unit}\\b`, 'i'));
  const after = normalized.match(new RegExp(`(?:^|[^\\d])(\\d{1,3}(?:[.,]\\d+)?)\\s*(?:-\\s*)?${unit}\\b[^.!?]{0,40}${context}`, 'i'));
  const motionTiming = /(?:animation|animate|hieu ung|transition|delay|chuyen canh)[^.!?]{0,40}\d/i;
  const strongVideoTiming = /(?:duration|thoi luong|tong thoi luong|video\s+dai|clip\s+dai)/i;
  const explicit = [before, after].find((candidate) => (
    candidate && (!motionTiming.test(candidate[0]) || strongVideoTiming.test(candidate[0]))
  )) || null;
  if (explicit) {
    const value = Number(explicit[1].replace(',', '.'));
    const seconds = /^(?:phut|minutes?|mins?|min)$/i.test(explicit[2]) ? value * 60 : value;
    return Math.max(1, Math.min(180, Math.round(seconds)));
  }

  const contextual = normalized.match(/(?:duration|thoi luong|tong thoi luong|video\s+dai|clip\s+dai)\s*(?:la|:|=)?\s*(\d{1,3})\b/i);
  if (contextual) return Math.max(1, Math.min(180, Number(contextual[1])));

  const numberWords = '(?:khong|mot|hai|ba|bon|tu|nam|lam|sau|bay|tam|chin|muoi|tram|linh|le)';
  const written = normalized.match(new RegExp(`${context}[^.!?]{0,28}?((?:${numberWords})(?:[\\s-]+${numberWords}){0,5})\\s*(?:giay|seconds?|secs?|sec)\\b`, 'i'));
  if (written) {
    const values: Record<string, number> = {
      khong: 0, mot: 1, hai: 2, ba: 3, bon: 4, tu: 4,
      nam: 5, lam: 5, sau: 6, bay: 7, tam: 8, chin: 9,
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

  return null;
}

export function automaticDuration(prompt: string) {
  const explicitDuration = inferExplicitHtmlVideoDuration(prompt);
  if (explicitDuration !== null) return explicitDuration;
  if (prompt.length > 420) return 30;
  if (prompt.length > 160) return 15;
  return 10;
}

export function formatVideoTime(seconds: number) {
  const safeSeconds = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  const minutes = Math.floor(safeSeconds / 60);
  return `${minutes}:${String(safeSeconds % 60).padStart(2, "0")}`;
}

export function estimateHtmlVideoGenerationProgress(elapsedSeconds: number) {
  const seconds = Math.max(0, elapsedSeconds);
  return Math.min(96, Math.max(4, Math.round(96 * (1 - Math.exp(-seconds / 18)))));
}

export function formatHtmlVideoElapsedTime(elapsedSeconds: number) {
  const totalSeconds = Math.max(0, Math.floor(elapsedSeconds));
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return minutes + ":" + seconds;
}

export function getHtmlVideoGenerationStage(elapsedSeconds: number) {
  if (elapsedSeconds < 5) return "Đang đọc nội dung và chuẩn bị slide";
  if (elapsedSeconds < 15) return "Đang chia bố cục và sắp xếp từng slide";
  if (elapsedSeconds < 30) return "Đang tối ưu chữ, chuyển cảnh và giọng đọc";
  return "Đang kiểm tra bản dựng trước khi render";
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
