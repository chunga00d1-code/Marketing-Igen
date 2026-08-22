/* eslint-disable @typescript-eslint/no-explicit-any */
import { Router } from "express";
import Joi from "joi";
import { geminiController } from "../controller/gemini.controller";
import { validateRequest } from "../middleware/validation";
import { requireAuth, requireRole } from "../middleware/auth";

export const geminiRouter = Router();
const requireKnowledgeManager = requireRole([
  "superadmin",
  "admin",
  "manager",
]);

// Định nghĩa schemas xác thực dữ liệu Joi
const chatSchema = {
  body: Joi.object({
    message: Joi.string().required(),
    history: Joi.array()
      .items(
        Joi.object({
          sender: Joi.string().valid("user", "ai", "agent").required(),
          text: Joi.string().required(),
        })
      )
      .required(),
    aiConfig: Joi.object({
      enabled: Joi.boolean().required(),
      autoClassify: Joi.boolean().required(),
      autoCloseDeal: Joi.boolean().required(),
      autoFeedback: Joi.boolean().required(),
      replyDelay: Joi.number().required(),
      advancedInstructions: Joi.string().allow(""),
      trainingKnowledge: Joi.string().allow(""),
      model: Joi.string().allow("").optional(),
      autoFollowUpEnabled: Joi.boolean().optional(),
      followUpDelayHours: Joi.number().min(1).max(72).optional(),
      followUpPrompt: Joi.string().allow("").optional(),
    }).required(),
  }),
};

const _htmlVideoComposeSchema = {
  body: Joi.object({
    // HTML video prompts may contain grounded excerpts from several uploaded
    // documents. Keep a bounded request size, but do not reject normal
    // multi-document prompts at the old 20k limit.
    prompt: Joi.string().trim().min(3).max(100_000).required(),
    systemInstruction: Joi.string().trim().min(3).max(20_000).required(),
  }),
};

const pillarsSchema = {
  body: Joi.object({
    campaignTopic: Joi.string().required(),
    images: Joi.array().items(Joi.string()).optional(),
  }),
};

const swapPillarSchema = {
  body: Joi.object({
    campaignTopic: Joi.string().required(),
    currentPillars: Joi.array().items(Joi.any()).required(),
    pillarIdToReplace: Joi.string().required(),
    images: Joi.array().items(Joi.string()).optional(),
  }),
};

const ideasSchema = {
  body: Joi.object({
    campaignTopic: Joi.string().required(),
    selectedPillars: Joi.array().items(Joi.string()).required(),
    channels: Joi.array().items(Joi.string()).optional(),
    mediaType: Joi.string().valid("image", "video", "human-video", "none").optional(),
    images: Joi.array().items(Joi.string()).optional(),
  }),
};

const scheduledCampaignSchema = {
  body: Joi.object({
    prompt: Joi.string().trim().min(3).required(),
    startDate: Joi.string().isoDate().required(),
    endDate: Joi.string().isoDate().required(),
    postsPerDay: Joi.number().integer().min(1).max(5).required(),
    postingTimes: Joi.array().items(Joi.string().pattern(/^([01]\d|2[0-3]):[0-5]\d$/)).min(1).max(5).required(),
    channels: Joi.array().items(Joi.string().valid("Facebook", "TikTok")).min(1).required(),
  }),
};

const developSchema = {
  body: Joi.object({
    title: Joi.string().required(),
    summary: Joi.string().required(),
    suggestedContent: Joi.string().required(),
    channels: Joi.array().items(Joi.string()).required(),
    mediaType: Joi.string().valid("image", "video", "human-video", "none").optional(),
    imageModel: Joi.string().optional().allow(""),
    imageResolution: Joi.string().optional().allow(""),
    imageAspectRatio: Joi.string().optional().allow(""),
    videoModel: Joi.string().optional().allow(""),
    videoQuality: Joi.string().optional().allow(""),
    videoDuration: Joi.alternatives().try(Joi.number(), Joi.string().allow("")).optional(),
    videoAspectRatio: Joi.string().optional().allow(""),
    mediaPrompt: Joi.string().optional().allow(""),
    humanVoiceId: Joi.string().optional().allow(""),
    humanVoiceModel: Joi.string().optional().allow(""),
    humanDurationSeconds: Joi.alternatives().try(Joi.number(), Joi.string().allow("")).optional(),
  }),
};

