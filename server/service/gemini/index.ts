import { geminiChatService } from "./chat.service";
import {
  ai,
  AI_REPLY_COMMENT_MODEL,
  AI_REPLY_MESSAGE_MODEL,
  buildFaithfulVisualGuardrail,
  buildOpenRouterMessages,
  clampRegion,
  detectChatIntent,
  estimateAudioDuration,
  extractSourceBrief,
  fetchImageAsBase64,
  fetchWithRetry,
  formatHumanLikeChatReply,
  GEMINI_HEAVY_MODEL,
  GEMINI_TEXT_MODEL,
  generateText,
  getVideoDuration,
  HTML_VIDEO_MODEL,
  MAX_POSTPROCESS_IMAGE_BYTES,
  normalizeIntentText,
  pcmToWav,
  readImageBuffer,
  safeParseJson,
  Type,
} from "./core";
import { geminiImageService } from "./image.service";
import { geminiMarketingService } from "./marketing.service";
import { geminiMediaHistoryService } from "./media-history.service";
import { geminiPromptOptimizerService } from "./prompt-optimizer.service";
import { geminiVideoService } from "./video.service";
import { geminiVoiceService } from "./voice.service";

// Link circular references between marketing and media generators
geminiMarketingService.setMediaGenerators({
  imageService: geminiImageService,
  videoService: geminiVideoService,
});

export const geminiService = {
  // Video & HTML Video
  composeHtmlVideo: geminiVideoService.composeHtmlVideo.bind(geminiVideoService),
  generateVideo: geminiVideoService.generateVideo.bind(geminiVideoService),
  getPiapiTaskStatus: geminiVideoService.getPiapiTaskStatus.bind(geminiVideoService),
  getOpenRouterVideoTaskStatus: geminiVideoService.getOpenRouterVideoTaskStatus.bind(geminiVideoService),
  editVideo: geminiVideoService.editVideo.bind(geminiVideoService),
  executeLocalRenderJob: geminiVideoService.executeLocalRenderJob.bind(geminiVideoService),
  pollPiAPIVideoStatusBackground: geminiVideoService.pollPiAPIVideoStatusBackground.bind(geminiVideoService),
  pollOpenRouterVideoStatusBackground: geminiVideoService.pollOpenRouterVideoStatusBackground.bind(geminiVideoService),

  // Marketing Strategy & Generation
  conductWebResearch: geminiMarketingService.conductWebResearch.bind(geminiMarketingService),
  normalizeMarketingChannel: geminiMarketingService.normalizeMarketingChannel.bind(geminiMarketingService),
  sanitizeHashtags: geminiMarketingService.sanitizeHashtags.bind(geminiMarketingService),
  getMarketingSuggestions: geminiMarketingService.getMarketingSuggestions.bind(geminiMarketingService),
  analyzeMarketingPillars: geminiMarketingService.analyzeMarketingPillars.bind(geminiMarketingService),
  swapMarketingPillar: geminiMarketingService.swapMarketingPillar.bind(geminiMarketingService),
  generateMarketingIdeas: geminiMarketingService.generateMarketingIdeas.bind(geminiMarketingService),
  generateScheduledCampaign: geminiMarketingService.generateScheduledCampaign.bind(geminiMarketingService),
  generateCampaignCandidate: geminiMarketingService.generateCampaignCandidate.bind(geminiMarketingService),
  scoreCampaignCandidate: geminiMarketingService.scoreCampaignCandidate.bind(geminiMarketingService),
  developMarketingIdea: geminiMarketingService.developMarketingIdea.bind(geminiMarketingService),

  // Chat CRM & Auto-Reply
  chat: geminiChatService.chat.bind(geminiChatService),
  chatComment: geminiChatService.chatComment.bind(geminiChatService),
  generateFollowUpMessage: geminiChatService.generateFollowUpMessage.bind(geminiChatService),
  convertDocToFAQ: geminiChatService.convertDocToFAQ.bind(geminiChatService),

  // Image & Inpainting
  generateImage: geminiImageService.generateImage.bind(geminiImageService),
  _generateImageWithOpenRouter: geminiImageService._generateImageWithOpenRouter.bind(geminiImageService),
  compositeEditedRegion: geminiImageService.compositeEditedRegion.bind(geminiImageService),
  cropImageToRegion: geminiImageService.cropImageToRegion.bind(geminiImageService),

  // Voice & Audio
  generateVoice: geminiVoiceService.generateVoice.bind(geminiVoiceService),
  getElevenLabsVoices: geminiVoiceService.getElevenLabsVoices.bind(geminiVoiceService),
  generateCustomVoicePreview: geminiVoiceService.generateCustomVoicePreview.bind(geminiVoiceService),
  createCustomVoice: geminiVoiceService.createCustomVoice.bind(geminiVoiceService),
  addElevenLabsVoice: geminiVoiceService.addElevenLabsVoice.bind(geminiVoiceService),
  deleteElevenLabsVoice: geminiVoiceService.deleteElevenLabsVoice.bind(geminiVoiceService),

  // Prompt Optimization & Document Extraction
  optimizeScript: geminiPromptOptimizerService.optimizeScript.bind(geminiPromptOptimizerService),
  optimizeImagePrompt: geminiPromptOptimizerService.optimizeImagePrompt.bind(geminiPromptOptimizerService),
  optimizeVideoPrompt: geminiPromptOptimizerService.optimizeVideoPrompt.bind(geminiPromptOptimizerService),
  optimizeEditPrompt: geminiPromptOptimizerService.optimizeEditPrompt.bind(geminiPromptOptimizerService),
  optimizeMasterVideoPrompt: geminiPromptOptimizerService.optimizeMasterVideoPrompt.bind(geminiPromptOptimizerService),
  extractTextFromPdf: geminiPromptOptimizerService.extractTextFromPdf.bind(geminiPromptOptimizerService),

  // Media History
  getMediaHistory: geminiMediaHistoryService.getMediaHistory.bind(geminiMediaHistoryService),
  deleteMediaHistory: geminiMediaHistoryService.deleteMediaHistory.bind(geminiMediaHistoryService),
  saveGeneratedMediaRecord: geminiMediaHistoryService.saveGeneratedMediaRecord.bind(geminiMediaHistoryService),
};

export {
  ai,
  AI_REPLY_COMMENT_MODEL,
  AI_REPLY_MESSAGE_MODEL,
  buildFaithfulVisualGuardrail,
  buildOpenRouterMessages,
  clampRegion,
  detectChatIntent,
  estimateAudioDuration,
  extractSourceBrief,
  fetchImageAsBase64,
  fetchWithRetry,
  formatHumanLikeChatReply,
  GEMINI_HEAVY_MODEL,
  GEMINI_TEXT_MODEL,
  geminiChatService,
  geminiImageService,
  geminiMarketingService,
  geminiMediaHistoryService,
  geminiPromptOptimizerService,
  geminiVideoService,
  geminiVoiceService,
  generateText,
  getVideoDuration,
  HTML_VIDEO_MODEL,
  MAX_POSTPROCESS_IMAGE_BYTES,
  normalizeIntentText,
  pcmToWav,
  readImageBuffer,
  safeParseJson,
  Type,
};

export * from "./types";
