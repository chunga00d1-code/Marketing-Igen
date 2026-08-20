import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSafeHtmlVideoComposition,
  type HtmlVideoSource,
} from "../html-video-security.service";

const validSource: HtmlVideoSource = {
  html: '<main class="hero" aria-label="Lời chào"><h1>Xin chào</h1></main>',
  css: ".hero { animation: enter 1s ease-out; }",
  durationSeconds: 5,
  aspectRatio: "16:9",
  resolution: "720p",
};

test("builds a server-owned 9:16 1080p composition", () => {
  const result = buildSafeHtmlVideoComposition({
    ...validSource,
    aspectRatio: "9:16",
    resolution: "1080p",
  });

  assert.equal(result.width, 1080);
  assert.equal(result.height, 1920);
  assert.equal(
    result.sanitizedHtml,
    '<main class="hero" aria-label="Lời chào"><h1>Xin chào</h1></main>'
  );
  assert.equal(result.sanitizedCss, validSource.css);
  assert.match(
    result.compositionHtml,
    /id="html-video-root"[\s\S]*data-composition-id="html-video"[\s\S]*data-width="1080"[\s\S]*data-height="1920"[\s\S]*data-duration="5"[\s\S]*data-no-timeline/
  );
  assert.match(result.compositionHtml, /width:1080px;height:1920px/);
  assert.match(result.compositionHtml, /linear-gradient\(135deg,#e0f2fe/);
  assert.match(result.compositionHtml, /<html data-no-timeline>/);
  assert.match(result.compositionHtml, /font-family:Inter,sans-serif/);
  assert.doesNotMatch(
    result.compositionHtml,
    /-apple-system|BlinkMacSystemFont/
  );
  assert.match(
    result.compositionHtml,
    /<script>window\.__timelines = window\.__timelines \|\| \{\};<\/script>/
  );
  assert.match(result.compositionHtml, /<main class="hero"/);
  assert.doesNotMatch(result.sanitizedHtml, /<script/i);
});

test("normalizes unsupported system font aliases before rendering", () => {
  const result = buildSafeHtmlVideoComposition({
    ...validSource,
    css: '.hero{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}',
  });

  assert.equal(
    result.sanitizedCss,
    '.hero{font-family:sans-serif,sans-serif,"Segoe UI",sans-serif}'
  );
  assert.doesNotMatch(result.compositionHtml, /-apple-system|BlinkMacSystemFont/i);
});

test("isolates multi-scene compositions on one server-owned timeline", () => {
  const result = buildSafeHtmlVideoComposition({
    ...validSource,
    html: '<main class="scene-deck"><section class="scene">One</section><section class="scene">Two</section><section class="scene">Three</section></main>',
    css: ".scene{position:relative;opacity:1;animation:model-scene 1s 60s reverse paused infinite}@keyframes model-scene{to{opacity:1}}",
    durationSeconds: 30,
  });

  assert.equal(
    (result.compositionHtml.match(/<section class="scene" data-html-video-scene=/g) || []).length,
    3
  );
  assert.match(result.compositionHtml, /\[data-html-video-scene\]\{position:absolute!important/);
  assert.match(result.compositionHtml, /animation-duration:30s!important/);
  assert.match(result.compositionHtml, /animation-delay:0s!important/);
  assert.match(result.compositionHtml, /animation-direction:normal!important/);
  assert.match(result.compositionHtml, /animation-play-state:running!important/);
  assert.match(result.compositionHtml, /animation-name:html-video-scene-0!important/);
  assert.match(result.compositionHtml, /@keyframes html-video-scene-2/);
});

test("maps every supported aspect ratio and resolution", () => {
  const cases = [
    ["16:9", "720p", 1280, 720],
    ["16:9", "1080p", 1920, 1080],
    ["9:16", "720p", 720, 1280],
    ["9:16", "1080p", 1080, 1920],
    ["1:1", "720p", 720, 720],
    ["1:1", "1080p", 1080, 1080],
  ] as const;

  for (const [aspectRatio, resolution, width, height] of cases) {
    const result = buildSafeHtmlVideoComposition({
      ...validSource,
      aspectRatio,
      resolution,
    });
    assert.deepEqual([result.width, result.height], [width, height]);
  }
});

test("injects only explicitly supplied inline image slots into the server-owned composition", () => {
  const source = {
    ...validSource,
    html: '<main><div data-media-slot="reference-1"></div></main>',
    assets: [{
      id: "reference-1",
      name: "Logo",
      kind: "image" as const,
      url: "data:image/png;base64,AAAA",
      role: "logo" as const,
      includeInVideo: true,
    }],
  };
  const result = buildSafeHtmlVideoComposition(source);

  assert.match(result.sanitizedHtml, /<img src="data:image\/png;base64,AAAA" alt="Logo" \/>/);
  assert.match(result.compositionHtml, /html-video-media-slot-logo/);
  assert.doesNotMatch(result.compositionHtml, /data:image\/png;base64,AAAA.*<script/i);
});

test("adds a recommended image when the model forgets to emit its slot", () => {
  const result = buildSafeHtmlVideoComposition({
    ...validSource,
    html: "<main><h1>Khám phá ngay</h1></main>",
    assets: [{
      id: "reference-1",
      name: "Logo",
      kind: "image",
      url: "data:image/png;base64,AAAA",
      role: "logo",
      includeInVideo: true,
    }],
  });

  assert.match(result.sanitizedHtml, /html-video-media-slot-logo/);
  assert.match(result.sanitizedHtml, /data:image\/png;base64,AAAA/);
});

test("injects the same product asset into every explicit scene slot", () => {
  const result = buildSafeHtmlVideoComposition({
    ...validSource,
    html: '<main><section class="scene"><div data-media-slot="reference-1"></div></section><section class="scene"><div data-media-slot="reference-1"></div></section></main>',
    css: '[data-media-slot="reference-1"]{position:absolute;inset:0}.scene{display:flex;flex-direction:column}',
    assets: [{
      id: "reference-1",
      name: "Product",
      kind: "image",
      url: "data:image/png;base64,AAAA",
      role: "hero",
      includeInVideo: true,
    }],
  });

  assert.equal((result.sanitizedHtml.match(/html-video-media-slot-hero/g) || []).length, 2);
  assert.match(result.compositionHtml, /html-video-media-slot\.html-video-media-slot-hero\{position:relative!important;inset:auto!important;width:72%!important;height:46%!important/);
  assert.doesNotMatch(result.compositionHtml, /html-video-media-slot-hero\{position:absolute;inset:8% 4% 8%/);
  assert.ok(
    result.compositionHtml.indexOf(".html-video-media-slot.html-video-media-slot-hero") >
      result.compositionHtml.indexOf('[data-media-slot="reference-1"]'),
    "server-owned media safety CSS must override model-generated slot positioning"
  );
});

test("rejects prohibited HTML elements", () => {
  const prohibited = [
    "<script>alert(1)</script>",
    "<style>body{display:none}</style>",
    "<iframe></iframe>",
    "<object></object>",
    "<embed>",
    "<form></form>",
    "<base href=x>",
    "<meta http-equiv=refresh>",
    "<svg></svg>",
    "<math></math>",
  ];

  for (const html of prohibited) {
    assert.throws(
      () => buildSafeHtmlVideoComposition({ ...validSource, html }),
      /HTML chứa nội dung không được phép/
    );
  }
});

test("rejects event handlers and every URL-bearing attribute", () => {
  const prohibited = [
    '<div onclick="alert(1)">x</div>',
    '<a href="https://example.com">x</a>',
    '<img src="https://example.com/x.png">',
    '<video poster="/poster.png"></video>',
    '<blockquote cite="https://example.com">x</blockquote>',
    '<div style="background:red">x</div>',
  ];

  for (const html of prohibited) {
    assert.throws(
      () => buildSafeHtmlVideoComposition({ ...validSource, html }),
      /HTML chứa nội dung không được phép/
    );
  }
});

test("rejects network-loading and script-capable CSS", () => {
  const prohibited = [
    '@import "https://example.com/a.css";',
    ".hero { background: url(https://example.com/a.png); }",
    ".hero { width: expression(alert(1)); }",
    ".hero { content: 'javascript:alert(1)'; }",
    ".hero { -moz-binding: url(xbl.xml#x); }",
  ];

  for (const css of prohibited) {
    assert.throws(
      () => buildSafeHtmlVideoComposition({ ...validSource, css }),
      /CSS chứa nội dung không được phép/
    );
  }
});

test("does not let comments hide prohibited CSS", () => {
  assert.throws(
    () =>
      buildSafeHtmlVideoComposition({
        ...validSource,
        css: "@im/**/port 'https://example.com/a.css';",
      }),
    /CSS chứa nội dung không được phép/
  );
});

test("rejects empty and oversized source", () => {
  assert.throws(
    () => buildSafeHtmlVideoComposition({ ...validSource, html: "   " }),
    /HTML không được để trống/
  );
  assert.throws(
    () =>
      buildSafeHtmlVideoComposition({
        ...validSource,
        html: `<p>${"a".repeat(100 * 1024)}</p>`,
      }),
    /HTML vượt quá 100 KiB/
  );
  assert.throws(
    () =>
      buildSafeHtmlVideoComposition({
        ...validSource,
        css: "a".repeat(100 * 1024 + 1),
      }),
    /CSS vượt quá 100 KiB/
  );
});

test("rejects unsupported runtime settings", () => {
  assert.throws(
    () =>
      buildSafeHtmlVideoComposition({
        ...validSource,
        durationSeconds: 0,
      }),
    /Thời lượng/
  );
  assert.throws(
    () =>
      buildSafeHtmlVideoComposition({
        ...validSource,
        aspectRatio: "4:3" as HtmlVideoSource["aspectRatio"],
      }),
    /Tỷ lệ/
  );
  assert.throws(
    () =>
      buildSafeHtmlVideoComposition({
        ...validSource,
        resolution: "4k" as HtmlVideoSource["resolution"],
      }),
    /Độ phân giải/
  );
});