const generateImageSchema = {
  body: Joi.object({
    prompt: Joi.string().trim().min(1).max(20_000).required(),
    aspectRatio: Joi.string().optional(),
    modelName: Joi.string().valid(
      "gemini-banana-flash",
      "gemini-banana-pro",
      "google/gemini-3.1-flash-image",
      "google/gemini-3-pro-image"
    ).optional(),
    resolution: Joi.string().optional(),
    negativePrompt: Joi.string().optional().allow(""),
    existingImageUris: Joi.array().items(Joi.string().max(2_000_000)).max(3).optional(),
  }),
};

const normalizedImageRegionSchema = Joi.object({
  x: Joi.number().min(0).max(1).required(),
  y: Joi.number().min(0).max(1).required(),
  width: Joi.number().greater(0).max(1).required(),
  height: Joi.number().greater(0).max(1).required(),
}).custom((value, helpers) => {
  if (value.x + value.width > 1 || value.y + value.height > 1) {
    return helpers.error("any.invalid");
  }
  return value;
}).messages({ "any.invalid": "Vùng chọn phải nằm hoàn toàn trong ảnh." });

const editImageSchema = {
  body: Joi.object({
    sourceImageUrl: Joi.string().max(2_000_000).required(),
    sourceMediaId: Joi.string().regex(/^[0-9a-fA-F]{24}$/).optional().messages({
      "string.pattern.base": "Mã ảnh nguồn phải là định dạng MongoDB ObjectId hợp lệ.",
    }),
    annotationImageUrl: Joi.string().max(2_000_000).optional(),
    requestId: Joi.string().trim().max(100).optional(),
    instruction: Joi.string().trim().min(2).max(4_000).required(),
    regionNote: Joi.string().trim().max(2_000).allow("").optional(),
    region: normalizedImageRegionSchema.optional(),
    crop: normalizedImageRegionSchema.optional(),
    strokes: Joi.array().items(
      Joi.object({
        color: Joi.string().max(32).optional(),
        width: Joi.number().min(0).max(1).optional(),
        points: Joi.array().items(
          Joi.object({ x: Joi.number().min(0).max(1).required(), y: Joi.number().min(0).max(1).required() })
        ).min(1).max(500).required(),
      })
    ).max(20).optional(),
    supportingImageUris: Joi.array().items(Joi.string().max(2_000_000)).max(2).optional(),
    aspectRatio: Joi.string().optional(),
    modelName: Joi.string().valid(
      "gemini-banana-flash",
      "gemini-banana-pro",
      "google/gemini-3.1-flash-image",
      "google/gemini-3-pro-image"
    ).optional(),
    resolution: Joi.string().optional(),
    preserveOutsideRegion: Joi.boolean().default(true),
  }),
};

const generateVideoSchema = {
  body: Joi.object({
    prompt: Joi.string().required(),
    durationSeconds: Joi.number().optional(),
    aspectRatio: Joi.string().optional(),
    modelName: Joi.string().optional(),
    resolution: Joi.string().optional(),
    frameMode: Joi.string().valid("standard", "first_last").optional(),
    referenceVideoUri: Joi.string().allow("").optional(),
    referenceImageUris: Joi.array().items(Joi.string()).optional(),
    activeCardId: Joi.string().allow("").optional(),
  }),
};

const editVideoSchema = {
  body: Joi.object({
    videoUrl: Joi.string().required(),
    prompt: Joi.string().allow("").optional(),
    modelName: Joi.string().optional().allow(""),
    aspectRatio: Joi.string().optional().allow(""),
    resolution: Joi.string().optional().allow(""),
    duration: Joi.number().optional(),
    videoDurations: Joi.array().items(Joi.number()).optional(),
    blueprint: Joi.object().optional(),
    renderMode: Joi.string().valid("local", "hermes").optional().allow(""),
    renderEngine: Joi.string().valid("remotion", "hyperframe", "hermes", "professional").optional().allow(""),
    referenceVideoUrl: Joi.string().uri().optional().allow(""),
    referenceVideoDuration: Joi.number().optional(),
    // Professional mode
    outline: Joi.string().allow("").optional(),
    scenes: Joi.array().items(Joi.string()).optional(),
    brandName: Joi.string().allow("").optional(),
    bgMusicUrl: Joi.string().uri().optional().allow(""),
  }),
};

const analyzeVideoStyleSchema = {
  body: Joi.object({
    videoUrl: Joi.string().uri().required().messages({
      "any.required": "Đường dẫn video cần phân tích là bắt buộc.",
      "string.uri": "Đường dẫn video phải là URL hợp lệ."
    }),
    duration: Joi.number().optional().messages({
      "number.base": "Thời lượng video phải là số."
    }),
    targetVideoUrl: Joi.string().uri().optional().allow("").messages({
      "string.uri": "Đường dẫn video đầu vào phải là URL hợp lệ."
    }),
    targetDuration: Joi.number().optional().messages({
      "number.base": "Thời lượng video đầu vào phải là số."
    }),
    prompt: Joi.string().optional().allow("").messages({
      "string.base": "Ý tưởng của người dùng phải là chuỗi."
    }),
  }),
};

