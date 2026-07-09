/* eslint-disable @typescript-eslint/no-explicit-any */
import { Router } from "express";
import Joi from "joi";
import { crudController } from "../controller/crud.controller";
import { validateRequest } from "../middleware/validation";
import { requireAuth } from "../middleware/auth";

export const crudRouter = Router();

const SUPPORTED_MODELS = [
  "products",
  "categories",
  "crm-tickets",
  "marketing-contents",
  "social-integrations",
  "users",
];

const listSchema = {
  params: Joi.object({
    modelName: Joi.string().valid(...SUPPORTED_MODELS).required(),
  }),
  query: Joi.object({
    page: Joi.number().integer().min(1).optional(),
    limit: Joi.number().integer().min(1).optional(),
    sort: Joi.string().optional(),
    search: Joi.string().optional().allow(""),
  }).unknown(true),
};

const getByIdSchema = {
  params: Joi.object({
    modelName: Joi.string().valid(...SUPPORTED_MODELS).required(),
    id: Joi.string().regex(/^[0-9a-fA-F]{24}$/).required(),
  }),
};

const createSchema = {
  params: Joi.object({
    modelName: Joi.string().valid(...SUPPORTED_MODELS).required(),
  }),
  body: Joi.object().required(),
};

const updateSchema = {
  params: Joi.object({
    modelName: Joi.string().valid(...SUPPORTED_MODELS).required(),
    id: Joi.string().regex(/^[0-9a-fA-F]{24}$/).required(),
  }),
  body: Joi.object().required(),
};

const deleteSchema = {
  params: Joi.object({
    modelName: Joi.string().valid(...SUPPORTED_MODELS).required(),
    id: Joi.string().regex(/^[0-9a-fA-F]{24}$/).required(),
  }),
};

crudRouter.get("/:modelName", requireAuth as any, validateRequest(listSchema), crudController.getList as any);
crudRouter.get("/:modelName/:id", requireAuth as any, validateRequest(getByIdSchema), crudController.getById as any);
crudRouter.post("/:modelName", requireAuth as any, validateRequest(createSchema), crudController.create as any);
crudRouter.patch("/:modelName/:id", requireAuth as any, validateRequest(updateSchema), crudController.update as any);
crudRouter.delete("/:modelName/:id", requireAuth as any, validateRequest(deleteSchema), crudController.delete as any);
