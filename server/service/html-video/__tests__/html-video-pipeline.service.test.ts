import assert from "node:assert/strict";
import test from "node:test";
import type { openrouterChat } from "../../openrouter.service";
import { buildHtmlVideoGrounding } from "../html-video-grounding.service";
import { buildSafeHtmlVideoComposition } from "../html-video-security.service";
import {
  compileHtmlVideoComposition,
  fitHtmlVideoSceneTimeline,
  inferHtmlVideoNarrationLanguage,
  normalizePlan,
  resolveHtmlVideoPipelineModel,
  resolveHtmlVideoPipelineModels,
  runHtmlVideoStructuredPipeline,
  structuredCall,
  type HtmlVideoPipelineCheckpoint,
  type HtmlVideoPipelineStage,
} from "../html-video-pipeline.service";

test("resolves dedicated pipeline models with backward-compatible fallbacks", () => {
  const environment = {
    HTML_VIDEO_MODEL: "fallback/model",
    HTML_VIDEO_PLANNER_MODEL: "planner/model",
    HTML_VIDEO_VISUAL_MODEL: "visual/model",
    HTML_VIDEO_VOICE_MODEL: "voice/model",
    HTML_VIDEO_REVISION_MODEL: "revision/model",
  };

  assert.equal(resolveHtmlVideoPipelineModel("planner", environment), "planner/model");
  assert.equal(resolveHtmlVideoPipelineModel("visual", environment), "visual/model");
  assert.equal(resolveHtmlVideoPipelineModel("voice", environment), "voice/model");
  assert.equal(resolveHtmlVideoPipelineModel("revision", environment), "revision/model");
  assert.equal(
    resolveHtmlVideoPipelineModel("visual", { HTML_VIDEO_MODEL: "fallback/model" }),
    "fallback/model"
  );
  assert.equal(
    resolveHtmlVideoPipelineModel("planner", { GEMINI_MODEL: "google/gemini-test" }),
    "google/gemini-test"
  );
});

test("falls back to the next configured model only after the stage model fails", async (context) => {
  context.mock.method(console, "warn", () => undefined);
  const models: string[] = [];
  const result = await structuredCall(
    async (params) => {
      models.push(params.model);
      if (params.model === "visual/primary") {
        const error = new Error("provider rate limited") as Error & { status?: number };
        error.status = 429;
        throw error;
      }
      return { text: "{\"ok\":true}" };
    },
    "visual",
    "system",
    "user",
    { ok: "boolean" },
    0.2,
    {
      HTML_VIDEO_VISUAL_MODEL: "visual/primary",
      HTML_VIDEO_VISUAL_FALLBACK_MODEL: "visual/fallback",
      HTML_VIDEO_FALLBACK_MODEL: "global/fallback",
    }
  );

  assert.equal(result.text, "{\"ok\":true}");
  assert.deepEqual(models, ["visual/primary", "visual/fallback"]);
  assert.deepEqual(
    resolveHtmlVideoPipelineModels("visual", {
      HTML_VIDEO_VISUAL_MODEL: "visual/primary",
      HTML_VIDEO_VISUAL_FALLBACK_MODEL: "visual/fallback",
      HTML_VIDEO_FALLBACK_MODEL: "visual/fallback",
    }),
    ["visual/primary", "visual/fallback", "google/gemini-2.5-flash"]
  );
});

test("detects an explicit English voice request without being confused by Vietnamese UI text", () => {
  assert.equal(
    inferHtmlVideoNarrationLanguage({
      prompt: "Create a vocabulary lesson.",
      primaryPromptContext: "S\u1eed d\u1ee5ng gi\u1ecdng \u0111\u1ecdc ti\u1ebfng Anh. Kh\u00f4ng b\u1eaft bu\u1ed9c hi\u1ec3n th\u1ecb ngh\u0129a ti\u1ebfng Vi\u1ec7t.",
    }),
    "English"
  );
  assert.equal(
    inferHtmlVideoNarrationLanguage({
      prompt: "Create a vocabulary lesson.",
      promptProvenance: {
        rawUserPrompt: "Create a vocabulary lesson.",
        inferredAssumptions: { languageLock: "Vietnamese" },
      },
    }),
    "Vietnamese"
  );
});

test("keeps the raw user prompt authoritative over an expanded master prompt", () => {
  const rawUserPrompt = "Tạo video hướng dẫn quản lý công việc, dùng giọng đọc tiếng Việt.";
  const masterPrompt = [
    "# VIDEO BRIEF",
    "- Language: English",
    "# STORYBOARD",
    "## SCENE 1",
    "- Voice-over: Manage your work efficiently.",
  ].join("\n");
  const grounding = buildHtmlVideoGrounding({
    prompt: masterPrompt,
    promptProvenance: {
      rawUserPrompt,
      masterPrompt,
      inferredAssumptions: {
        narrationLanguage: "Vietnamese",
        durationSeconds: 10,
        aspectRatio: "9:16",
        imagePolicy: "none",
        inputImageCount: 0,
      },
    },
    durationSeconds: 10,
    aspectRatio: "9:16",
    resolution: "720p",
  });

  assert.equal(grounding.sourceText, rawUserPrompt);
  assert.equal(grounding.contentUnits[0]?.sourceText, rawUserPrompt);
  assert.equal(grounding.promptProvenance.masterPrompt, masterPrompt);
  assert.equal(
    inferHtmlVideoNarrationLanguage({
      prompt: masterPrompt,
      primaryPromptContext: masterPrompt,
      promptProvenance: grounding.promptProvenance,
    }),
    "Vietnamese"
  );
});

test("grounds the longest ordered vocabulary list without truncating fifteen items", () => {
  const words = [
    "teacher", "singer", "doctor", "firefighter", "office worker",
    "magician", "nurse", "taxi driver", "photographer", "astronaut",
    "chef", "lawyer", "baker", "musician", "hairdresser",
  ];
  const grounding = buildHtmlVideoGrounding({
    prompt: `Use the supplied image as background.\n${words.map((word, index) => `${index + 1}. ${word}`).join("\n")}\n\n1. focus\n2. speak`,
    durationSeconds: 30,
    aspectRatio: "16:9",
    resolution: "1080p",
  });

  assert.deepEqual(
    grounding.contentUnits.map((unit) => unit.normalizedText),
    words
  );
});

