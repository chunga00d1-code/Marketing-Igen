import type { ShortVideoReplacementIssue } from './template-editor-replacement';

export async function requestTemplateExport<T>({
  validationIssues,
  ensureAutosave,
  createRender,
}: {
  validationIssues: ShortVideoReplacementIssue[];
  ensureAutosave: () => Promise<void>;
  createRender: () => Promise<T>;
}): Promise<T> {
  const issue = validationIssues[0];
  if (issue) {
    throw new Error(
      `Video thay thế "${issue.label}" (${issue.sourceDuration}s) ngắn hơn đoạn mẫu `
      + `và phần cắt yêu cầu (${issue.requiredDuration}s). `
      + 'Hãy chọn video đủ dài trước khi xuất.'
    );
  }
  await ensureAutosave();
  return createRender();
}
