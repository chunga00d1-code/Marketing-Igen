import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  createHtmlVideoIdempotencyKey,
  hasHtmlVideoDraftSettingsChanged,
  hasHtmlVideoDraftSourceChanged,
  HtmlVideoWorkspace,
  isActiveHtmlVideoStatus,
  pollHtmlVideoRender,
  resolveHtmlVideoDraftConflict,
  resolveHtmlVideoDraftGeneration,
  shouldConfirmHtmlVideoDraftOverwrite,
  type HtmlVideoDraftConflictState as DraftConflictState,
  type HtmlVideoDraftWorkspaceSnapshot as DraftWorkspaceSnapshot,
  type HtmlVideoPendingDraftConflict as PendingDraftConflict,
} from "../HtmlVideoWorkspace";
import { mergePersistedHtmlVideoRenders } from "../HtmlVideoBatchWorkspace";
import {
  inferHtmlVideoAspectRatio,
  inferExplicitHtmlVideoDuration,
  automaticDuration,
  resolveHtmlVideoDuration,
  shouldAutoWriteHtmlVideoMasterPrompt,
  inferHtmlVideoReferenceDuration,
  estimateHtmlVideoGenerationProgress,
  formatHtmlVideoElapsedTime,
  getHtmlVideoGenerationStage,
  seekableCompositionDocument,
} from "../html-video/utils";
import type {
  HtmlVideoRenderDetail,
  HtmlVideoRenderStatus,
} from "../../../services/htmlVideoRenderService";

function render(status: HtmlVideoRenderStatus): HtmlVideoRenderDetail {
  return {
    id: "render-1",
    status,
    progress: status === "completed" ? 100 : 50,
    stageMessage: status,
    aspectRatio: "16:9",
    resolution: "720p",
    durationSeconds: 5,
    outputUrl:
      status === "completed" ? "https://cdn.example/final.mp4" : null,
    error: status === "failed" ? "Render failed safely." : null,
    createdAt: "2026-07-29T00:00:00.000Z",
    updatedAt: "2026-07-29T00:01:00.000Z",
    voiceEnabled: false,
    voiceStatus: "disabled",
  };
}

