import { Router } from "express";
import Joi from "joi";
import { rolePermissionController } from "../controller/role-permission.controller";
import { requireAuth, requireRole } from "../middleware/auth";
import { validateRequest } from "../middleware/validation";

export const rolePermissionRouter = Router();

const saveRolePermissionSchema = {
  body: Joi.object({
    companyCode: Joi.string().optional().allow(""),
    role: Joi.string().required().messages({
      "any.required": "Vai trò là bắt buộc.",
    }),
    permissions: Joi.array().items(Joi.string()).required().messages({
      "any.required": "Mảng danh sách mã quyền permissions là bắt buộc.",
    }),
    level: Joi.number().integer().min(1).required().messages({
      "any.required": "Cấp bậc vai trò (level) là bắt buộc.",
      "number.base": "Cấp bậc vai trò phải là một số nguyên.",
      "number.min": "Cấp bậc vai trò tối thiểu là 1.",
    }),
    displayName: Joi.string().optional().allow(""),
  }),
};

const getRolePermissionsQuerySchema = {
  query: Joi.object({
    page: Joi.number().integer().min(1).optional(),
    limit: Joi.number().integer().min(1).optional(),
    role: Joi.string().optional(),
    companyCode: Joi.string().optional().allow(""),
  }),
};

const rolePermissionParamsSchema = {
  params: Joi.object({
    role: Joi.string().required().messages({
      "any.required": "Vai trò trong params là bắt buộc.",
    }),
  }),
  query: Joi.object({
    companyCode: Joi.string().optional().allow(""),
  }),
};

// 1. Tạo mới hoặc cập nhật phân quyền cho Role (chỉ dành cho superadmin và admin)
rolePermissionRouter.post(
  "/",
  requireAuth as any,
  requireRole(["superadmin", "admin"]) as any,
  validateRequest(saveRolePermissionSchema),
  rolePermissionController.save as any
);

// 2. Lấy danh sách cấu hình phân quyền vai trò (yêu cầu đăng nhập)
rolePermissionRouter.get(
  "/",
  requireAuth as any,
  validateRequest(getRolePermissionsQuerySchema),
  rolePermissionController.getList as any
);

// 3. Lấy cấu hình phân quyền chi tiết của một Role (yêu cầu đăng nhập)
rolePermissionRouter.get(
  "/:role",
  requireAuth as any,
  validateRequest(rolePermissionParamsSchema),
  rolePermissionController.getDetail as any
);

// 4. Xóa cấu hình phân quyền vai trò (chỉ dành cho superadmin và admin)
rolePermissionRouter.delete(
  "/:role",
  requireAuth as any,
  requireRole(["superadmin", "admin"]) as any,
  validateRequest(rolePermissionParamsSchema),
  rolePermissionController.delete as any
);
