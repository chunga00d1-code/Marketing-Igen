import Joi from "joi";

const maximumSourceBytes = 100 * 1024;
const maximumContentUnits = 24;

function byteLimitedString(label: "HTML" | "CSS", allowEmpty: boolean) {
  let schema = Joi.string().custom((value: string, helpers) => {
    if (Buffer.byteLength(value, "utf8") > maximumSourceBytes) {
      return helpers.message({ custom: `${label} vượt quá 100 KiB.` });
    }
    return value;
  });
  if (allowEmpty) schema = schema.allow("");
  return schema.required();
}

const htmlVideoSettingFields = {
  durationSeconds: Joi.number().integer().min(1).max(180).required(),
  aspectRatio: Joi.string().valid("16:9", "9:16", "1:1").required(),
  resolution: Joi.string().valid("720p", "1080p").required(),
};

const htmlVideoAssetFields = {
  id: Joi.string().pattern(/^[a-zA-Z0-9_-]{1,80}$/).required(),
  name: Joi.string().trim().max(180).required(),
  kind: Joi.string().valid("image").required(),
  url: Joi.string()
    .max(120_000)
    .custom((value: string, helpers) => {
      const isCloudinary = /^https:\/\/res\.cloudinary\.com\//i.test(value);
      const isInlineImage = /^data:image\/(?:png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=\s]+$/i.test(value);
      return isCloudinary || isInlineImage
        ? value
        : helpers.error("string.pattern.base");
    })
    .required(),
  role: Joi.string().valid("background", "hero", "logo", "overlay").optional(),
  includeInVideo: Joi.boolean().default(true),
  width: Joi.number().integer().min(1).max(20_000).optional(),
  height: Joi.number().integer().min(1).max(20_000).optional(),
};

const htmlVideoReferenceSlotFields = {
  id: Joi.string().pattern(/^[a-zA-Z0-9_-]{1,80}$/).required(),
  name: Joi.string().trim().max(180).required(),
  kind: Joi.string().valid("image").required(),
  role: Joi.string().valid("background", "hero", "logo", "overlay").optional(),
  includeInVideo: Joi.boolean().default(true),
  width: Joi.number().integer().min(1).max(20_000).optional(),
  height: Joi.number().integer().min(1).max(20_000).optional(),
};

const htmlVideoScenePlanItemSchema = Joi.object({
  id: Joi.string().pattern(/^[a-zA-Z0-9_-]{1,80}$/).required(),
  order: Joi.number().integer().min(0).max(maximumContentUnits - 1).required(),
  purpose: Joi.string().valid("opening", "content", "closing").required(),
  sourceUnitIds: Joi.array().items(Joi.string().max(80)).max(maximumContentUnits).required(),
  onScreenText: Joi.array().items(Joi.string().max(1_000)).max(5).required(),
  narration: Joi.string().max(2_000).allow("").required(),
  startSeconds: Joi.number().min(0).max(180).required(),
  endSeconds: Joi.number().greater(Joi.ref("startSeconds")).max(180).required(),
  transition: Joi.string().valid("crossfade", "slide-left", "slide-right").required(),
  assetIds: Joi.array().items(Joi.string().max(80)).max(6).required(),
});