test("uses ordered OCR content units from an image reference for animation and voice planning", () => {
  const grounding = buildHtmlVideoGrounding({
    prompt: "Dùng ảnh làm nền, highlight và đọc lần lượt từng nghề trong bảng.",
    referenceContext: [
      "--- BEGIN REFERENCE: jobs.png (image) ---",
      JSON.stringify({
        should_include_source_image: true,
        source_image_role: "background",
        detected_language: "English",
        ordered_content_units: [
          { order: 1, text: "teacher", confidence: 0.99, bounding_box: { x: 0.08, y: 0.16, width: 0.14, height: 0.2 } },
          { order: 2, text: "singer", confidence: 0.98, bounding_box: { x: 0.25, y: 0.16, width: 0.14, height: 0.2 } },
          { order: 3, text: "doctor", confidence: 0.97, bounding_box: { x: 0.42, y: 0.16, width: 0.14, height: 0.2 } },
        ],
      }),
      "--- END REFERENCE: jobs.png ---",
    ].join("\n"),
    durationSeconds: 12,
    aspectRatio: "9:16",
    resolution: "720p",
  });

  assert.deepEqual(
    grounding.contentUnits.map((unit) => unit.normalizedText),
    ["teacher", "singer", "doctor"]
  );
  assert.deepEqual(
    grounding.contentUnits.map((unit) => unit.sourceKind),
    ["image_ocr", "image_ocr", "image_ocr"]
  );
  assert.deepEqual(
    grounding.contentUnits.map((unit) => unit.confidence),
    [0.99, 0.98, 0.97]
  );
  assert.deepEqual(grounding.contentUnits[0]?.region, {
    x: 0.08,
    y: 0.16,
    width: 0.14,
    height: 0.2,
    coordinateSpace: "normalized",
  });
  assert.ok(grounding.contentUnits.every((unit) => unit.requiredVerbatim));
});

test("merges multiple image OCR boards, attaches asset provenance, and sorts each board by geometry", () => {
  const firstAnalysis = {
    ordered_content_units: [
      { order: 1, text: "Second", bounding_box: { x: 0.55, y: 0.12, width: 0.3, height: 0.2 } },
      { order: 2, text: "First", bounding_box: { x: 0.08, y: 0.1, width: 0.3, height: 0.2 } },
    ],
  };
  const secondAnalysis = {
    ordered_content_units: [
      { order: 2, text: "Fourth", bounding_box: { x: 0.55, y: 0.62, width: 0.3, height: 0.2 } },
      { order: 1, text: "Third", bounding_box: { x: 0.08, y: 0.6, width: 0.3, height: 0.2 } },
    ],
  };
  const grounding = buildHtmlVideoGrounding({
    prompt: "Read every image item in order.",
    durationSeconds: 12,
    aspectRatio: "16:9",
    resolution: "720p",
    referenceContext: [
      "--- BEGIN REFERENCE: first.png (image) ---",
      JSON.stringify(firstAnalysis),
      "--- END REFERENCE: first.png ---",
      "--- BEGIN REFERENCE: second.png (image) ---",
      JSON.stringify(secondAnalysis),
      "--- END REFERENCE: second.png ---",
    ].join("\n"),
    referenceAssets: [
      { id: "asset-first", name: "first.png", kind: "image" },
      { id: "asset-second", name: "second.png", kind: "image" },
    ],
  });

  assert.deepEqual(
    grounding.contentUnits.map((unit) => [unit.normalizedText, unit.assetId]),
    [
      ["First", "asset-first"],
      ["Second", "asset-first"],
      ["Third", "asset-second"],
      ["Fourth", "asset-second"],
    ]
  );
});

