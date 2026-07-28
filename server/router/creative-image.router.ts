import { Router } from "express";
import Joi from "joi";
import { creativeImageController } from "../controller/creative-image.controller";
import { requireAuth, requirePermission } from "../middleware/auth";
import { validateRequest } from "../middleware/validation";

export const creativeImageRouter = Router();

const canvasSchema = Joi.object({ format: Joi.string().valid("1:1", "4:5", "9:16", "1.91:1").required(), width: Joi.number().integer().min(320).max(2048).required(), height: Joi.number().integer().min(320).max(2048).required() });
const projectSchema = Joi.object({ templateId: Joi.string().max(80).required(), canvas: canvasSchema.required(), data: Joi.object().pattern(Joi.string().max(80), Joi.string().max(500).allow("")).required() });
const updateSchema = Joi.object({ templateId: Joi.string().max(80), canvas: canvasSchema, data: Joi.object().pattern(Joi.string().max(80), Joi.string().max(500).allow("")) }).min(1);
const idSchema = Joi.object({ id: Joi.string().hex().length(24).required() });

creativeImageRouter.use(requireAuth as never, requirePermission("marketing:post") as never);
creativeImageRouter.get("/templates", creativeImageController.listTemplates as never);
creativeImageRouter.post("/projects", validateRequest({ body: projectSchema }), creativeImageController.createProject as never);
creativeImageRouter.get("/projects/:id", validateRequest({ params: idSchema }), creativeImageController.getProject as never);
creativeImageRouter.patch("/projects/:id", validateRequest({ params: idSchema, body: updateSchema }), creativeImageController.updateProject as never);
creativeImageRouter.post("/projects/:id/renders", validateRequest({ params: idSchema, body: Joi.object({ idempotencyKey: Joi.string().min(8).max(150).required() }) }), creativeImageController.createRender as never);
creativeImageRouter.get("/renders", creativeImageController.listRenders as never);
creativeImageRouter.get("/renders/:id", validateRequest({ params: idSchema }), creativeImageController.getRender as never);
