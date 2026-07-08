import { Router } from "express";
import Joi from "joi";
import { permissionController } from "../controller/permission.controller";
import { requireAuth, requireRole } from "../middleware/auth";
import { validateRequest } from "../middleware/validation";

export const permissionRouter = Router();

const createPermissionSchema = {
  body: Joi.object({
    code: Joi.string().required().messages({
      "any.required": "Mã quyền là bắt buộc.",
      "string.empty": "Mã quyền không được để trống.",
    }),
    name: Joi.string().required().messages({
      "any.required": "Tên mã quyền là bắt buộc.",
      "string.empty": "Tên mã quyền không được để trống.",
    }),
    module: Joi.string().required().messages({
      "any.required": "Module quyền là bắt buộc.",
      "string.empty": "Module quyền không được để trống.",
    }),
    description: Joi.string().optional().allow(""),
  }),
};

const updatePermissionSchema = {
  params: Joi.object({
    code: Joi.string().required().messages({
      "any.required": "Mã quyền trong params là bắt buộc.",
    }),
  }),
  body: Joi.object({
    name: Joi.string().optional().messages({
      "string.empty": "Tên mã quyền không được để trống.",
    }),
    module: Joi.string().optional().messages({
      "string.empty": "Module quyền không được để trống.",
    }),
    description: Joi.string().optional().allow(""),
  }),
};

const permissionCodeParamsSchema = {
  params: Joi.object({
    code: Joi.string().required().messages({
      "any.required": "Mã quyền trong params là bắt buộc.",
    }),
  }),
};

const getPermissionsQuerySchema = {
  query: Joi.object({
    page: Joi.number().integer().min(1).optional(),
    limit: Joi.number().integer().min(1).optional(),
    module: Joi.string().optional(),
    search: Joi.string().optional().allow(""),
  }),
};

// 1. Tạo mới mã quyền (chỉ dành cho superadmin)
permissionRouter.post(
  "/",
  requireAuth as any,
  requireRole(["superadmin"]) as any,
  validateRequest(createPermissionSchema),
  permissionController.create as any
);

// 2. Lấy danh sách mã quyền (yêu cầu đã đăng nhập)
permissionRouter.get(
  "/",
  requireAuth as any,
  validateRequest(getPermissionsQuerySchema),
  permissionController.getList as any
);

// 3. Lấy chi tiết một mã quyền (yêu cầu đã đăng nhập)
permissionRouter.get(
  "/:code",
  requireAuth as any,
  validateRequest(permissionCodeParamsSchema),
  permissionController.getDetail as any
);

// 4. Cập nhật mã quyền (chỉ dành cho superadmin)
permissionRouter.patch(
  "/:code",
  requireAuth as any,
  requireRole(["superadmin"]) as any,
  validateRequest(updatePermissionSchema),
  permissionController.update as any
);

// 5. Xóa mã quyền (chỉ dành cho superadmin)
permissionRouter.delete(
  "/:code",
  requireAuth as any,
  requireRole(["superadmin"]) as any,
  validateRequest(permissionCodeParamsSchema),
  permissionController.delete as any
);
