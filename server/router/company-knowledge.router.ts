import { Router } from "express";
import Joi from "joi";
import { companyKnowledgeController } from "../controller/company-knowledge.controller";
import { geminiController } from "../controller/gemini.controller";
import { requireAuth, requireRole } from "../middleware/auth";
import { validateRequest } from "../middleware/validation";

export const companyKnowledgeRouter = Router();

const managerOnly = requireRole(["superadmin", "admin", "manager"]);
const pageScope = Joi.string().valid("all", "selected");
const pageIds = Joi.array().items(Joi.string().trim().min(1)).max(100);
const documentType = Joi.string().valid(
  "company_profile", "product", "service", "policy", "pricing", "faq", "brand_guideline", "general"
);
const scopeSchema = {
  body: Joi.object({
    channelScope: Joi.array()
      .items(Joi.string().valid("facebook", "zalo", "tiktok", "all"))
      .min(1)
      .required(),
    pageScope: pageScope.optional(),
    pageIds: pageIds.when("pageScope", {
      is: "selected",
      then: Joi.array().items(Joi.string().trim().min(1)).min(1).max(100).required(),
      otherwise: Joi.array().items(Joi.string()).max(0).optional(),
    }),
    documentType: documentType.optional(),
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
      .required(),
  }),
  params: Joi.object({
    id: Joi.string()
      .pattern(/^[0-9a-fA-F]{24}$/)
      .required(),
  }),
};
const idSchema = {
  params: Joi.object({
    id: Joi.string()
      .pattern(/^[0-9a-fA-F]{24}$/)
      .required(),
  }),
};
const uploadSchema = {
  body: Joi.object({
    fileName: Joi.string().required(),
    fileBase64: Joi.string().required(),
    mimeType: Joi.string().required(),
    channelScope: scopeSchema.body.extract("channelScope").optional(),
    purposeScope: scopeSchema.body.extract("purposeScope").optional(),
    pageScope: pageScope.optional(),
    pageIds: pageIds.optional(),
    documentType: documentType.optional(),
  }),
};
const syncSchema = {
  body: Joi.object({
    docLink: Joi.string().required(),
    channelScope: scopeSchema.body.extract("channelScope").optional(),
    purposeScope: scopeSchema.body.extract("purposeScope").optional(),
    pageScope: pageScope.optional(),
    pageIds: pageIds.optional(),
    documentType: documentType.optional(),
  }),
};

companyKnowledgeRouter.use(requireAuth as never);
companyKnowledgeRouter.get(
  "/health",
  geminiController.getKnowledgeHealth as never
);
companyKnowledgeRouter.get(
  "/documents",
  companyKnowledgeController.listDocuments as never
);
companyKnowledgeRouter.post(
  "/documents/upload",
  managerOnly as never,
  validateRequest(uploadSchema),
  geminiController.uploadLocalDocument as never
);
companyKnowledgeRouter.post(
  "/sync-drive",
  managerOnly as never,
  validateRequest(syncSchema),
  geminiController.syncGoogleDrive as never
);
companyKnowledgeRouter.patch(
  "/documents/:id/scopes",
  managerOnly as never,
  validateRequest(scopeSchema),
  companyKnowledgeController.updateScopes as never
);
companyKnowledgeRouter.delete(
  "/documents/:id",
  managerOnly as never,
  validateRequest(idSchema),
  companyKnowledgeController.deleteDocument as never
);
