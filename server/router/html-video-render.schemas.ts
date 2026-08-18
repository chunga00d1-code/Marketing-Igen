import Joi from "joi";

const maximumSourceBytes = 100 * 1024;

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
};

const htmlVideoReferenceSlotFields = {
  id: Joi.string().pattern(/^[a-zA-Z0-9_-]{1,80}$/).required(),
  name: Joi.string().trim().max(180).required(),
  kind: Joi.string().valid("image").required(),
  role: Joi.string().valid("background", "hero", "logo", "overlay").optional(),
  includeInVideo: Joi.boolean().default(true),
};

const htmlVideoFields = {
  html: byteLimitedString("HTML", false),
  css: byteLimitedString("CSS", true),
  assets: Joi.array().items(Joi.object(htmlVideoAssetFields)).max(6).default([]),
  ...htmlVideoSettingFields,
};

const htmlVideoDraftKeys = new Set([
  "prompt",
  "durationSeconds",
  "aspectRatio",
  "resolution",
  "promptHistoryId",
  "referenceContext",
  "referenceAssets",
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
  promptHistoryId: Joi.string().hex().length(24).optional(),
  referenceContext: Joi.string().trim().max(24_000).optional(),
  referenceAssets: Joi.array()
    .items(Joi.object(htmlVideoReferenceSlotFields))
    .max(6)
    .default([]),
  ...htmlVideoSettingFields,
}).custom((value, helpers) => {
  const unknownKey = Object.keys(value).find(
    (key) => !htmlVideoDraftKeys.has(key)
  );
  return unknownKey
    ? helpers.error("object.unknown", { child: unknownKey })
    : value;
});

export const createHtmlVideoRenderBodySchema = Joi.object({
  ...htmlVideoFields,
  idempotencyKey: Joi.string()
    .pattern(/^[a-zA-Z0-9_-]{12,100}$/)
    .required(),
  promptHistoryId: Joi.string().hex().length(24).optional(),
});

export const htmlVideoRenderParamsSchema = Joi.object({
  renderId: Joi.string().hex().length(24).required(),
});

export const createHtmlVideoPromptHistoryBodySchema = Joi.object({
  projectName: Joi.string().trim().min(1).max(180).required(),
  prompt: Joi.string().trim().min(3).max(10_000).required(),
  aspectRatio: Joi.string().valid("16:9", "9:16", "1:1").required(),
  referenceNames: Joi.array().items(Joi.string().trim().max(180)).max(6).default([]),
  parentHistoryId: Joi.string().hex().length(24).optional(),
});
