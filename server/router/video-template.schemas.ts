import Joi from "joi";

export const videoTemplateListQuerySchema = Joi.object({
  scope: Joi.string().valid("discover", "mine").default("discover"),
  category: Joi.string().trim().max(100).default("all"),
  aspectRatio: Joi.string().valid("all", "9:16", "1:1", "16:9").default("all"),
  duration: Joi.string().valid("all", "short", "medium", "long").default("all"),
  search: Joi.string().trim().max(200).allow("").default(""),
  sort: Joi.string().valid("popular", "newest").default("popular"),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(50).default(20),
});

export const useVideoTemplateBodySchema = Joi.object({
  mode: Joi.string().valid("quick", "editor").required().messages({
    "any.only": "Chế độ sử dụng mẫu không hợp lệ.",
    "any.required": "Vui lòng chọn chế độ sử dụng mẫu.",
  }),
});

export const createVideoTemplateBodySchema = Joi.object({
  title: Joi.string().trim().min(3).max(150).required(),
  description: Joi.string().trim().max(1000).allow("").default(""),
  thumbnailUrl: Joi.string().max(200000).required(),
  previewVideoUrl: Joi.string().uri().allow(""),
  duration: Joi.number().min(1).max(3600).required(),
  aspectRatio: Joi.string().valid("9:16", "1:1", "16:9").required(),
  categoryId: Joi.string().trim().min(1).max(100).required(),
  categoryName: Joi.string().trim().min(1).max(100).required(),
  tags: Joi.array().items(Joi.string().trim().max(50)).max(20).default([]),
});

export const updateVideoTemplateBodySchema = createVideoTemplateBodySchema
  .fork(
    ["title", "thumbnailUrl", "duration", "aspectRatio", "categoryId", "categoryName"],
    (schema) => schema.optional()
  )
  .min(1);

const editorTrackSchema = Joi.object({
  id: Joi.string().trim().max(100).required(),
  type: Joi.string().valid("video", "text", "audio").required(),
  name: Joi.string().trim().max(150).required(),
});

const editorItemSchema = Joi.object({
  id: Joi.string().trim().max(100).required(),
  trackId: Joi.string().trim().max(100).required(),
  type: Joi.string().valid("video", "image", "text", "audio").required(),
  start: Joi.number().min(0).max(86400).required(),
  duration: Joi.number().min(0.01).max(86400).required(),
  sourceUrl: Joi.string().max(200000).allow(""),
  thumbnailUrl: Joi.string().max(200000).allow(""),
  text: Joi.string().max(10000).allow(""),
  replaceable: Joi.boolean(),
  style: Joi.object().unknown(true),
  volume: Joi.number().min(0).max(1),
  fitMode: Joi.string().valid("cover", "fit"),
  rotation: Joi.number().min(-360).max(360),
  label: Joi.string().max(500).allow(""),
  order: Joi.number().integer().min(0).required(),
});

const editorProjectFields = {
  title: Joi.string().trim().min(1).max(150),
  description: Joi.string().max(2000).allow(""),
  categoryId: Joi.string().max(100).allow(""),
  tags: Joi.array().items(Joi.string().trim().max(50)).max(20),
  aspectRatio: Joi.string().valid("9:16", "1:1", "16:9", "3:4"),
  duration: Joi.number().min(0.01).max(86400),
  mode: Joi.string().valid("edit-project", "create-template"),
  tracks: Joi.array().items(editorTrackSchema).max(20),
  items: Joi.array().items(editorItemSchema).max(500),
  coverUrl: Joi.string().max(200000).allow(""),
};

export const createVideoProjectBodySchema = Joi.object(editorProjectFields).fork(
  ["title", "aspectRatio", "duration", "mode", "tracks", "items"],
  (schema) => schema.required()
);

export const updateVideoProjectBodySchema = Joi.object({
  ...editorProjectFields,
  expectedRevision: Joi.number().integer().min(0).required(),
}).min(2);

export const signVideoProjectMediaBodySchema = Joi.object({
  fileName: Joi.string().trim().min(1).max(255).required(),
  mimeType: Joi.string().trim().lowercase().min(3).max(100).required(),
  fileSize: Joi.number().integer().min(1).required(),
  mediaType: Joi.string().valid("video", "image", "audio").required(),
});

export const createVideoProjectRenderBodySchema = Joi.object({
  resolution: Joi.string().valid("720p", "1080p").default("1080p"),
  idempotencyKey: Joi.string().pattern(/^[a-zA-Z0-9_-]{12,100}$/).required(),
});
