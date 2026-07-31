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
  durationSeconds: Joi.number().integer().min(1).max(60).required(),
  aspectRatio: Joi.string().valid("16:9", "9:16", "1:1").required(),
  resolution: Joi.string().valid("720p", "1080p").required(),
};

const htmlVideoFields = {
  html: byteLimitedString("HTML", false),
  css: byteLimitedString("CSS", true),
  ...htmlVideoSettingFields,
};

const htmlVideoDraftKeys = new Set([
  "prompt",
  "durationSeconds",
  "aspectRatio",
  "resolution",
]);

export const htmlVideoPreviewBodySchema = Joi.object(htmlVideoFields);

export const htmlVideoDraftBodySchema = Joi.object({
  prompt: Joi.string().trim().min(1).max(4_000).required(),
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
});

export const htmlVideoRenderParamsSchema = Joi.object({
  renderId: Joi.string().hex().length(24).required(),
});
