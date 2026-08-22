import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyHtmlVideoRevisionIntent,
  isVisualOnlyRevision,
  isVoiceOnlyRevision,
} from "../html-video-revision.service";

test("classifies an animation correction as visual-only", () => {
  const intent = classifyHtmlVideoRevisionIntent(
    "Đổi animation tiêu đề thành fade-in trong 2s, giữ nguyên mọi thứ khác"
  );

  assert.equal(isVisualOnlyRevision(intent), true);
  assert.equal(intent.spec, false);
  assert.equal(intent.content, false);
});

test("classifies a narration correction as voice-only", () => {
  const intent = classifyHtmlVideoRevisionIntent(
    "Đổi giọng đọc sang tiếng Việt, giữ nguyên hình ảnh"
  );

  assert.equal(isVoiceOnlyRevision(intent), true);
});

test("separates content, timeline, spec and explicit full redesign", () => {
  assert.equal(classifyHtmlVideoRevisionIntent("Thay nội dung tiêu đề thành Jobs").content, true);
  assert.equal(classifyHtmlVideoRevisionIntent("Đổi thứ tự scene 2 và scene 3").timing, true);
  assert.equal(classifyHtmlVideoRevisionIntent("Đổi thời lượng video thành 90 giây").spec, true);
  assert.equal(classifyHtmlVideoRevisionIntent("Dựng lại toàn bộ video hoàn toàn").fullRedesign, true);
});
