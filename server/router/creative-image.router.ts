import { Router } from "express";
import Joi from "joi";
import { creativeImageController } from "../controller/creative-image.controller";
import { requireAuth, requirePermission } from "../middleware/auth";
import { validateRequest } from "../middleware/validation";

export const creativeImageRouter = Router();

const canvasSchema = Joi.object({ format: Joi.string().valid("1:1", "4:5", "9:16", "1.91:1").required(), width: Joi.number().integer().min(320).max(2048).required(), height: Joi.number().integer().min(320).max(2048).required() });
const projectSchema = Joi.object({ templateId: Joi.string().max(80).required(), canvas: canvasSchema.required(), data: Joi.object().pattern(Joi.string().max(80), Joi.string().max(500).allow("")).required() });
const aiHtmlAttachmentSchema = Joi.object({
  type: Joi.string().valid("image", "document").required(),
  name: Joi.string().trim().max(200).required(),
  url: Joi.string().uri({ scheme: ["https"] }).max(2_000).when("type", { is: "image", then: Joi.required(), otherwise: Joi.optional().allow("") }),
  text: Joi.string().max(20_000).when("type", { is: "document", then: Joi.required(), otherwise: Joi.optional().allow("") }),
}).unknown(false);
const aiHtmlAttachmentsSchema = Joi.array().items(aiHtmlAttachmentSchema).max(4).default([]);
const aiHtmlProjectSchema = Joi.object({ canvas: canvasSchema.required(), prompt: Joi.string().trim().min(10).max(4_000).required(), attachments: aiHtmlAttachmentsSchema });
const aiHtmlMessageSchema = Joi.object({ message: Joi.string().trim().min(2).max(4_000).required(), attachments: aiHtmlAttachmentsSchema });
const updateSchema = Joi.object({ templateId: Joi.string().max(80), canvas: canvasSchema, data: Joi.object().pattern(Joi.string().max(80), Joi.string().max(500).allow("")) }).min(1);
const idSchema = Joi.object({ id: Joi.string().hex().length(24).required() });

creativeImageRouter.use(requireAuth as never, requirePermission("marketing:post") as never);
creativeImageRouter.get("/templates", creativeImageController.listTemplates as never);
creativeImageRouter.post("/projects", validateRequest({ body: projectSchema }), creativeImageController.createProject as never);
creativeImageRouter.post("/ai-html/projects", validateRequest({ body: aiHtmlProjectSchema }), creativeImageController.createAiHtmlProject as never);
creativeImageRouter.post("/ai-html/projects/:id/messages", validateRequest({ params: idSchema, body: aiHtmlMessageSchema }), creativeImageController.sendAiHtmlMessage as never);
creativeImageRouter.get("/projects/:id", validateRequest({ params: idSchema }), creativeImageController.getProject as never);
creativeImageRouter.get("/ai-html/projects", creativeImageController.listAiHtmlProjects as never);
creativeImageRouter.patch("/projects/:id", validateRequest({ params: idSchema, body: updateSchema }), creativeImageController.updateProject as never);
creativeImageRouter.post("/projects/:id/renders", validateRequest({ params: idSchema, body: Joi.object({ idempotencyKey: Joi.string().min(8).max(150).required() }) }), creativeImageController.createRender as never);
creativeImageRouter.get("/renders", creativeImageController.listRenders as never);
creativeImageRouter.get("/renders/:id", validateRequest({ params: idSchema }), creativeImageController.getRender as never);