const htmlVideoPipelineSchema = Joi.object({
  version: Joi.string().valid("2.0").required(),
  sourceText: Joi.string().max(23_000).required(),
  promptProvenance: Joi.object({
    rawUserPrompt: Joi.string().trim().min(1).max(23_000).required(),
    masterPrompt: Joi.string().trim().min(1).max(23_000).optional(),
    inferredAssumptions: Joi.object({
      requestSpecVersion: Joi.string().valid("1.0").optional(),
      mode: Joi.string().valid("create", "revision").optional(),
      contentMode: Joi.string().max(80).optional(),
      narrationLanguage: Joi.string().max(80).optional(),
      languageLock: Joi.string().max(80).optional(),
      durationPolicy: Joi.string()
        .valid("explicit", "inferred", "preserve-existing")
        .optional(),
      durationSeconds: Joi.number().integer().min(1).max(180).optional(),
      aspectRatio: Joi.string().valid("16:9", "9:16", "1:1").optional(),
      imagePolicy: Joi.string().valid("none", "embed", "reference", "mixed").optional(),
      inputImageCount: Joi.number().integer().min(0).max(6).optional(),
      sourceOrder: Joi.string().valid("preserve").optional(),
      preserveUnrequestedProperties: Joi.boolean().optional(),
    }).optional(),
  }).optional(),
  sourceContextRefs: Joi.array().items(Joi.object({
    id: Joi.string().max(120).required(),
    type: Joi.string().valid("prompt", "prompt_file", "reference", "asset", "history").required(),
    label: Joi.string().max(180).required(),
  })).max(20).required(),
  videoBrief: Joi.object({
    objective: Joi.string().max(2_000).required(),
    tone: Joi.string().max(200).required(),
    visualStyle: Joi.string().max(300).required(),
    voiceRequired: Joi.boolean().required(),
    exactPhrases: Joi.array().items(Joi.string().max(500)).max(20).required(),
    videoSpec: Joi.object({
      aspectRatio: Joi.string().valid("16:9", "9:16", "1:1").required(),
      resolution: Joi.string().valid("720p", "1080p").required(),
      durationSeconds: Joi.number().integer().min(1).max(180).required(),
      language: Joi.string().max(80).required(),
      audience: Joi.string().max(300).required(),
      platform: Joi.string().valid("tiktok", "reels", "shorts", "facebook", "generic").required(),
      cta: Joi.string().max(500).allow("").required(),
    }).required(),
  }).required(),
  contentUnits: Joi.array().items(Joi.object({
    id: Joi.string().max(80).required(),
    order: Joi.number().integer().min(0).max(maximumContentUnits - 1).required(),
    assetId: Joi.string().pattern(/^[a-zA-Z0-9_-]{1,80}$/).optional(),
    sourceText: Joi.string().max(4_000).required(),
    normalizedText: Joi.string().max(4_000).required(),
    sourceRefs: Joi.array().items(Joi.string().max(120)).max(8).required(),
    sourceKind: Joi.string().valid("prompt", "document", "image_ocr", "history").optional(),
    confidence: Joi.number().min(0).max(1).optional(),
    region: Joi.object({
      x: Joi.number().min(0).max(1).required(),
      y: Joi.number().min(0).max(1).required(),
      width: Joi.number().greater(0).max(1).required(),
      height: Joi.number().greater(0).max(1).required(),
      coordinateSpace: Joi.string().valid("normalized").required(),
    }).optional(),
    required: Joi.boolean().required(),
    requiredVerbatim: Joi.boolean().required(),
  })).min(1).max(maximumContentUnits).required(),
  scenePlan: Joi.array().items(htmlVideoScenePlanItemSchema).min(1).max(maximumContentUnits).required(),
  findings: Joi.array().items(Joi.object({
    stage: Joi.string().valid("grounding", "planning", "visual", "voice", "validation").required(),
    code: Joi.string().max(120).required(),
    severity: Joi.string().valid("info", "warning", "error").required(),
    message: Joi.string().max(500).required(),
    sceneId: Joi.string().max(80).optional(),
  })).max(40).required(),
});

const htmlVideoEditSourceSchema = Joi.object({
  html: byteLimitedString("HTML", false),
  css: byteLimitedString("CSS", true),
  voiceScript: Joi.string().trim().max(8_000).allow("").optional(),
  snapshotHash: Joi.string().hex().length(64).optional(),
  pipeline: htmlVideoPipelineSchema.optional(),
});

const htmlVideoFields = {
  html: byteLimitedString("HTML", false),
  css: byteLimitedString("CSS", true),
  assets: Joi.array().items(Joi.object(htmlVideoAssetFields)).max(6).default([]),
  scenePlan: Joi.array().items(htmlVideoScenePlanItemSchema).min(1).max(maximumContentUnits).optional(),
  ...htmlVideoSettingFields,
};

const htmlVideoDraftKeys = new Set([
  "prompt",
  "promptProvenance",
  "durationSeconds",
  "aspectRatio",
  "resolution",
  "promptHistoryId",
  "referenceContext",
  "primaryPromptContext",
  "primaryPromptFileName",
  "referenceAssets",
  "editSource",
  "idempotencyKey",
]);

export const htmlVideoPreviewBodySchema = Joi.object(htmlVideoFields);

export const htmlVideoContextPreviewBodySchema = Joi.object({
  prompt: Joi.string().trim().min(3).max(5_000).required(),
  aspectRatio: Joi.string().valid("16:9", "9:16", "1:1").required(),
  useKnowledge: Joi.boolean().required(),
  useBrandGuideline: Joi.boolean().required(),
  referenceNames: Joi.array().items(Joi.string().trim().max(180)).max(6).default([]),
});


