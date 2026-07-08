import { Router } from "express";
import Joi from "joi";
import { elevenlabsController } from "../controller/elevenlabs.controller";
import { requireAuth } from "../middleware/auth";
import { validateRequest } from "../middleware/validation";

export const elevenlabsRouter = Router();

const generateVoiceSchema = {
  body: Joi.object({
    textToSpeak: Joi.string().required(),
    styleInstructions: Joi.string().allow("").optional(),
    mode: Joi.string().valid("single", "multi").optional(),
    temperature: Joi.number().optional(),
    modelName: Joi.string().optional(),
    voiceName: Joi.string().optional(),
    speakerA: Joi.string().optional(),
    speakerB: Joi.string().optional(),
    title: Joi.string().allow("").optional(),
    description: Joi.string().allow("").optional(),
    stability: Joi.number().optional(),
    similarityBoost: Joi.number().optional(),
    useSpeakerBoost: Joi.boolean().optional(),
    saveToHistory: Joi.boolean().optional(),
  }),
};

const deleteHistorySchema = {
  params: Joi.object({
    id: Joi.string().regex(/^[0-9a-fA-F]{24}$/).required(),
  }),
};

const customVoicePreviewSchema = {
  body: Joi.object({
    gender: Joi.string().required(),
    accent: Joi.string().required(),
    age: Joi.string().required(),
    accentStrength: Joi.number().required(),
    text: Joi.string().required(),
  }),
};

const createCustomVoiceSchema = {
  body: Joi.object({
    voiceName: Joi.string().required(),
    voiceDescription: Joi.string().allow("").required(),
    generatedVoiceId: Joi.string().required(),
  }),
};

const addVoiceSchema = {
  body: Joi.object({
    name: Joi.string().required(),
    description: Joi.string().allow("").required(),
    files: Joi.array().items(Joi.string()).min(1).required(),
    userId: Joi.string().optional().allow(""),
  }),
};

const voiceIdParamSchema = {
  params: Joi.object({
    voiceId: Joi.string().required(),
  }),
};

const updateVoiceSettingsSchema = {
  params: Joi.object({
    voiceId: Joi.string().required(),
  }),
  body: Joi.object({
    stability: Joi.number().min(0).max(1).optional(),
    similarity_boost: Joi.number().min(0).max(1).optional(),
    style: Joi.number().min(0).max(1).optional(),
    use_speaker_boost: Joi.boolean().optional(),
  }),
};

elevenlabsRouter.post("/generate-voice", requireAuth as any, validateRequest(generateVoiceSchema), elevenlabsController.generateVoice);
elevenlabsRouter.get("/history", requireAuth as any, elevenlabsController.getVoiceHistory);
elevenlabsRouter.delete("/history/:id", requireAuth as any, validateRequest(deleteHistorySchema), elevenlabsController.deleteVoiceHistory);
elevenlabsRouter.get("/voices", requireAuth as any, elevenlabsController.getVoices);
elevenlabsRouter.get("/voices/:voiceId", requireAuth as any, validateRequest(voiceIdParamSchema), elevenlabsController.getVoice);
elevenlabsRouter.get("/voices/:voiceId/settings", requireAuth as any, validateRequest(voiceIdParamSchema), elevenlabsController.getVoiceSettings);
elevenlabsRouter.post("/voices/:voiceId/settings", requireAuth as any, validateRequest(updateVoiceSettingsSchema), elevenlabsController.updateVoiceSettings);
elevenlabsRouter.get("/models", requireAuth as any, elevenlabsController.getModels);
elevenlabsRouter.post("/custom-voice-preview", requireAuth as any, validateRequest(customVoicePreviewSchema), elevenlabsController.generateCustomVoicePreview);
elevenlabsRouter.post("/create-voice", requireAuth as any, validateRequest(createCustomVoiceSchema), elevenlabsController.createCustomVoice);
elevenlabsRouter.post("/voices/add", requireAuth as any, validateRequest(addVoiceSchema), elevenlabsController.addVoice);
elevenlabsRouter.delete("/voices/:voiceId", requireAuth as any, elevenlabsController.deleteVoice);
