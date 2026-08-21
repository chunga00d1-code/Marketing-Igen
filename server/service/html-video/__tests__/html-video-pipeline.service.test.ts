import assert from "node:assert/strict";
import test from "node:test";
import type { openrouterChat } from "../../openrouter.service";
import { buildSafeHtmlVideoComposition } from "../html-video-security.service";
import {
  fitHtmlVideoSceneTimeline,
  runHtmlVideoStructuredPipeline,
  type HtmlVideoPipelineCheckpoint,
  type HtmlVideoPipelineStage,
} from "../html-video-pipeline.service";

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
          eyebrow: "",
          headline: "Giải thích lợi ích đầu tiên",
          body: "",
          cta: "",
          assetIds: ["product-1"],
        },
        {
          sceneId: "scene-2",
          layout: "statement",
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
  assert.match(String(calls[1].messages[0].content), /Visual Composer/);
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