export const htmlVideoDraftBodySchema = Joi.object({
  prompt: Joi.string().trim().min(1).max(4_000).required(),
  promptProvenance: Joi.object({
    rawUserPrompt: Joi.string().trim().min(1).max(23_000).required(),
    masterPrompt: Joi.string().trim().min(1).max(23_000).optional(),
    inferredAssumptions: Joi.object({
      requestSpecVersion: Joi.string().valid("1.0").optional(),
      mode: Joi.string().valid("create", "revision").optional(),
      contentMode: Joi.string().max(80).optional(),
      narrationLanguage: Joi.string().max(80).optional(),
      languageLock: Joi.string().max(80).optional(),
      durationPolicy: Joi.string()
        .valid("explicit", "inferred", "preserve-existing")
        .optional(),
      durationSeconds: Joi.number().integer().min(1).max(180).optional(),
      aspectRatio: Joi.string().valid("16:9", "9:16", "1:1").optional(),
      imagePolicy: Joi.string().valid("none", "embed", "reference", "mixed").optional(),
      inputImageCount: Joi.number().integer().min(0).max(6).optional(),
      sourceOrder: Joi.string().valid("preserve").optional(),
      preserveUnrequestedProperties: Joi.boolean().optional(),
    }).optional(),
  }).optional(),
  promptHistoryId: Joi.string().hex().length(24).optional(),
  referenceContext: Joi.string().trim().max(24_000).optional(),
  primaryPromptContext: Joi.string().trim().max(23_000).optional(),
  primaryPromptFileName: Joi.string().trim().max(180).optional(),
  referenceAssets: Joi.array()
    .items(Joi.object(htmlVideoReferenceSlotFields))
    .max(6)
    .default([]),
  editSource: htmlVideoEditSourceSchema.optional(),
  ...htmlVideoSettingFields,
}).custom((value, helpers) => {
  const unknownKey = Object.keys(value).find(
    (key) => !htmlVideoDraftKeys.has(key)
  );
  return unknownKey
    ? helpers.error("object.unknown", { child: unknownKey })
    : value;
});

export const createHtmlVideoGenerationBodySchema = htmlVideoDraftBodySchema.keys({
  idempotencyKey: Joi.string()
    .pattern(/^[a-zA-Z0-9_-]{12,100}$/)
    .required(),
});

export const htmlVideoGenerationParamsSchema = Joi.object({
  generationId: Joi.string().hex().length(24).required(),
});

export const retryHtmlVideoGenerationBodySchema = Joi.object({
  stage: Joi.string()
    .valid("planning", "visual", "voice", "validation")
    .default("validation"),
});

export const createHtmlVideoRenderBodySchema = Joi.object({
  ...htmlVideoFields,
  voiceScript: Joi.string().trim().max(8_000).allow("").optional(),
  snapshotHash: Joi.string().hex().length(64).optional(),
  pipeline: htmlVideoPipelineSchema.optional(),
  idempotencyKey: Joi.string()
    .pattern(/^[a-zA-Z0-9_-]{12,100}$/)
    .required(),
  promptHistoryId: Joi.string().hex().length(24).optional(),
  generationId: Joi.string().hex().length(24).optional(),
});

export const htmlVideoRenderParamsSchema = Joi.object({
  renderId: Joi.string().hex().length(24).required(),
});

export const htmlVideoRenderListQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).max(10_000).default(1),
  pageSize: Joi.number().integer().min(1).max(50).default(12),
  filter: Joi.string().valid("all", "active", "completed", "failed").default("all"),
});

export const createHtmlVideoPromptHistoryBodySchema = Joi.object({
  projectName: Joi.string().trim().min(1).max(180).required(),
  prompt: Joi.string().trim().min(3).max(23_000).required(),
  masterPrompt: Joi.string().trim().min(1).max(23_000).optional(),
  inferredAssumptions: Joi.object({
    requestSpecVersion: Joi.string().valid("1.0").optional(),
    mode: Joi.string().valid("create", "revision").optional(),
    contentMode: Joi.string().max(80).optional(),
    narrationLanguage: Joi.string().max(80).optional(),
    languageLock: Joi.string().max(80).optional(),
    durationPolicy: Joi.string()
      .valid("explicit", "inferred", "preserve-existing")
      .optional(),
    durationSeconds: Joi.number().integer().min(1).max(180).optional(),
    aspectRatio: Joi.string().valid("16:9", "9:16", "1:1").optional(),
    imagePolicy: Joi.string().valid("none", "embed", "reference", "mixed").optional(),
    inputImageCount: Joi.number().integer().min(0).max(6).optional(),
    sourceOrder: Joi.string().valid("preserve").optional(),
    preserveUnrequestedProperties: Joi.boolean().optional(),
  }).optional(),
  aspectRatio: Joi.string().valid("16:9", "9:16", "1:1").required(),
  referenceNames: Joi.array().items(Joi.string().trim().max(180)).max(7).default([]),
  parentHistoryId: Joi.string().hex().length(24).optional(),
});