const optimizeScriptSchema = {
  body: Joi.object({
    text: Joi.string().required(),
    readingStyle: Joi.string().allow("").optional(),
    model: Joi.string().allow("").optional(),
  }),
};

const optimizePromptSchema = {
  body: Joi.object({
    description: Joi.string().trim().min(1).max(30_000).required(),
    imageUris: Joi.array().items(Joi.string().max(2_000_000)).max(3).optional(),
    modelName: Joi.string().max(100).optional(),
  }),
};

const optimizeVideoPromptSchema = {
  body: Joi.object({
    description: Joi.string().required(),
    imageUris: Joi.array().items(Joi.string()).optional(),
  }),
};

const optimizeMasterPromptSchema = {
  body: Joi.object({
    prompt: Joi.string().trim().min(1).max(30_000).optional(),
    description: Joi.string().trim().min(1).max(30_000).optional(),
    context: Joi.string().allow("").max(30_000).optional(),
    imageUris: Joi.array().items(Joi.string().max(2_000_000)).max(6).optional(),
    durationSeconds: Joi.number().integer().min(1).max(180).optional(),
    aspectRatio: Joi.string().valid("9:16", "1:1", "16:9").optional(),
    mode: Joi.string().valid("create", "revision").optional(),
  }).or("prompt", "description"),
};

const getHistorySchema = {
  query: Joi.object({
    type: Joi.string().valid("image", "video", "voice").required(),
  }),
};

const deleteHistorySchema = {
  params: Joi.object({
    id: Joi.string().regex(/^[0-9a-fA-F]{24}$/).required().messages({
      "string.pattern.base": "Mã ID lịch sử phải là định dạng MongoDB ObjectId hợp lệ."
    }),
  }),
};

const uploadDocumentSchema = {
  body: Joi.object({
    fileName: Joi.string().required(),
    fileBase64: Joi.string().required(),
    mimeType: Joi.string().required(),
    channelScope: Joi.array()
      .items(Joi.string().valid("facebook", "zalo", "tiktok", "all"))
      .min(1)
      .optional(),
    purposeScope: Joi.array()
      .items(
        Joi.string().valid(
          "sales",
          "support",
          "marketing",
          "caption",
          "all"
        )
      )
      .min(1)
      .optional(),
  }),
};

const syncDriveSchema = {
  body: Joi.object({
    docLink: Joi.string().required(),
    channelScope: Joi.array()
      .items(Joi.string().valid("facebook", "zalo", "tiktok", "all"))
      .min(1)
      .optional(),
    purposeScope: Joi.array()
      .items(
        Joi.string().valid(
          "sales",
          "support",
          "marketing",
          "caption",
          "all"
        )
      )
      .min(1)
      .optional(),
  }),
};

const testReplySchema = {
  body: Joi.object({
    message: Joi.string().required(),
    aiConfig: Joi.object().optional(),
  }),
};

const feedbackSchema = {
  params: Joi.object({
    id: Joi.string().regex(/^[0-9a-fA-F]{24}$/).required(),
  }),
  body: Joi.object({
    feedback: Joi.string().valid("good", "bad", "needs_fix").required(),
    note: Joi.string().optional().allow(""),
  }),
};

// Đăng ký định tuyến API kèm Joi validation
geminiRouter.post("/chat", requireAuth as any, validateRequest(chatSchema), geminiController.chat as any);
geminiRouter.get("/marketing-suggestions", requireAuth as any, geminiController.getMarketingSuggestions as any);
geminiRouter.post("/marketing-pillars", requireAuth as any, validateRequest(pillarsSchema), geminiController.analyzeMarketingPillars as any);
geminiRouter.post("/marketing-pillars/swap", requireAuth as any, validateRequest(swapPillarSchema), geminiController.swapMarketingPillar as any);
geminiRouter.post("/marketing-ideas", requireAuth as any, validateRequest(ideasSchema), geminiController.generateMarketingIdeas as any);
geminiRouter.post("/scheduled-campaign", requireAuth as any, validateRequest(scheduledCampaignSchema), geminiController.generateScheduledCampaign as any);
geminiRouter.post("/marketing-develop", requireAuth as any, validateRequest(developSchema), geminiController.developMarketingIdea as any);

