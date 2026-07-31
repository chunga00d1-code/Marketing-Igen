import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { VideoStudioHome } from "../VideoStudioPage";

test("renders Mẫu video as the first creation tool", () => {
  const markup = renderToStaticMarkup(
    React.createElement(VideoStudioHome, { onSelect: () => undefined })
  );
  const templateIndex = markup.indexOf("Mẫu video");
  const aiVideoIndex = markup.indexOf("Tạo video từ nội dung");

  assert.ok(templateIndex >= 0);
  assert.ok(aiVideoIndex > templateIndex);
});

test("wires the templates tool to the existing library and editor", () => {
  const source = readFileSync("src/pages/VideoStudioPage.tsx", "utf8");

  assert.match(source, /VideoTemplateLibrary/);
  assert.match(source, /TemplateEditorWorkspace/);
  assert.match(source, /tool === "templates"/);
  assert.match(source, /setTemplateEditorConfig/);
  assert.match(source, /onBackToLibrary=\{\(\) => setTemplateEditorConfig\(null\)\}/);
});

test("renders and wires the HTML-to-video creation tool", () => {
  const markup = renderToStaticMarkup(
    React.createElement(VideoStudioHome, { onSelect: () => undefined })
  );
  const source = readFileSync("src/pages/VideoStudioPage.tsx", "utf8");

  assert.match(markup, /Tạo video từ HTML/);
  assert.match(source, /HtmlVideoWorkspace/);
  assert.match(source, /tool === "html-video"/);
  assert.match(source, /Đang mở công cụ HTML-to-video/);
});
