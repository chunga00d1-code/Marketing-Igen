import { Router } from "express";
import Joi from "joi";
import { geminiController } from "../controller/gemini.controller";
import { validateRequest } from "../middleware/validation";
import { requireAuth } from "../middleware/auth";

export const geminiRouter = Router();

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
    }).required(),
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
    prompt: Joi.string().required(),
    aspectRatio: Joi.string().optional(),
    modelName: Joi.string().optional(),
    resolution: Joi.string().optional(),
    existingImageUris: Joi.array().items(Joi.string()).optional(),
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
    description: Joi.string().required(),
    imageUris: Joi.array().items(Joi.string()).optional(),
  }),
};

const optimizeVideoPromptSchema = {
  body: Joi.object({
    description: Joi.string().required(),
    imageUris: Joi.array().items(Joi.string()).optional(),
  }),
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
  }),
};

const syncDriveSchema = {
  body: Joi.object({
    docLink: Joi.string().required(),
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
geminiRouter.post("/marketing-develop", requireAuth as any, validateRequest(developSchema), geminiController.developMarketingIdea as any);

// Knowledge management / auto reply endpoints
geminiRouter.get("/knowledge-health", requireAuth as any, geminiController.getKnowledgeHealth as any);
geminiRouter.post("/clear-knowledge", requireAuth as any, geminiController.clearKnowledge as any);
geminiRouter.post("/test-reply", requireAuth as any, validateRequest(testReplySchema), geminiController.testReply as any);
geminiRouter.get("/ai-reply-logs", requireAuth as any, geminiController.listAIReplyLogs as any);
geminiRouter.patch("/ai-reply-logs/:id/feedback", requireAuth as any, validateRequest(feedbackSchema), geminiController.updateAIReplyFeedback as any);
geminiRouter.post("/sync-drive", requireAuth as any, validateRequest(syncDriveSchema), geminiController.syncGoogleDrive as any);
geminiRouter.post("/upload-document", requireAuth as any, validateRequest(uploadDocumentSchema), geminiController.uploadLocalDocument as any);

// Xưởng nội dung APIs (requireAuth bảo vệ tài khoản lưu lịch sử)
geminiRouter.post("/generate-image", requireAuth as any, validateRequest(generateImageSchema), geminiController.generateImage);
geminiRouter.post("/generate-video", requireAuth as any, validateRequest(generateVideoSchema), geminiController.generateVideo);
geminiRouter.post("/edit-video", requireAuth as any, validateRequest(editVideoSchema), geminiController.editVideo);
geminiRouter.post("/analyze-video-style", requireAuth as any, validateRequest(analyzeVideoStyleSchema), geminiController.analyzeVideoStyle);
geminiRouter.post("/optimize-script", requireAuth as any, validateRequest(optimizeScriptSchema), geminiController.optimizeScript);
geminiRouter.post("/optimize-prompt", requireAuth as any, validateRequest(optimizePromptSchema), geminiController.optimizeImagePrompt);
geminiRouter.post("/optimize-video-prompt", requireAuth as any, validateRequest(optimizeVideoPromptSchema), geminiController.optimizeVideoPrompt);

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