// Knowledge management / auto reply endpoints
geminiRouter.get("/knowledge-health", requireAuth as any, geminiController.getKnowledgeHealth as any);
geminiRouter.post("/clear-knowledge", requireAuth as any, requireKnowledgeManager as any, geminiController.clearKnowledge as any);
geminiRouter.post("/test-reply", requireAuth as any, validateRequest(testReplySchema), geminiController.testReply as any);
geminiRouter.get("/ai-reply-logs", requireAuth as any, geminiController.listAIReplyLogs as any);
geminiRouter.patch("/ai-reply-logs/:id/feedback", requireAuth as any, validateRequest(feedbackSchema), geminiController.updateAIReplyFeedback as any);
geminiRouter.post("/sync-drive", requireAuth as any, requireKnowledgeManager as any, validateRequest(syncDriveSchema), geminiController.syncGoogleDrive as any);
geminiRouter.post("/upload-document", requireAuth as any, requireKnowledgeManager as any, validateRequest(uploadDocumentSchema), geminiController.uploadLocalDocument as any);

// Xưởng nội dung APIs (requireAuth bảo vệ tài khoản lưu lịch sử)
geminiRouter.post("/generate-image", requireAuth as any, validateRequest(generateImageSchema), geminiController.generateImage);
geminiRouter.post("/edit-image", requireAuth as any, validateRequest(editImageSchema), geminiController.editImage);
geminiRouter.post("/generate-video", requireAuth as any, validateRequest(generateVideoSchema), geminiController.generateVideo);
geminiRouter.post("/edit-video", requireAuth as any, validateRequest(editVideoSchema), geminiController.editVideo);
geminiRouter.post("/analyze-video-style", requireAuth as any, validateRequest(analyzeVideoStyleSchema), geminiController.analyzeVideoStyle);
geminiRouter.post("/optimize-script", requireAuth as any, validateRequest(optimizeScriptSchema), geminiController.optimizeScript);
geminiRouter.post("/optimize-prompt", requireAuth as any, validateRequest(optimizePromptSchema), geminiController.optimizeImagePrompt);
geminiRouter.post("/optimize-video-prompt", requireAuth as any, validateRequest(optimizeVideoPromptSchema), geminiController.optimizeVideoPrompt);
geminiRouter.post("/optimize-master-prompt", requireAuth as any, validateRequest(optimizeMasterPromptSchema), geminiController.optimizeMasterVideoPrompt);

// Edit Script endpoints
geminiRouter.post(
  "/generate-edit-script",
  requireAuth as any,
  validateRequest({
    body: Joi.object({
      videoUrl: Joi.string().uri().required(),
      duration: Joi.number().optional(),
      prompt: Joi.string().allow("").optional(),
    }),
  }),
  geminiController.generateEditScript as any
);

geminiRouter.post(
  "/render-from-edit-script",
  requireAuth as any,
  validateRequest({
    body: Joi.object({
      script: Joi.object().required(),
      aspectRatio: Joi.string().optional().allow(""),
      resolution: Joi.string().optional().allow(""),
    }),
  }),
  geminiController.renderFromEditScript as any
);

// Tối ưu prompt CHỈNH SỬA video (Remotion) - khác với optimize-video-prompt dành cho sinh video mới
const optimizeEditPromptSchema = {
  body: Joi.object({
    description: Joi.string().required(),
  }),
};
geminiRouter.post("/optimize-edit-prompt", requireAuth as any, validateRequest(optimizeEditPromptSchema), geminiController.optimizeEditPrompt);
geminiRouter.get("/media-history", requireAuth as any, validateRequest(getHistorySchema), geminiController.getMediaHistory);
geminiRouter.delete("/media-history/:id", requireAuth as any, validateRequest(deleteHistorySchema), geminiController.deleteMediaHistory);

const hermesWebhookSchema = {
  query: Joi.object({
    recordId: Joi.string().regex(/^[0-9a-fA-F]{24}$/).optional().messages({
      "string.pattern.base": "Mã ID bản ghi phải là định dạng MongoDB ObjectId hợp lệ."
    })
  }),
  body: Joi.object({
    session_id: Joi.string().allow("").optional(),
    message: Joi.string().allow("").optional(),
    response: Joi.string().allow("").optional(),
    output: Joi.string().allow("").optional(),
    status: Joi.string().allow("").optional(),
    error: Joi.string().allow("").optional()
  }).unknown(true)
};

geminiRouter.post("/hermes-webhook", validateRequest(hermesWebhookSchema), geminiController.hermesWebhook);