test("filters legacy OCR title and publisher marks before planning a repeated board", () => {
  const jobs = [
    "teacher", "singer", "doctor", "firefighter", "office worker",
    "magician", "nurse", "taxi driver", "photographer", "astronaut",
    "chef", "lawyer", "baker", "musician", "hairdresser",
  ];
  const orderedContentUnits = [
    { order: 0, text: "Jobs", confidence: 0.99, bounding_box: { x: 0.04, y: 0.02, width: 0.18, height: 0.04 } },
    ...jobs.map((text, index) => ({
      order: index + 1,
      text,
      confidence: 0.98,
      bounding_box: {
        x: 0.06 + (index % 5) * 0.18,
        y: 0.13 + Math.floor(index / 5) * 0.25,
        width: 0.14,
        height: 0.2,
      },
    })),
    { order: 16, text: "MOCHIMOCHI", confidence: 0.95, bounding_box: { x: 0.42, y: 0.94, width: 0.18, height: 0.025 } },
  ];
  const grounding = buildHtmlVideoGrounding({
    prompt: "Use the image as background, highlight and read each board item in order.",
    referenceContext: [
      "--- BEGIN REFERENCE: jobs.png (image) ---",
      JSON.stringify({
        should_include_source_image: true,
        source_image_role: "background",
        detected_language: "English",
        ordered_content_units: orderedContentUnits,
      }),
      "--- END REFERENCE: jobs.png ---",
    ].join("\n"),
    durationSeconds: 45,
    aspectRatio: "9:16",
    resolution: "720p",
  });

  assert.deepEqual(grounding.contentUnits.map((unit) => unit.normalizedText), jobs);
  assert.deepEqual(grounding.contentUnits.map((unit) => unit.order), jobs.map((_, index) => index));
});
test("keeps an explicitly requested source image full-canvas across an ordered background sequence", () => {
  const words = [
    "teacher", "singer", "doctor", "firefighter", "office worker",
    "magician", "nurse", "taxi driver", "photographer", "astronaut",
    "chef", "lawyer", "baker", "musician", "hairdresser",
  ];
  const contentUnits = words.map((word, index) => ({
    id: `unit-${index + 1}`,
    order: index,
    sourceText: word,
    normalizedText: word,
    sourceRefs: ["source-current-prompt"],
    region: {
      x: 0.07 + (index % 5) * 0.18,
      y: 0.15 + Math.floor(index / 5) * 0.25,
      width: 0.14,
      height: 0.2,
      coordinateSpace: "normalized" as const,
    },
    required: true,
    requiredVerbatim: true,
  }));
  const scenePlan = words.map((word, index) => ({
    id: `scene-${index + 1}`,
    order: index,
    purpose: "content" as const,
    sourceUnitIds: [`unit-${index + 1}`],
    onScreenText: [word],
    narration: index === 1 ? "Listen carefully to the singer now." : `${word}.`,
    startSeconds: index * 2,
    endSeconds: (index + 1) * 2,
    transition: "crossfade" as const,
    assetIds: ["jobs-image"],
  }));
  const plan = {
    videoBrief: {
      objective: "Teach jobs in order",
      tone: "friendly",
      visualStyle: "educational",
      voiceRequired: true,
      exactPhrases: words,
      videoSpec: {
        aspectRatio: "16:9" as const,
        resolution: "1080p" as const,
        durationSeconds: 30,
        language: "en",
        audience: "beginners",
        platform: "generic" as const,
        cta: "",
      },
    },
    contentUnits,
    scenePlan,
  };
  const visual = {
    theme: "arctic" as const,
    scenes: words.map((word, index) => ({
      sceneId: `scene-${index + 1}`,
      layout: "statement" as const,
      emphasis: "standard" as const,
      accentStyle: "glow" as const,
      eyebrow: "",
      headline: word,
      body: "",
      cta: "",
      assetIds: ["jobs-image"],
    })),
  };
  const composition = compileHtmlVideoComposition(
    visual,
    plan,
    [{
      id: "jobs-image",
      name: "Jobs board",
      kind: "image",
      role: "hero",
      includeInVideo: false,
      width: 1200,
      height: 800,
    }],
    "S\u1eed d\u1ee5ng \u1ea3nh l\u00e0m n\u1ec1n xuy\u00ean su\u1ed1t video v\u00e0 highlight l\u1ea7n l\u01b0\u1ee3t theo th\u1ee9 t\u1ef1."
  );

  assert.match(composition.html, /scene-deck has-background-media background-sequence/);
  assert.equal(
    composition.html.match(/data-media-slot="jobs-image"/g)?.length,
    45
  );
  assert.match(composition.html, /class="scene-focus-card"/);
  assert.match(composition.html, /class="scene-background-blur"/);
  assert.match(composition.html, /class="scene-focus"/);
  assert.match(composition.html, /data-scene-id="scene-1" data-unit-id="unit-1" data-unit-ids="unit-1"/);
  assert.match(composition.html, /class="scene-focus" data-unit-id="unit-1"/);
  assert.match(composition.html, /15 \/ 15/);
  assert.match(composition.css, /scene-1 \.scene-focus/);
  assert.match(composition.css, /scene-1 \.scene-focus\{display:block;left:5\.320%;top:13\.200%;width:17\.360%;height:23\.600%/);
  assert.match(composition.css, /scene-15 \.scene-focus/);
  assert.match(composition.css, /object-fit:contain!important/);
  assert.match(composition.css, /@keyframes sceneProgressFill/);

  const safe = buildSafeHtmlVideoComposition({
    html: composition.html,
    css: composition.css,
    durationSeconds: 30,
    aspectRatio: "16:9",
    resolution: "1080p",
    scenePlan,
    assets: [{
      id: "jobs-image",
      name: "Jobs board",
      kind: "image",
      role: "hero",
      includeInVideo: false,
      width: 1200,
      height: 800,
      url: "data:image/png;base64,aGVsbG8=",
    }],
  });
  assert.equal(
    safe.compositionHtml.match(/<img src="data:image\/png;base64,aGVsbG8="/g)?.length,
    45
  );
  assert.match(safe.compositionHtml, /html-video-scene-14-background/);
  assert.match(safe.compositionHtml, /html-video-scene-14-focus/);
  assert.match(safe.compositionHtml, /data-scene-id="scene-15"/);
  assert.match(safe.compositionHtml, /data-unit-id="unit-15"/);

  const portraitComposition = compileHtmlVideoComposition(
    visual,
    {
      ...plan,
      videoBrief: {
        ...plan.videoBrief,
        videoSpec: {
          ...plan.videoBrief.videoSpec,
          aspectRatio: "9:16" as const,
          durationSeconds: 90,
        },
      },
    },
    [{
      id: "jobs-image",
      name: "Jobs board",
      kind: "image",
      role: "background",
      includeInVideo: true,
      width: 1200,
      height: 800,
    }],
    "Use the image as background and highlight every job in order."
  );
  assert.match(
    portraitComposition.css,
    /scene-background-stage\{position:absolute;left:4\.0000%;top:60\.5000%;width:92\.0000%;height:34\.5000%/
  );
  assert.match(portraitComposition.css, /scene-focus-card\{[^}]*height:42\.000%/);
  assert.match(portraitComposition.html, /15 \/ 15/);
});

test("normalizes incomplete AI scene timing to the exact video duration", () => {
  const scenes = [
    {
      id: "scene-1",
      order: 0,
      purpose: "opening" as const,
      sourceUnitIds: ["unit-1"],
      onScreenText: ["First"],
      narration: "First scene.",
      startSeconds: 0,
      endSeconds: 4,
      transition: "crossfade" as const,
      assetIds: [],
    },
    {
      id: "scene-2",
      order: 1,
      purpose: "closing" as const,
      sourceUnitIds: ["unit-2"],
      onScreenText: ["Second"],
      narration: "Second scene.",
      startSeconds: 4,
      endSeconds: 8,
      transition: "crossfade" as const,
      assetIds: [],
    },
  ];

  const result = fitHtmlVideoSceneTimeline(scenes, 10);

  assert.equal(result.adjusted, true);
  assert.deepEqual(
    result.scenes.map((scene) => [scene.startSeconds, scene.endSeconds]),
    [[0, 5], [5, 10]]
  );
});

test("reallocates valid planner timing from narration cadence instead of trusting guessed timestamps", () => {
  const scenes = [
    {
      id: "scene-1",
      order: 0,
      purpose: "opening" as const,
      sourceUnitIds: ["unit-1"],
      onScreenText: ["Short"],
      narration: "Short.",
      startSeconds: 0,
      endSeconds: 9,
      transition: "crossfade" as const,
      assetIds: [],
    },
    {
      id: "scene-2",
      order: 1,
      purpose: "closing" as const,
      sourceUnitIds: ["unit-2"],
      onScreenText: ["Detailed"],
      narration: "This second scene contains substantially more narration and therefore needs a longer readable hold.",
      startSeconds: 9,
      endSeconds: 10,
      transition: "crossfade" as const,
      assetIds: [],
    },
  ];

  const result = fitHtmlVideoSceneTimeline(scenes, 10, "English");

  assert.equal(result.adjusted, true);
  assert.equal(result.scenes[0].startSeconds, 0);
  assert.equal(result.scenes[1].endSeconds, 10);
  assert.equal(result.scenes[0].endSeconds, result.scenes[1].startSeconds);
  assert.ok(result.scenes[0].endSeconds < 5);
});

test("keeps a fifteen-item ninety-second timeline contiguous and evenly readable", () => {
  const scenes = Array.from({ length: 15 }, (_, index) => ({
    id: "scene-" + (index + 1),
    order: index,
    purpose: "content" as const,
    sourceUnitIds: ["unit-" + (index + 1)],
    onScreenText: ["Item " + (index + 1)],
    narration: "Item " + (index + 1) + ".",
    startSeconds: index,
    endSeconds: index + 1,
    transition: "crossfade" as const,
    assetIds: [],
  }));

  const result = fitHtmlVideoSceneTimeline(scenes, 90, "English");

  assert.deepEqual(
    result.scenes.map((scene) => [scene.startSeconds, scene.endSeconds]),
    Array.from({ length: 15 }, (_, index) => [index * 6, (index + 1) * 6])
  );
});

const draftInput = {
  prompt: "Giải thích lợi ích đầu tiên\nGiải thích lợi ích thứ hai",
  durationSeconds: 10,
  aspectRatio: "9:16" as const,
  resolution: "1080p" as const,
  referenceAssets: [{
    id: "product-1",
    name: "Ảnh sản phẩm",
    kind: "image" as const,
    role: "hero" as const,
    includeInVideo: true,
  }],
};

function response(value: unknown) {
  return { text: JSON.stringify(value) };
}

test("rejects code-switched narration when the prompt explicitly requires English voice", async () => {
  const englishInput = {
    prompt: "S\u1eed d\u1ee5ng gi\u1ecdng \u0111\u1ecdc ti\u1ebfng Anh. Voice: Teacher.",
    durationSeconds: 4,
    aspectRatio: "16:9" as const,
    resolution: "1080p" as const,
  };
  const contentUnit = {
    id: "unit-1",
    order: 0,
    sourceText: "teacher",
    normalizedText: "teacher",
    sourceRefs: ["source-current-prompt"],
    required: true,
    requiredVerbatim: true,
  };
  const scene = {
    id: "scene-1",
    order: 0,
    purpose: "content" as const,
    sourceUnitIds: ["unit-1"],
    onScreenText: ["teacher"],
    narration: "Teacher.",
    startSeconds: 0,
    endSeconds: 4,
    transition: "crossfade" as const,
    assetIds: [],
  };
  await assert.rejects(
    runHtmlVideoStructuredPipeline({
      chat: async () => response({
        scenes: [{ sceneId: "scene-1", text: "Teacher. Ti\u1ebfp theo." }],
        fullScript: "Teacher. Ti\u1ebfp theo.",
      }),
      draftInput: englishInput,
      generationPrompt: englishInput.prompt,
      referenceAssets: [],
      checkpoint: {
        grounding: buildHtmlVideoGrounding(englishInput),
        plan: {
          videoBrief: {
            objective: "Teach one job",
            tone: "friendly",
            visualStyle: "educational",
            voiceRequired: true,
            exactPhrases: ["teacher"],
            videoSpec: {
              aspectRatio: "16:9",
              resolution: "1080p",
              durationSeconds: 4,
              language: "English",
              audience: "beginners",
              platform: "generic",
              cta: "",
            },
          },
          contentUnits: [contentUnit],
          scenePlan: [scene],
        },
        visual: {
          theme: "arctic",
          scenes: [{
            sceneId: "scene-1",
            layout: "statement",
            emphasis: "standard",
            accentStyle: "glow",
            eyebrow: "",
            headline: "teacher",
            body: "",
            cta: "",
            assetIds: [],
          }],
        },
      },
    }),
    /explicitly requested English language/
  );
});

test("uses the deterministic ordered-board visual without calling the visual model", async () => {
  const words = ["teacher", "singer", "doctor", "firefighter"];
  const prompt = "Use the image as background, highlight and read each board item in order.";
  const referenceContext = [
    "--- BEGIN REFERENCE: jobs.png (image) ---",
    JSON.stringify({
      should_include_source_image: true,
      source_image_role: "background",
      detected_language: "English",
      ordered_content_units: words.map((text, index) => ({
        order: index + 1,
        text,
        confidence: 0.99,
        bounding_box: { x: 0.08 + index * 0.2, y: 0.2, width: 0.14, height: 0.2 },
      })),
    }),
    "--- END REFERENCE: jobs.png ---",
  ].join("\n");
  const orderedInput = {
    prompt,
    referenceContext,
    durationSeconds: 8,
    aspectRatio: "16:9" as const,
    resolution: "720p" as const,
    referenceAssets: [{
      id: "jobs-image",
      name: "Jobs board",
      kind: "image" as const,
      role: "hero" as const,
      includeInVideo: false,
    }],
  };
  const grounding = buildHtmlVideoGrounding(orderedInput);
  const plan: NonNullable<HtmlVideoPipelineCheckpoint["plan"]> = {
    videoBrief: {
      objective: "Teach jobs in board order",
      tone: "friendly",
      visualStyle: "educational",
      voiceRequired: true,
      exactPhrases: words,
      videoSpec: {
        aspectRatio: "16:9",
        resolution: "720p",
        durationSeconds: 8,
        language: "English",
        audience: "beginners",
        platform: "generic",
        cta: "",
      },
    },
    contentUnits: grounding.contentUnits,
    scenePlan: grounding.contentUnits.map((unit, index) => ({
      id: `scene-${index + 1}`,
      order: index,
      purpose: "content",
      sourceUnitIds: [unit.id],
      onScreenText: [unit.normalizedText],
      narration: `${unit.normalizedText}.`,
      startSeconds: index * 2,
      endSeconds: (index + 1) * 2,
      transition: "crossfade",
      assetIds: ["jobs-image"],
    })),
  };
  const checkpoint: HtmlVideoPipelineCheckpoint = {
    grounding,
    plan,
    voice: {
      scenes: plan.scenePlan.map((scene) => ({ sceneId: scene.id, text: scene.narration })),
      fullScript: plan.scenePlan.map((scene) => scene.narration).join(" "),
    },
  };
  let providerCalls = 0;
  const result = await runHtmlVideoStructuredPipeline({
    chat: async () => {
      providerCalls += 1;
      throw new Error("The deterministic board path must not call a model.");
    },
    draftInput: orderedInput,
    generationPrompt: prompt,
    referenceAssets: orderedInput.referenceAssets,
    checkpoint,
  });

  assert.equal(providerCalls, 0);
  assert.equal(result.kind, "structured");
  if (result.kind !== "structured") return;
  assert.match(result.html, /background-sequence/);
  assert.match(result.css, /sceneFocusPulse/);
  assert.ok(result.pipeline.findings.some(
    (finding) => finding.code === "DETERMINISTIC_ORDERED_BOARD_TEMPLATE_APPLIED"
  ));
});
test("plans content first, composes visual and voice in parallel roles, then compiles safe scenes", async () => {
  const calls: Parameters<typeof openrouterChat>[0][] = [];
  const checkpoint: HtmlVideoPipelineCheckpoint = {};
  const stages: HtmlVideoPipelineStage[] = [];
  const responses = [
    response({
      videoBrief: {
        objective: "Giải thích hai lợi ích",
        tone: "rõ ràng",
        visualStyle: "hiện đại",
        voiceRequired: true,
        language: "vi",
        audience: "khách hàng",
        cta: "",
        exactPhrases: [],
      },
      scenePlan: [
        {
          id: "scene-1",
          purpose: "opening",
          sourceUnitIds: ["unit-1"],
          onScreenText: ["Giải thích lợi ích đầu tiên"],
          narration: "Lợi ích đầu tiên được trình bày rõ ràng.",
          startSeconds: 0,
          endSeconds: 4,
          transition: "crossfade",
          assetIds: ["product-1"],
        },
        {
          id: "scene-2",
          purpose: "closing",
          sourceUnitIds: ["unit-2"],
          onScreenText: ["Giải thích lợi ích thứ hai"],
          narration: "Tiếp theo là lợi ích thứ hai.",
          startSeconds: 4,
          endSeconds: 10,
          transition: "crossfade",
          assetIds: [],
        },
      ],
    }),
    response({
      theme: "emerald",
      scenes: [
        {
          sceneId: "scene-1",
          layout: "split-left",
          compositionStyle: "showcase",
          surfaceStyle: "solid",
          backgroundStyle: "mesh",
          motionPreset: "scale-pop",
          eyebrow: "",
          headline: "Giải thích lợi ích đầu tiên",
          body: "",
          cta: "",
          assetIds: ["product-1"],
        },
        {
          sceneId: "scene-2",
          layout: "statement",
          compositionStyle: "editorial",
          surfaceStyle: "outline",
          backgroundStyle: "grid",
          motionPreset: "soft-reveal",
          eyebrow: "",
          headline: "Giải thích lợi ích thứ hai",
          body: "",
          cta: "",
          assetIds: [],
        },
      ],
    }),
    response({
      scenes: [
        { sceneId: "scene-1", text: "Lợi ích đầu tiên được trình bày rõ ràng." },
        { sceneId: "scene-2", text: "Tiếp theo là lợi ích thứ hai." },
      ],
      fullScript: "Lợi ích đầu tiên được trình bày rõ ràng. Tiếp theo là lợi ích thứ hai.",
    }),
  ];
  let index = 0;
  const chat: typeof openrouterChat = async (params) => {
    calls.push(params);
    return responses[index++];
  };

  const result = await runHtmlVideoStructuredPipeline({
    chat,
    draftInput,
    generationPrompt: draftInput.prompt,
    referenceAssets: draftInput.referenceAssets,
    onStage: (stage) => {
      stages.push(stage);
    },
    onCheckpoint: (key, value) => {
      Object.assign(checkpoint, { [key]: value });
    },
  });

  assert.equal(result.kind, "structured");
  if (result.kind !== "structured") return;
  assert.equal(calls.length, 3);
  assert.equal(calls[0].model, resolveHtmlVideoPipelineModel("planner"));
  assert.equal(calls[1].model, resolveHtmlVideoPipelineModel("visual"));
  assert.equal(calls[2].model, resolveHtmlVideoPipelineModel("voice"));
  assert.deepEqual(stages, ["grounding", "planning", "composing", "validation"]);
  assert.ok(checkpoint.grounding);
  assert.ok(checkpoint.plan);
  assert.ok(checkpoint.visual);
  assert.ok(checkpoint.voice);
  assert.match(String(calls[0].messages[0].content), /Storyboard Planner/);
  assert.match(String(calls[1].messages[0].content), /Visual Director/);
  assert.match(String(calls[2].messages[0].content), /Voice Writer/);
  assert.equal(result.pipeline.contentUnits.length, 2);
  assert.equal(result.pipeline.scenePlan[0].startSeconds, 0);
  assert.equal(result.pipeline.scenePlan[1].endSeconds, 10);
  assert.equal(result.pipeline.scenePlan[0].endSeconds, result.pipeline.scenePlan[1].startSeconds);
  assert.ok(result.pipeline.scenePlan[0].endSeconds > 5);
  assert.deepEqual(
    result.pipeline.scenePlan.map((scene) => scene.narration),
    checkpoint.voice?.scenes.map((scene) => scene.text)
  );
  assert.match(result.html, /class="scene scene-1/);
  assert.match(result.html, /data-media-slot="product-1"/);
  assert.match(result.html, /scene scene-1[^"]*has-media/);
  assert.match(result.html, /scene scene-2[^"]*has-motif/);
  assert.match(result.html, /scene-motif motif-bars/);
  assert.match(result.html, /scene scene-1[^"]*composition-showcase[^"]*surface-solid[^"]*background-mesh[^"]*motion-scale-pop/);
  assert.match(result.html, /scene scene-2[^"]*composition-editorial[^"]*surface-outline[^"]*background-grid[^"]*motion-soft-reveal/);
  assert.match(result.html, /class="scene-pattern"/);
  assert.match(result.html, /class="scene-band"/);
  assert.match(result.css, /\.composition-showcase \.scene-frame/);
  assert.match(result.css, /\.background-grid \.scene-pattern/);
  assert.doesNotMatch(result.html, /scene-illustration/);
  assert.match(result.voiceScript, /lợi ích thứ hai/i);

  const safe = buildSafeHtmlVideoComposition({
    html: result.html,
    css: result.css,
    durationSeconds: 10,
    aspectRatio: "9:16",
    resolution: "1080p",
    scenePlan: result.pipeline.scenePlan,
    assets: [{
      ...draftInput.referenceAssets[0],
      url: "data:image/png;base64,aGVsbG8=",
    }],
  });
  assert.match(safe.compositionHtml, /html-video-scene-0/);
  const firstSceneEndPercent = ((result.pipeline.scenePlan[0].endSeconds / 10) * 100).toFixed(4);
  assert.ok(safe.compositionHtml.includes(firstSceneEndPercent + "%"));
  assert.match(safe.compositionHtml, /html-video-scene-0-headline\{[^}]*scale\(\.68\)/);
  assert.match(safe.compositionHtml, /html-video-scene-0-pattern/);

  const resumedCalls: Parameters<typeof openrouterChat>[0][] = [];
  const checkpointWithoutVoice = { ...checkpoint, voice: undefined };
  const resumed = await runHtmlVideoStructuredPipeline({
    chat: async (params) => {
      resumedCalls.push(params);
      return responses[2];
    },
    draftInput,
    generationPrompt: draftInput.prompt,
    referenceAssets: draftInput.referenceAssets,
    checkpoint: checkpointWithoutVoice,
  });
  assert.equal(resumed.kind, "structured");
  assert.equal(resumedCalls.length, 1);
  assert.match(String(resumedCalls[0].messages[0].content), /Voice Writer/);
});

test("rejects a plan that omits a required content unit before visual or voice generation", async () => {
  let calls = 0;
  const chat: typeof openrouterChat = async () => {
    calls += 1;
    return response({
      videoBrief: {},
      scenePlan: [{
        id: "scene-1",
        purpose: "opening",
        sourceUnitIds: ["unit-1"],
        onScreenText: ["Giải thích lợi ích đầu tiên"],
        narration: "Lợi ích đầu tiên.",
        startSeconds: 0,
        endSeconds: 10,
        transition: "crossfade",
        assetIds: [],
      }],
    });
  };

  await assert.rejects(
    runHtmlVideoStructuredPipeline({
      chat,
      draftInput,
      generationPrompt: draftInput.prompt,
      referenceAssets: draftInput.referenceAssets,
    }),
    /unit-2 must appear at least once/
  );
  assert.equal(calls, 1);
});

test("fits an overlong Voice Writer scene to approved planner narration instead of failing generation", async () => {
  const [firstUnit, secondUnit] = draftInput.prompt.split("\n");
  const responses = [
    response({
      videoBrief: { objective: firstUnit, voiceRequired: true },
      scenePlan: [
        {
          id: "scene-1",
          purpose: "opening",
          sourceUnitIds: ["unit-1"],
          onScreenText: [firstUnit],
          narration: "First benefit.",
          startSeconds: 0,
          endSeconds: 2,
          transition: "crossfade",
          assetIds: [],
        },
        {
          id: "scene-2",
          purpose: "closing",
          sourceUnitIds: ["unit-2"],
          onScreenText: [secondUnit],
          narration: "Second benefit explained clearly.",
          startSeconds: 2,
          endSeconds: 10,
          transition: "crossfade",
          assetIds: [],
        },
      ],
    }),
    response({
      theme: "ocean",
      scenes: [
        { sceneId: "scene-1", layout: "centered", headline: firstUnit },
        { sceneId: "scene-2", layout: "centered", headline: secondUnit },
      ],
    }),
    response({
      scenes: [
        { sceneId: "scene-1", text: "This narration is deliberately far too long for a scene lasting only two seconds." },
        { sceneId: "scene-2", text: "Second benefit explained clearly." },
      ],
      fullScript: "ignored",
    }),
  ];
  const calls: Parameters<typeof openrouterChat>[0][] = [];
  const result = await runHtmlVideoStructuredPipeline({
    chat: async (params) => {
      calls.push(params);
      return responses[calls.length - 1];
    },
    draftInput,
    generationPrompt: draftInput.prompt,
    referenceAssets: draftInput.referenceAssets,
  });

  assert.equal(result.kind, "structured");
  if (result.kind !== "structured") return;
  assert.equal(result.pipeline.scenePlan[0].narration, "First benefit.");
  assert.match(result.voiceScript, /^First benefit\./);
  assert.ok(result.pipeline.findings.some((finding) =>
    finding.code === "VOICE_NARRATION_FITTED_TO_SCENE" && finding.sceneId === "scene-1"
  ));
  assert.match(String(calls[2].messages[0].content), /"sceneId":"scene-1","maximumWords":8/);
});
test("revises the existing HTML/CSS composition in place", async () => {
  const grounding = buildHtmlVideoGrounding(draftInput);
  const scenePlan = grounding.contentUnits.map((unit, index) => ({
    id: `scene-${index + 1}`,
    order: index,
    purpose: index === 0 ? "opening" as const : "closing" as const,
    sourceUnitIds: [unit.id],
    onScreenText: [unit.normalizedText],
    narration: unit.normalizedText,
    startSeconds: index === 0 ? 0 : 5,
    endSeconds: index === 0 ? 5 : 10,
    transition: "crossfade" as const,
    assetIds: [],
  }));
  const videoBrief = {
    objective: "Giải thích hai lợi ích",
    tone: "rõ ràng",
    visualStyle: "hiện đại",
    voiceRequired: true,
    exactPhrases: [],
    videoSpec: {
      aspectRatio: "9:16" as const,
      resolution: "1080p" as const,
      durationSeconds: 10,
      language: "Vietnamese",
      audience: "khách hàng",
      platform: "tiktok" as const,
      cta: "",
    },
  };
  const existingHtml = '<main class="scene-deck"><section class="scene scene-1"></section><section class="scene scene-2"></section></main>';
  const existingCss = '.scene{position:absolute;inset:0;animation:fade 5s both}';
  const editInput = {
    ...draftInput,
    prompt: "Đổi animation tiêu đề sang trượt ngang, giữ nguyên mọi phần khác.",
    editSource: {
      html: existingHtml,
      css: existingCss,
      voiceScript: grounding.contentUnits.map((unit) => unit.normalizedText).join(" "),
      pipeline: {
        version: "2.0" as const,
        sourceText: draftInput.prompt,
        sourceContextRefs: grounding.sourceContextRefs,
        videoBrief,
        contentUnits: grounding.contentUnits,
        scenePlan,
        findings: [],
      },
    },
  };
  const checkpoint: HtmlVideoPipelineCheckpoint = {
    grounding: buildHtmlVideoGrounding(editInput),
  };
  const calls: Parameters<typeof openrouterChat>[0][] = [];
  const responses = [
    response({
      htmlChanges: [{
        find: 'scene-1',
        replace: 'scene-1 revised-title-motion',
        expectedOccurrences: 1,
      }],
      cssAppend: '@keyframes titleSlide{from{opacity:0;transform:translateX(-30px)}to{opacity:1;transform:translateX(0)}}',
    }),
  ];
  const result = await runHtmlVideoStructuredPipeline({
    chat: async (params) => {
      calls.push(params);
      return responses[calls.length - 1];
    },
    draftInput: editInput,
    generationPrompt: editInput.prompt,
    referenceAssets: draftInput.referenceAssets,
    checkpoint,
    onCheckpoint: (key, value) => {
      Object.assign(checkpoint, { [key]: value });
    },
  });

  assert.equal(result.kind, "structured");
  if (result.kind !== "structured") return;
  assert.equal(calls.length, 1);
  assert.deepEqual(result.pipeline.contentUnits, editInput.editSource.pipeline.contentUnits);
  assert.deepEqual(result.pipeline.scenePlan.map(({ narration: _narration, ...scene }) => scene), scenePlan.map(({ narration: _narration, ...scene }) => scene));
  assert.equal(result.voiceScript, editInput.editSource.voiceScript);
  assert.match(result.html, /revised-title-motion/);
  assert.match(result.css, /titleSlide/);
  assert.ok(checkpoint.revision);
  assert.match(String(calls[0].messages[1].content), /existingComposition/);
  assert.match(String(calls[0].messages[1].content), /Đổi animation tiêu đề/);

  const voiceOnlyInput = {
    ...editInput,
    prompt: "Đổi giọng đọc sang tiếng Việt tự nhiên, giữ nguyên hình ảnh.",
  };
  const voiceCalls: Parameters<typeof openrouterChat>[0][] = [];
  const voiceOnlyResult = await runHtmlVideoStructuredPipeline({
    chat: async (params) => {
      voiceCalls.push(params);
      return response({
        scenes: scenePlan.map((scene) => ({ sceneId: scene.id, text: `Mới ${scene.order + 1}.` })),
        fullScript: scenePlan.map((scene) => `Mới ${scene.order + 1}.`).join(" "),
      });
    },
    draftInput: voiceOnlyInput,
    generationPrompt: voiceOnlyInput.prompt,
    referenceAssets: draftInput.referenceAssets,
    checkpoint: { grounding: buildHtmlVideoGrounding(voiceOnlyInput) },
  });

  assert.equal(voiceOnlyResult.kind, "structured");
  if (voiceOnlyResult.kind !== "structured") return;
  assert.equal(voiceCalls.length, 1);
  assert.equal(voiceOnlyResult.html, existingHtml);
  assert.equal(voiceOnlyResult.css, existingCss);
  assert.match(voiceOnlyResult.voiceScript, /Mới 1/);
});


test("deterministically maps every ordered OCR unit to exactly one scene", () => {
  const contentUnits = ["teacher", "singer", "doctor", "firefighter"].map((text, index) => ({
    id: `unit-${index + 1}`,
    order: index,
    sourceText: text,
    normalizedText: text,
    sourceRefs: ["source-reference-context"],
    sourceKind: "image_ocr" as const,
    required: true,
    requiredVerbatim: true,
  }));
  const plan = normalizePlan({
    videoBrief: {
      objective: "Read the board in order",
      language: "English",
      voiceRequired: true,
    },
    scenePlan: [
      {
        id: "duplicate-scene",
        purpose: "opening",
        sourceUnitIds: ["unit-1", "unit-2"],
        onScreenText: ["wrong planner text"],
        narration: "wrong planner narration",
        startSeconds: 0,
        endSeconds: 6,
      },
      {
        id: "duplicate-scene",
        purpose: "closing",
        sourceUnitIds: ["unit-1"],
        onScreenText: ["another wrong item"],
        narration: "another wrong narration",
        startSeconds: 6,
        endSeconds: 12,
      },
    ],
  }, {
    prompt: "Read every item in order.",
    durationSeconds: 12,
    aspectRatio: "9:16",
    resolution: "720p",
  }, contentUnits, new Set());

  assert.deepEqual(
    plan.scenePlan.map((scene) => ({
      id: scene.id,
      sourceUnitIds: scene.sourceUnitIds,
      onScreenText: scene.onScreenText,
      narration: scene.narration,
      startSeconds: scene.startSeconds,
      endSeconds: scene.endSeconds,
    })),
    contentUnits.map((unit, index) => ({
      id: `scene-${index + 1}`,
      sourceUnitIds: [unit.id],
      onScreenText: [unit.normalizedText],
      narration: unit.normalizedText,
      startSeconds: index * 3,
      endSeconds: (index + 1) * 3,
    }))
  );
});
test("allows one authoritative prompt unit to support multiple planned scenes", () => {
  const contentUnits = [{
    id: "unit-1",
    order: 0,
    sourceText: "Introduce a modern project management service.",
    normalizedText: "Introduce a modern project management service.",
    sourceRefs: ["source-current-prompt"],
    sourceKind: "prompt" as const,
    required: true,
    requiredVerbatim: false,
  }];
  const plan = normalizePlan({
    videoBrief: { objective: "Introduce the service", language: "English", voiceRequired: true },
    scenePlan: [
      { id: "scene-1", purpose: "opening", sourceUnitIds: [], onScreenText: ["Plan clearly"], narration: "Plan clearly.", startSeconds: 0, endSeconds: 3 },
      { id: "scene-2", purpose: "content", sourceUnitIds: ["unit-1"], onScreenText: ["Work together"], narration: "Work together.", startSeconds: 3, endSeconds: 7 },
      { id: "scene-3", purpose: "closing", sourceUnitIds: ["unit-1"], onScreenText: ["Start now"], narration: "Start now.", startSeconds: 7, endSeconds: 10 },
    ],
  }, {
    prompt: contentUnits[0].sourceText,
    durationSeconds: 10,
    aspectRatio: "16:9",
    resolution: "720p",
  }, contentUnits, new Set());

  assert.deepEqual(plan.scenePlan.map((scene) => scene.sourceUnitIds), [
    ["unit-1"], ["unit-1"], ["unit-1"],
  ]);
});

test("repairs repeated planner unit IDs by mapping equal unit and scene counts in order", () => {
  const contentUnits = ["First benefit", "Second benefit"].map((text, index) => ({
    id: `unit-${index + 1}`,
    order: index,
    sourceText: text,
    normalizedText: text,
    sourceRefs: ["source-current-prompt"],
    sourceKind: "prompt" as const,
    required: true,
    requiredVerbatim: false,
  }));
  const plan = normalizePlan({
    videoBrief: { objective: "Explain benefits", language: "English", voiceRequired: true },
    scenePlan: [
      { id: "scene-1", purpose: "content", sourceUnitIds: ["unit-1"], onScreenText: ["First benefit"], narration: "First benefit.", startSeconds: 0, endSeconds: 4 },
      { id: "scene-2", purpose: "content", sourceUnitIds: ["unit-1"], onScreenText: ["Second benefit"], narration: "Second benefit.", startSeconds: 4, endSeconds: 8 },
    ],
  }, {
    prompt: "First benefit\nSecond benefit",
    durationSeconds: 8,
    aspectRatio: "16:9",
    resolution: "720p",
  }, contentUnits, new Set());

  assert.deepEqual(plan.scenePlan.map((scene) => scene.sourceUnitIds), [
    ["unit-1"], ["unit-2"],
  ]);
});
test("repairs eighteen planner scenes that all repeat unit-1 and drops extra scenes", () => {
  const contentUnits = Array.from({ length: 18 }, (_, index) => ({
    id: `unit-${index + 1}`,
    order: index,
    sourceText: `Item ${index + 1}`,
    normalizedText: `Item ${index + 1}`,
    sourceRefs: ["source-current-prompt"],
    sourceKind: "prompt" as const,
    required: true,
    requiredVerbatim: false,
  }));
  const plannerScenes = Array.from({ length: 19 }, (_, index) => ({
    id: `planner-scene-${index + 1}`,
    purpose: index === 0 ? "opening" : index === 18 ? "closing" : "content",
    sourceUnitIds: ["unit-1"],
    onScreenText: [`Planner scene ${index + 1}`],
    narration: `Planner scene ${index + 1}.`,
    startSeconds: index,
    endSeconds: index + 1,
  }));
  const plan = normalizePlan({
    videoBrief: { objective: "Present all items", language: "English", voiceRequired: true },
    scenePlan: plannerScenes,
  }, {
    prompt: contentUnits.map((unit) => unit.sourceText).join("\n"),
    durationSeconds: 36,
    aspectRatio: "16:9",
    resolution: "720p",
  }, contentUnits, new Set());

  assert.equal(plan.scenePlan.length, 18);
  assert.deepEqual(
    plan.scenePlan.map((scene) => scene.sourceUnitIds),
    contentUnits.map((unit) => [unit.id])
  );
  assert.deepEqual(
    plan.scenePlan.map((scene) => [scene.startSeconds, scene.endSeconds]),
    Array.from({ length: 18 }, (_, index) => [index * 2, (index + 1) * 2])
  );
});
