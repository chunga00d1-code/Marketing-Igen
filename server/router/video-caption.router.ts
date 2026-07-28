import { Router } from "express";
import Joi from "joi";
import {
  VIDEO_CAPTION_LANES,
  VIDEO_CAPTION_MODES,
  VIDEO_CAPTION_PROJECT_STATUSES,
  VIDEO_CAPTION_SOURCE_KINDS,
  VIDEO_CAPTION_SOURCE_REFERENCE_KINDS,
  VIDEO_CAPTION_TRANSCRIPTION_LANGUAGES,
} from "../../shared/video-caption.contract";
import { videoCaptionController } from "../controller/video-caption.controller";
import { requireAuth, requirePermission } from "../middleware/auth";
import { validateRequest } from "../middleware/validation";

export const videoCaptionRouter = Router();

const objectId = Joi.string().hex().length(24);
const hexColor = Joi.string().pattern(/^#[0-9a-f]{6}$/i);
const idParams = {
  params: Joi.object({ id: objectId.required() }),
};

const styleSchema = Joi.object({
  preset: Joi.string()
    .valid("classic", "clean", "highlight", "custom")
    .optional(),
  fontFamily: Joi.string().trim().min(1).max(100).optional(),
  fontSize: Joi.number().min(12).max(180).optional(),
  fontWeight: Joi.number()
    .valid(400, 500, 600, 700, 800, 900)
    .optional(),
  textColor: hexColor.optional(),
  backgroundColor: hexColor.optional(),
  backgroundOpacity: Joi.number().min(0).max(1).optional(),
  position: Joi.string()
    .valid("top", "center", "bottom", "safe_auto")
    .optional(),
  textAlign: Joi.string().valid("left", "center", "right").optional(),
  maxLines: Joi.number().valid(1, 2).optional(),
  safeAreaPercent: Joi.number().min(0).max(30).optional(),
});

const contextLinksSchema = Joi.object({
  marketingContentId: objectId.optional(),
  campaignId: objectId.optional(),
  campaignSlotId: objectId.optional(),
});

const createSchema = {
  body: Joi.object({
    companyCode: Joi.string().trim().max(50).optional(),
    name: Joi.string().trim().min(1).max(150).required(),
    mode: Joi.string()
      .valid(...VIDEO_CAPTION_MODES)
      .required(),
    source: Joi.object({
      kind: Joi.string()
        .valid(...VIDEO_CAPTION_SOURCE_KINDS)
        .required(),
      url: Joi.string()
        .uri({ scheme: ["https"] })
        .max(4000)
        .required(),
      mediaId: Joi.string().max(100).optional(),
      originalName: Joi.string().trim().max(255).optional(),
    }).required(),
    language: Joi.string()
      .valid(...VIDEO_CAPTION_TRANSCRIPTION_LANGUAGES)
      .default("vi"),
    contextLinks: contextLinksSchema.optional(),
    contextBrief: Joi.string().trim().max(2000).allow("").optional(),
    style: styleSchema.optional(),
    autoAnalyze: Joi.boolean().default(true),
    idempotencyKey: Joi.string()
      .trim()
      .pattern(/^[a-zA-Z0-9:_-]+$/)
      .min(8)
      .max(180)
      .required(),
  }),
};

const listSchema = {
  query: Joi.object({
    companyCode: Joi.string().trim().max(50).optional(),
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
    status: Joi.string()
      .valid(...VIDEO_CAPTION_PROJECT_STATUSES)
      .optional(),
    mode: Joi.string()
      .valid(...VIDEO_CAPTION_MODES)
      .optional(),
  }),
};

const updateSchema = {
  params: idParams.params,
  body: Joi.object({
    name: Joi.string().trim().min(1).max(150).optional(),
    mode: Joi.string()
      .valid(...VIDEO_CAPTION_MODES)
      .optional(),
    contextLinks: contextLinksSchema.optional(),
    contextBrief: Joi.string().trim().max(2000).allow("").optional(),
    style: styleSchema.optional(),
  }).min(1),
};

const sourceReferenceSchema = Joi.object({
  kind: Joi.string()
    .valid(...VIDEO_CAPTION_SOURCE_REFERENCE_KINDS)
    .required(),
  sourceId: Joi.string().max(100).optional(),
  documentId: Joi.string().max(100).optional(),
  chunkId: Joi.string().max(100).optional(),
  title: Joi.string().max(200).optional(),
  version: Joi.string().max(100).optional(),
  excerpt: Joi.string().max(500).optional(),
});

const replaceSegmentsSchema = {
  params: idParams.params,
  body: Joi.object({
    expectedVersion: Joi.number().integer().min(1).required(),
    segments: Joi.array()
      .items(
        Joi.object({
          lane: Joi.string()
            .valid(...VIDEO_CAPTION_LANES)
            .required(),
          startMs: Joi.number().integer().min(0).required(),
          endMs: Joi.number().integer().min(1).required(),
          text: Joi.string().trim().min(1).max(500).required(),
          sceneId: Joi.string().max(100).optional(),
          confidence: Joi.number().min(0).max(1).optional(),
          sourceReferences: Joi.array()
            .items(sourceReferenceSchema)
            .max(20)
            .default([]),
          styleOverride: styleSchema.optional(),
          lockedByUser: Joi.boolean().default(false),
          sortOrder: Joi.number().integer().min(0).optional(),
        })
      )
      .max(1000)
      .required(),
  }),
};

videoCaptionRouter.use(
  requireAuth as never,
  requirePermission("marketing:post") as never
);
videoCaptionRouter.post(
  "/",
  validateRequest(createSchema),
  videoCaptionController.create as never
);
videoCaptionRouter.get(
  "/",
  validateRequest(listSchema),
  videoCaptionController.list as never
);
videoCaptionRouter.get(
  "/context-options",
  videoCaptionController.contextOptions as never
);
videoCaptionRouter.get(
  "/:id",
  validateRequest(idParams),
  videoCaptionController.detail as never
);
videoCaptionRouter.patch(
  "/:id",
  validateRequest(updateSchema),
  videoCaptionController.update as never
);
videoCaptionRouter.post(
  "/:id/analyze",
  validateRequest(idParams),
  videoCaptionController.analyze as never
);
videoCaptionRouter.post(
  "/:id/transcribe",
  validateRequest(idParams),
  videoCaptionController.transcribe as never
);
videoCaptionRouter.post(
  "/:id/generate-context",
  validateRequest(idParams),
  videoCaptionController.generateContext as never
);
videoCaptionRouter.post(
  "/:id/render",
  validateRequest({
    params: idParams.params,
    body: Joi.object({
      preview: Joi.boolean().default(false),
    }),
  }),
  videoCaptionController.render as never
);
videoCaptionRouter.get(
  "/:id/subtitles/:format",
  validateRequest({
    params: Joi.object({
      id: objectId.required(),
      format: Joi.string().valid("srt", "vtt").required(),
    }),
  }),
  videoCaptionController.downloadSubtitles as never
);
videoCaptionRouter.get(
  "/:id/download",
  validateRequest(idParams),
  videoCaptionController.downloadRenderedVideo as never
);
videoCaptionRouter.post(
  "/:id/cancel",
  validateRequest(idParams),
  videoCaptionController.cancel as never
);
videoCaptionRouter.post(
  "/:id/retry",
  validateRequest(idParams),
  videoCaptionController.retry as never
);
videoCaptionRouter.get(
  "/:id/jobs",
  validateRequest(idParams),
  videoCaptionController.jobs as never
);
videoCaptionRouter.put(
  "/:id/segments",
  validateRequest(replaceSegmentsSchema),
  videoCaptionController.replaceSegments as never
);
videoCaptionRouter.post(
  "/resolve-drive-folder",
  validateRequest({
    body: Joi.object({
      url: Joi.string().uri({ scheme: ["https"] }).required(),
    }),
  }),
  videoCaptionController.resolveDriveFolder as never
);