test("renders the prompt-first batch workspace and keeps its preview sandboxed", () => {
  const markup = renderToStaticMarkup(React.createElement(HtmlVideoWorkspace));
  const source = readFileSync(
    "src/components/content-studio/HtmlVideoBatchWorkspace.tsx",
    "utf8"
  );

  assert.match(markup, /Prompt AI/);
  assert.match(markup, /Bạn muốn video nói gì/);
  assert.match(source, /sandbox=""/);
  assert.match(source, /seekableCompositionDocument\(selectedCandidate\.preview\.compositionHtml/);
  assert.doesNotMatch(source, /allow-scripts|allow-same-origin/);
  assert.match(source, /\{selectedCandidate \? <section/);
  assert.match(source, /\{!selectedCandidate \? <section/);
  assert.doesNotMatch(source, /selectedCandidate && activeTool === "prompt"/);
  assert.doesNotMatch(source, /\{activeTool === "history" \? <>/);
  assert.doesNotMatch(markup, /Cài đặt video/);
});

test("preview seeking overrides the server-owned scene timeline with sufficient specificity", () => {
  const document = seekableCompositionDocument(
    "<html><head></head><body><div id=\"html-video-root\"></div></body></html>",
    4.25,
    false
  );

  assert.match(
    document,
    /#html-video-root,#html-video-root \*:not\(svg\):not\(path\)[\s\S]*animation-delay:-4\.250s !important;animation-play-state:paused !important/
  );
});

test("renders prompt generation controls and the exact wallet cost", () => {
  const source = readFileSync(
    "src/components/content-studio/HtmlVideoBatchWorkspace.tsx",
    "utf8"
  );

  assert.match(source, /Tạo video bằng AI/);
  assert.match(source, /Bạn muốn video nói gì/);
  assert.match(source, /service\.createGeneration/);
  assert.match(source, /pollHtmlVideoGeneration/);
  assert.match(source, /0,5 credit\/lần tạo/);
  assert.doesNotMatch(source, /maxLength=\{MAX_LONG_PROMPT_LENGTH\}/);
  assert.match(source, /Prompt dài sẽ tự chuyển thành/);
  assert.match(source, /Prompt vượt giới hạn, chưa thể tạo video/);
  assert.match(
    source,
    /if \(!aspectRatioLocked && effectiveAspectRatio !== aspectRatio\)[\s\S]*?setAspectRatioState\(effectiveAspectRatio\);\s*}\s*if \(!submittedPrompt \|\| isCreating \|\| referencesAnalyzing\) return;/
  );
  assert.match(source, /resolveHtmlVideoDuration\(\{/);
  assert.match(source, /rawUserPrompt: activePromptProvenance\.rawUserPrompt/);
  assert.doesNotMatch(source, /durationOverrideSeconds|durationDraftSeconds|saveDuration|html-video-duration/);
  assert.doesNotMatch(source, /type="number"/);
  assert.doesNotMatch(source, /Tùy chỉnh cài đặt/);
});

test("updates the selected video revision in place and preserves its references", () => {
  const source = readFileSync(
    "src/components/content-studio/HtmlVideoBatchWorkspace.tsx",
    "utf8"
  );

  assert.match(source, /id: editingCandidate\?\.id \|\| `html-video-candidate-/);
  assert.match(source, /current\.map\(\(candidate\) => candidate\.id === editingCandidate\.id \? nextCandidates\[0\]/);
  assert.match(source, /inheritedAssets\.length > 0 \? inheritedAssets : buildReferenceAssets/);
  assert.match(source, /editSource: editingCandidate \? \{/);
  assert.match(source, /existingDurationSeconds: editingCandidate\?\.durationSeconds/);
  assert.match(source, /aspectRatioSource === "manual"/);
  assert.match(source, /setAspectRatioSource\("inherited"\)/);
  assert.match(source, /snapshotHash: editingCandidate\.editSource\?\.snapshotHash/);
  assert.match(source, /await service\.getEditSource\(candidate\.render\.id\)/);
  assert.match(source, /if \(!editingCandidate && selectedCandidate\?\.render\)/);
  assert.match(source, /await service\.getEditSource\(selectedCandidate\.render\.id\)/);
  assert.match(source, /referenceAssets: editSource\.assets \|\| candidate\.referenceAssets/);
  assert.match(source, /setSelectedCandidateId\(isPromptHistory \? null : editableCandidate\.id\)/);
  assert.match(source, /C\u1eadp nh\u1eadt video hi\u1ec7n t\u1ea1i/);
});

test("keeps loading numbers moving while HTML-to-video is processing", () => {
  assert.equal(formatHtmlVideoElapsedTime(0), "00:00");
  assert.equal(formatHtmlVideoElapsedTime(65), "01:05");
  assert.ok(estimateHtmlVideoGenerationProgress(10) > estimateHtmlVideoGenerationProgress(0));
  assert.ok(estimateHtmlVideoGenerationProgress(120) <= 96);
  assert.equal(getHtmlVideoGenerationStage(0), "Đang đọc nội dung và chuẩn bị slide");
  assert.equal(getHtmlVideoGenerationStage(30), "Đang kiểm tra bản dựng trước khi render");

  const source = readFileSync(
    "src/components/content-studio/HtmlVideoBatchWorkspace.tsx",
    "utf8"
  );
  assert.match(source, /LoaderCircle/);
  assert.match(source, /\u0110ang x\u1eed l\u00fd b\u1ea3n d\u1ef1ng/);
  assert.match(source, /Đang tạo lại/);
});
test("recognizes explicit numeric and Vietnamese word durations", () => {
  assert.equal(automaticDuration("Video 15 giây giới thiệu sản phẩm"), 15);
  assert.equal(automaticDuration("Create a 20-second product teaser"), 20);
  assert.equal(automaticDuration("Video dài mười lăm giây với CTA cuối"), 15);
  assert.equal(automaticDuration("Thời lượng: 45 giây"), 45);
  const orderedImageContext = JSON.stringify({
    ordered_content_units: Array.from({ length: 15 }, (_, index) => ({
      order: index + 1,
      text: `job-${index + 1}`,
      confidence: 0.99,
    })),
  });
  assert.equal(inferHtmlVideoReferenceDuration(orderedImageContext), 30);
  assert.equal(automaticDuration("Đọc lần lượt bảng này", orderedImageContext), 30);
  assert.equal(inferExplicitHtmlVideoDuration("Đổi animation của tiêu đề"), null);
  assert.equal(inferExplicitHtmlVideoDuration("Cho animation tiêu đề chạy trong 2s"), null);
  assert.equal(inferExplicitHtmlVideoDuration("Video có animation tiêu đề chạy trong 2s"), null);
  assert.equal(inferExplicitHtmlVideoDuration("Đổi video thành 90 giây"), 90);
});

test("derives duration from the original idea instead of the expanded master prompt", () => {
  assert.equal(automaticDuration("Tạo video hướng dẫn quản lý công việc"), 20);
  assert.equal(automaticDuration("Tạo video giới thiệu thương hiệu"), 15);
  assert.equal(
    resolveHtmlVideoDuration({
      prompt: "# VIDEO BRIEF\n".repeat(100),
      rawUserPrompt: "Tạo video hướng dẫn quản lý công việc",
      optimizedDurationSeconds: 20,
    }),
    20
  );
  assert.equal(
    resolveHtmlVideoDuration({
      prompt: "# VIDEO BRIEF\n".repeat(100),
      rawUserPrompt: "Tạo video 90 giây hướng dẫn quản lý công việc",
      optimizedDurationSeconds: 20,
    }),
    90
  );
  assert.equal(
    resolveHtmlVideoDuration({
      prompt: "Làm animation mềm hơn",
      rawUserPrompt: "Làm animation mềm hơn",
      optimizedDurationSeconds: 15,
      existingDurationSeconds: 90,
    }),
    90
  );
});

test("automatically writes a master prompt only for a short, unoptimized idea", () => {
  assert.equal(
    shouldAutoWriteHtmlVideoMasterPrompt("Tạo video hướng dẫn quản lý công việc", false),
    true
  );
  assert.equal(
    shouldAutoWriteHtmlVideoMasterPrompt("Tạo video hướng dẫn quản lý công việc", true),
    false
  );
  assert.equal(
    shouldAutoWriteHtmlVideoMasterPrompt("ý ".repeat(500), false),
    false
  );

  const source = readFileSync(
    "src/components/content-studio/HtmlVideoBatchWorkspace.tsx",
    "utf8"
  );
  assert.match(source, /const shouldAutoWriteMasterPrompt = shouldAutoWriteHtmlVideoMasterPrompt/);
  assert.match(source, /if \(shouldAutoWriteMasterPrompt\)[\s\S]*geminiApi\.optimizeMasterPrompt/);
});


test("infers an explicit landscape storyboard ratio without treating vertical motion as portrait", () => {
  assert.equal(inferHtmlVideoAspectRatio("20 giây · 16:9 · 1920x1080 · translateY only in a scene note"), "16:9");
  assert.equal(inferHtmlVideoAspectRatio("Video dọc 9:16, 1080 x 1920"), "9:16");
  assert.equal(inferHtmlVideoAspectRatio("Video TikTok giới thiệu xe máy điện"), "9:16");
  assert.equal(inferHtmlVideoAspectRatio("Instagram Reels ra mắt sản phẩm"), "9:16");
  assert.equal(inferHtmlVideoAspectRatio("TikTok campaign; tài liệu mẫu có nhắc 16:9"), "9:16");
  assert.equal(inferHtmlVideoAspectRatio("Square 1:1 product card"), "1:1");
  assert.equal(inferHtmlVideoAspectRatio("Use a horizontal transition"), null);
});

test("exposes automatic and manual aspect-ratio controls in the batch workspace", () => {
  const source = readFileSync(
    "src/components/content-studio/HtmlVideoBatchWorkspace.tsx",
    "utf8"
  );

  assert.match(source, /TikTok, Reels và Shorts được tự động dựng dọc 9:16/);
  assert.match(source, /\["9:16", "1:1", "16:9"\]/);
  assert.match(source, /useAutomaticAspectRatio/);
  assert.match(source, /promptAspectRatio \|\| effectiveAspectRatio/);
});
test("requires overwrite confirmation only for edited AI source", () => {
  assert.equal(
    shouldConfirmHtmlVideoDraftOverwrite({
      hasGeneratedDraft: false,
      sourceDirtyAfterGeneration: false,
    }),
    false
  );
  assert.equal(
    shouldConfirmHtmlVideoDraftOverwrite({
      hasGeneratedDraft: true,
      sourceDirtyAfterGeneration: false,
    }),
    false
  );
  assert.equal(
    shouldConfirmHtmlVideoDraftOverwrite({
      hasGeneratedDraft: false,
      sourceDirtyAfterGeneration: true,
    }),
    false
  );
  assert.equal(
    shouldConfirmHtmlVideoDraftOverwrite({
      hasGeneratedDraft: true,
      sourceDirtyAfterGeneration: true,
    }),
    true
  );
});

test("detects source changes made while AI generation is in flight", () => {
  const started: DraftWorkspaceSnapshot = {
    html: "<main>Started</main>",
    css: "main{color:white}",
    durationSeconds: 5,
    aspectRatio: "16:9",
    resolution: "720p",
  };

  assert.equal(hasHtmlVideoDraftSourceChanged(started, { ...started }), false);
  assert.equal(
    hasHtmlVideoDraftSourceChanged(started, {
      ...started,
      html: "<main>Edited</main>",
    }),
    true
  );
  assert.equal(
    hasHtmlVideoDraftSourceChanged(started, {
      ...started,
      css: "main{color:blue}",
    }),
    true
  );
});

test("detects settings changes made while AI generation is in flight", () => {
  const started: DraftWorkspaceSnapshot = {
    html: "<main>Started</main>",
    css: "",
    durationSeconds: 5,
    aspectRatio: "16:9",
    resolution: "720p",
  };

  assert.equal(hasHtmlVideoDraftSettingsChanged(started, { ...started }), false);
  assert.equal(
    hasHtmlVideoDraftSettingsChanged(started, {
      ...started,
      durationSeconds: 8,
    }),
    true
  );
  assert.equal(
    hasHtmlVideoDraftSettingsChanged(started, {
      ...started,
      aspectRatio: "9:16",
    }),
    true
  );
  assert.equal(
    hasHtmlVideoDraftSettingsChanged(started, {
      ...started,
      resolution: "1080p",
    }),
    true
  );
});

test("applies an AI draft immediately only when the generation snapshot is unchanged", () => {
  const started: DraftWorkspaceSnapshot = {
    html: "<main>Started</main>",
    css: "",
    durationSeconds: 5,
    aspectRatio: "16:9",
    resolution: "720p",
  };
  const draft = { html: "<main>AI</main>", css: "main{color:white}" };

  assert.deepEqual(
    resolveHtmlVideoDraftGeneration(started, { ...started }, draft),
    {
      kind: "apply",
      draft,
    }
  );

  for (const current of [
    { ...started, html: "<main>User edit</main>" },
    { ...started, durationSeconds: 8 },
  ]) {
    assert.deepEqual(
      resolveHtmlVideoDraftGeneration(started, current, draft),
      {
        kind: "conflict",
        pending: {
          draft,
          generatedFor: {
            durationSeconds: 5,
            aspectRatio: "16:9",
            resolution: "720p",
          },
        },
      }
    );
  }
});

test("Apply AI replaces only source while Keep current preserves the workspace", () => {
  const pendingDraft: PendingDraftConflict = {
    draft: { html: "<main>AI</main>", css: "main{color:white}" },
    generatedFor: {
      durationSeconds: 5,
      aspectRatio: "16:9",
      resolution: "720p",
    },
  };
  const state: DraftConflictState = {
    snapshot: {
      html: "<main>User edit</main>",
      css: "main{color:blue}",
      durationSeconds: 8,
      aspectRatio: "9:16",
      resolution: "1080p",
    },
    hasGeneratedDraft: false,
    sourceDirtyAfterGeneration: true,
    pendingDraft,
  };

  assert.deepEqual(resolveHtmlVideoDraftConflict(state, "apply-ai"), {
    snapshot: {
      html: "<main>AI</main>",
      css: "main{color:white}",
      durationSeconds: 8,
      aspectRatio: "9:16",
      resolution: "1080p",
    },
    hasGeneratedDraft: true,
    sourceDirtyAfterGeneration: false,
    pendingDraft: null,
  });
  assert.deepEqual(resolveHtmlVideoDraftConflict(state, "keep-current"), {
    ...state,
    pendingDraft: null,
  });
});

test("defines an accessible in-flight conflict notice with explicit actions", () => {
  const source = readFileSync(
    "src/components/content-studio/HtmlVideoWorkspace.tsx",
    "utf8"
  );

  assert.match(source, /role="alert"/);
  assert.match(source, /Áp dụng bản AI/);
  assert.match(source, /Giữ bản hiện tại/);
  assert.match(source, /pendingDraft\.generatedFor\.durationSeconds/);
  assert.match(source, /pendingDraft\.generatedFor\.aspectRatio/);
  assert.match(source, /pendingDraft\.generatedFor\.resolution/);
});

test("keeps AI generation separate from render submission", () => {
  const source = readFileSync(
    "src/components/content-studio/HtmlVideoWorkspace.tsx",
    "utf8"
  );

  assert.match(source, /type="button"[\s\S]*Tạo HTML\/CSS bằng AI/);
  assert.match(source, /service\.generateDraft/);
  assert.match(source, /prompt: normalizedPrompt,[\s\S]*durationSeconds,[\s\S]*aspectRatio,[\s\S]*resolution,/);
  assert.doesNotMatch(source, /generateDraft[\s\S]{0,300}service\.create/);
});

test("keeps HTML video reference assistance on the OpenRouter path", () => {
  const source = readFileSync(
    "src/components/content-studio/HtmlVideoBatchWorkspace.tsx",
    "utf8"
  );

  assert.match(source, /optimizeVideoPrompt\([\s\S]{0,1600}\[dataUrl\]/);
  assert.match(source, /extractVideoReferenceFrames\(file\)/);
  assert.match(source, /frames\.length \? frames : undefined/);
  assert.match(source, /HTML\/CSS/);
  assert.match(source, /template/);
  assert.match(source, /isLocalFallback/);
  assert.doesNotMatch(source, /\/api\/v1\/media\/upload/);
  assert.doesNotMatch(source, /analyzeVideoStyle\(/);
  assert.match(source, /OpenRouter/);
});

test("uses server history instead of browser local storage for HTML video projects", () => {
  const source = readFileSync(
    "src/components/content-studio/HtmlVideoBatchWorkspace.tsx",
    "utf8"
  );

  assert.match(source, /createPromptHistory/);
  assert.match(source, /listPromptHistory/);
  assert.match(source, /listRenders/);
  assert.match(source, /candidates\.filter\(\(candidate\) => Boolean\(candidate\.render\)\)/);
  assert.doesNotMatch(source, /function promptHistoryCandidate/);
  assert.doesNotMatch(source, /localStorage/);
});

test("restores completed server renders as playable history candidates", () => {
  const persisted = Object.assign(render("completed"), {
    voiceEnabled: false,
    voiceStatus: "disabled" as const,
  });
  const restored = mergePersistedHtmlVideoRenders(
    [],
    [persisted],
    [{
      id: "prompt-history-1",
      projectName: "Video giới thiệu",
      prompt: "Giới thiệu sản phẩm",
      aspectRatio: "16:9",
      referenceNames: [],
      parentHistoryId: null,
      revision: 1,
      createdAt: "2026-07-29T00:00:00.000Z",
      renderId: "render-1",
    }]
  );

  assert.equal(restored.length, 1);
  assert.equal(restored[0].label, "Video giới thiệu");
  assert.equal(restored[0].render?.outputUrl, "https://cdn.example/final.mp4");
  assert.match(restored[0].preview?.compositionHtml || "", /<video/);
});

test("aborts AI generation on unmount and uses the overwrite confirmation copy", () => {
  const source = readFileSync(
    "src/components/content-studio/HtmlVideoWorkspace.tsx",
    "utf8"
  );

  assert.match(source, /draftControllerRef\.current\?\.abort\(\)/);
  assert.match(
    source,
    /Tạo lại bằng AI sẽ thay toàn bộ HTML và CSS bạn đã chỉnh sửa\. Bạn có muốn tiếp tục\?/
  );
});

test("recognizes only non-terminal statuses as active", () => {
  assert.equal(isActiveHtmlVideoStatus("queued"), true);
  assert.equal(isActiveHtmlVideoStatus("rendering"), true);
  assert.equal(isActiveHtmlVideoStatus("uploading"), true);
  assert.equal(isActiveHtmlVideoStatus("completed"), false);
  assert.equal(isActiveHtmlVideoStatus("failed"), false);
});

test("generates a valid unique idempotency key per submission", () => {
  const first = createHtmlVideoIdempotencyKey();
  const second = createHtmlVideoIdempotencyKey();

  assert.match(first, /^[a-zA-Z0-9_-]{12,100}$/);
  assert.match(second, /^[a-zA-Z0-9_-]{12,100}$/);
  assert.notEqual(first, second);
});

test("polls active renders until completed", async () => {
  const statuses: HtmlVideoRenderStatus[] = [
    "rendering",
    "uploading",
    "completed",
  ];
  const updates: HtmlVideoRenderStatus[] = [];
  let calls = 0;

  const result = await pollHtmlVideoRender({
    renderId: "render-1",
    signal: new AbortController().signal,
    getRender: async () => {
      const next = statuses[calls];
      calls += 1;
      return render(next);
    },
    onUpdate: (detail) => updates.push(detail.status),
    wait: async () => undefined,
  });

  assert.equal(result.status, "completed");
  assert.deepEqual(updates, ["rendering", "uploading", "completed"]);
  assert.equal(calls, 3);
});

test("stops polling on failed status", async () => {
  let calls = 0;
  const result = await pollHtmlVideoRender({
    renderId: "render-1",
    signal: new AbortController().signal,
    getRender: async () => {
      calls += 1;
      return render("failed");
    },
    onUpdate: () => undefined,
    wait: async () => undefined,
  });

  assert.equal(result.status, "failed");
  assert.equal(calls, 1);
  assert.equal(result.error, "Render failed safely.");
});

test("aborts polling before a stale response can update the UI", async () => {
  const controller = new AbortController();
  let updates = 0;

  await assert.rejects(
    pollHtmlVideoRender({
      renderId: "render-1",
      signal: controller.signal,
      getRender: async () => render("rendering"),
      onUpdate: () => {
        updates += 1;
      },
      wait: async () => {
        controller.abort();
      },
    }),
    /aborted/i
  );
  assert.equal(updates, 0);
});

test("renders the optimize master prompt button and undo button in the prompt panel", () => {
  const markup = renderToStaticMarkup(React.createElement(HtmlVideoWorkspace));
  const source = readFileSync(
    "src/components/content-studio/HtmlVideoBatchWorkspace.tsx",
    "utf8"
  );

  assert.match(
    source,
    /const masterPromptDuration = explicitDuration[\s\S]{0,420}referenceContext\.length > 420[\s\S]{0,300}optimizeMasterPrompt\(rawPrompt, referenceContext, imageUris, \{[\s\S]{0,120}durationSeconds: masterPromptDuration/
  );
  assert.match(source, /rawUserPrompt: rawPrompt/);
  assert.match(source, /masterPrompt: optimized\.masterPrompt\.trim\(\)/);
  assert.match(source, /prompt: authoritativePrompt/);
  assert.match(source, /promptProvenance: candidate\.promptProvenance/);
  assert.match(source, /mode: revisionMode \? "revision" : "create"/);
  assert.match(source, /setPrompt\(editingExistingVideo \? "" : editableCandidate\.prompt\)/);
  assert.match(source, /existingDurationSeconds: editingCandidate\?\.durationSeconds/);
  assert.match(markup, /Viết Master Prompt/);
  assert.match(markup, /html-video-optimize-prompt-btn/);
});
