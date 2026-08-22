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
  runHtmlVideoStructuredPipeline,
  type HtmlVideoPipelineCheckpoint,
  type HtmlVideoPipelineStage,
} from "../html-video-pipeline.service";

test("detects an explicit English voice request without being confused by Vietnamese UI text", () => {
  assert.equal(
    inferHtmlVideoNarrationLanguage({
      prompt: "Create a vocabulary lesson.",
      primaryPromptContext: "S\u1eed d\u1ee5ng gi\u1ecdng \u0111\u1ecdc ti\u1ebfng Anh. Kh\u00f4ng b\u1eaft bu\u1ed9c hi\u1ec3n th\u1ecb ngh\u0129a ti\u1ebfng Vi\u1ec7t.",
    }),
    "English"
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
    15
  );
  assert.match(composition.html, /class="scene-focus"/);
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
    15
  );
  assert.match(safe.compositionHtml, /html-video-scene-14-background/);
  assert.match(safe.compositionHtml, /html-video-scene-14-focus/);

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
    /scene-background-stage\{position:absolute;left:0\.0000%;top:31\.2500%;width:100\.0000%;height:37\.5000%/
  );
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
  assert.deepEqual(stages, ["grounding", "planning", "composing", "validation"]);
  assert.ok(checkpoint.grounding);
  assert.ok(checkpoint.plan);
  assert.ok(checkpoint.visual);
  assert.ok(checkpoint.voice);
  assert.match(String(calls[0].messages[0].content), /Storyboard Planner/);
  assert.match(String(calls[1].messages[0].content), /Visual Director/);
  assert.match(String(calls[2].messages[0].content), /Voice Writer/);
  assert.equal(result.pipeline.contentUnits.length, 2);
  assert.deepEqual(result.pipeline.scenePlan.map((scene) => [scene.startSeconds, scene.endSeconds]), [
    [0, 4],
    [4, 10],
  ]);
  assert.deepEqual(
    result.pipeline.scenePlan.map((scene) => scene.narration),
    checkpoint.voice?.scenes.map((scene) => scene.text)
  );
  assert.match(result.html, /class="scene scene-1/);
  assert.match(result.html, /data-media-slot="product-1"/);
  assert.match(result.html, /scene scene-1[^"]*has-media/);
  assert.match(result.html, /scene scene-2[^"]*no-media/);
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
  assert.match(safe.compositionHtml, /40\.0000%/);
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
    /unit-2 must appear exactly once/
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
  assert.match(String(calls[2].messages[0].content), /"sceneId":"scene-1","maximumWords":5/);
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
