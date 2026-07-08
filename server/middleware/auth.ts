import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { UserModel } from "../model/user.model";
import { RolePermissionModel } from "../model/role-permission.model";

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
    companyCode?: string;
  };
  resource?: any;
}

function shouldSkipRoutineAuthLog(method: string, url: string) {
  const normalizedMethod = String(method || "").toUpperCase();
  const normalizedUrl = String(url || "");

  if (normalizedMethod !== "GET" && normalizedMethod !== "POST") {
    return false;
  }

  const noisyPrefixes = [
    "/api/v1/auth/telegram-link",
    "/api/v1/crud/marketing-contents",
    "/api/v1/crud/crm-tickets",
    "/api/v1/crud/products",
    "/api/v1/wallet/balance",
    "/api/v1/gemini/media-history",
  ];

  return noisyPrefixes.some((prefix) => normalizedUrl.startsWith(prefix));
}

/**
 * Danh sách mã quyền mặc định của hệ thống cho từng vai trò
 */
export const DEFAULT_ROLE_PERMISSIONS: Record<string, string[]> = {
  superadmin: ["*"],
  admin: ["user:read", "user:manage", "crm:read", "crm:manage", "marketing:post"],
  manager: ["user:read", "user:manage", "crm:read", "crm:manage", "marketing:post"],
  user: ["user:read", "crm:read", "marketing:post"],
};

export const DEFAULT_ROLE_LEVELS: Record<string, number> = {
  superadmin: 1,
  admin: 2,
  manager: 3,
  user: 4,
};

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    console.warn(`[requireAuth] Tu choi truy cap ${req.method} ${req.originalUrl}: Khong co Authorization header.`);
    return res.status(401).json({
      status: "error",
      message: "Yeu cau dang nhap. Khong tim thay ma xac thuc.",
    });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(
      token,
      process.env.JWT_ACCESS_SECRET || "your_jwt_access_secret_key"
    ) as any;

    req.user = {
      id: decoded.id,
      email: decoded.email,
      role: decoded.role,
      companyCode: decoded.companyCode,
    };

    return next();
  } catch (error) {
    if (!shouldSkipRoutineAuthLog(req.method, req.originalUrl)) {
      console.warn(`[requireAuth] JWT khong hop le hoac het han cho ${req.method} ${req.originalUrl}:`, (error as Error).message);
    }
    return res.status(401).json({
      status: "error",
      message: "Ma xac thuc khong hop le hoac da het han. Vui long dang nhap lai.",
    });
  }
}

export function requireRole(roles: string[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({
        status: "error",
        message: "Ban khong co quyen truy cap tai nguyen nay.",
      });
    }
    next();
  };
}

export function requirePermission(requiredPermission: string) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          status: "error",
          message: "Nguoi dung chua xac thuc.",
        });
      }

      const { id: userId, role, companyCode } = req.user;

      if (role === "superadmin") {
        return next();
      }

      const userDoc = await UserModel.findById(userId).select("permissions").lean();
      const customPermissions = userDoc?.permissions || [];

      let rolePermissions: string[] = [];
      if (companyCode) {
        const rolePermissionDoc = await RolePermissionModel.findOne({
          companyCode,
          role,
        }).lean();

        if (rolePermissionDoc) {
          rolePermissions = rolePermissionDoc.permissions || [];
        } else {
          rolePermissions = DEFAULT_ROLE_PERMISSIONS[role] || [];
        }
      } else {
        rolePermissions = DEFAULT_ROLE_PERMISSIONS[role] || [];
      }

      const allPermissions = new Set([...customPermissions, ...rolePermissions]);

      if (allPermissions.has(requiredPermission) || allPermissions.has("*")) {
        return next();
      }

      return res.status(403).json({
        status: "error",
        message: `Tai khoan cua ban khong co ma quyen [${requiredPermission}] can thiet de thuc hien thao tac nay.`,
      });
    } catch (error: any) {
      console.error("[requirePermission] Error:", error);
      return res.status(500).json({
        status: "error",
        message: "Co loi xay ra khi xac thuc quyen han.",
        details: error.message,
      });
    }
  };
}

export function requireCompanyAccess(model: mongoose.Model<any>, idParamName: string = "id") {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          status: "error",
          message: "Nguoi dung chua xac thuc.",
        });
      }

      if (req.user.role === "superadmin") {
        return next();
      }

      const resourceId = req.params[idParamName];
      if (!resourceId) {
        return next();
      }

      if (!mongoose.Types.ObjectId.isValid(resourceId)) {
        return res.status(400).json({
          status: "error",
          message: "Dinh dang ID tai nguyen khong hop le.",
        });
      }

      const resource = await model.findById(resourceId).lean();
      if (!resource) {
        return res.status(404).json({
          status: "error",
          message: "Khong tim thay tai nguyen yeu cau.",
        });
      }

      if (resource.companyCode && resource.companyCode !== req.user.companyCode) {
        return res.status(403).json({
          status: "error",
          message: "Ban khong co quyen truy cap hoac chinh sua tai nguyen cua doanh nghiep khac.",
        });
      }

      req.resource = resource;
      return next();
    } catch (error: any) {
      console.error("[requireCompanyAccess] Error:", error);
      return res.status(500).json({
        status: "error",
        message: "Co loi xay ra khi kiem tra quyen han doanh nghiep.",
        details: error.message,
      });
    }
  };
}

async function isSubordinate(managerId: string, employeeId: string): Promise<boolean> {
  let currentId = employeeId;
  const visited = new Set<string>();

  while (currentId) {
    if (currentId === managerId) {
      return true;
    }
    if (visited.has(currentId)) {
      break;
    }
    visited.add(currentId);

    const user = await UserModel.findById(currentId).select("parentId").lean();
    if (!user || !user.parentId) {
      break;
    }
    currentId = user.parentId.toString();
  }

  return false;
}

export function requireHierarchyAccess(idParamName: string = "id") {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          status: "error",
          message: "Nguoi dung chua xac thuc.",
        });
      }

      const targetUserId = req.params[idParamName];
      if (!targetUserId) {
        return next();
      }

      const { id: callerId, role } = req.user;

      if (role === "superadmin" || role === "admin") {
        return next();
      }

      if (callerId === targetUserId) {
        return next();
      }

      if (role === "manager") {
        const isSub = await isSubordinate(callerId, targetUserId);
        if (isSub) {
          return next();
        }
        return res.status(403).json({
          status: "error",
          message: "Ban chi duoc thao tac tren ho so nhan su truc thuoc nhanh quan ly cua minh.",
        });
      }

      return res.status(403).json({
        status: "error",
        message: "Ban khong co quyen thao tac tren ho so nhan su cua nguoi khac.",
      });
    } catch (error: any) {
      console.error("[requireHierarchyAccess] Error:", error);
      return res.status(500).json({
        status: "error",
        message: "Co loi xay ra khi xac thuc phan cap nhan su.",
        details: error.message,
      });
    }
  };
}
