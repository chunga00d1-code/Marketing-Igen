/* eslint-disable @typescript-eslint/no-explicit-any */
import { Response } from "express";
import { AuthenticatedRequest } from "../middleware/auth";
import { crudService } from "../service/crud.service";
import { SupportedModelName } from "../interface/crud.interface";

function sanitizeResourceForClient(modelName: SupportedModelName, item: any) {
  const value = typeof item?.toObject === "function" ? item.toObject() : { ...(item || {}) };
  if (modelName === "social-integrations" && value.platform === "TikTok") {
    delete value.accessToken;
    delete value.refreshToken;
    delete value.appSecret;
  }
  return value;
}

export const crudController = {
  async getList(req: AuthenticatedRequest, res: Response) {
    try {
      const modelName = req.params.modelName as SupportedModelName;
      const companyCode = req.user?.companyCode || "SYSTEM";
      const userRole = req.user?.role || "user";

      const page = parseInt(req.query.page as string, 10) || 1;
      const limit = parseInt(req.query.limit as string, 10) || 1000;
      const sort = req.query.sort as string;
      const search = req.query.search as string;

      const { page: _p, limit: _l, sort: _s, search: _sh, filters: queryFilters, ...otherParams } = req.query;
      const filters: any = {
        ...(typeof queryFilters === "object" && queryFilters !== null ? queryFilters : {}),
        ...otherParams,
      };

      const result = await crudService.getList(
        modelName,
        companyCode,
        { page, limit, sort, search, filters },
        userRole
      );

      return res.status(200).json({
        status: "success",
        data: result.items.map((item: any) => sanitizeResourceForClient(modelName, item)),
        total: result.total,
        page: result.page,
        limit: result.limit,
      });
    } catch (error: any) {
      console.error("[crudController.getList] Error:", error);
      return res.status(500).json({
        status: "error",
        message: "Loi khi tai danh sach tai nguyen",
        details: error.message,
      });
    }
  },

  async getById(req: AuthenticatedRequest, res: Response) {
    try {
      const { modelName, id } = req.params;
      const companyCode = req.user?.companyCode || "SYSTEM";
      const userRole = req.user?.role || "user";

      const item = await crudService.getById(modelName as SupportedModelName, id, companyCode, userRole);
      return res.status(200).json({
        status: "success",
        data: sanitizeResourceForClient(modelName as SupportedModelName, item),
      });
    } catch (error: any) {
      console.error("[crudController.getById] Error:", error);
      return res.status(500).json({
        status: "error",
        message: "Loi khi tai thong tin tai nguyen",
        details: error.message,
      });
    }
  },

  async create(req: AuthenticatedRequest, res: Response) {
    try {
      const modelName = req.params.modelName as SupportedModelName;
      const companyCode = req.user?.companyCode || "SYSTEM";

      const item = await crudService.create(modelName, req.body, companyCode);
      return res.status(201).json({
        status: "success",
        data: sanitizeResourceForClient(modelName, item),
      });
    } catch (error: any) {
      console.error("[crudController.create] Error:", error);
      return res.status(500).json({
        status: "error",
        message: "Loi khi tao moi tai nguyen",
        details: error.message,
      });
    }
  },

  async update(req: AuthenticatedRequest, res: Response) {
    try {
      const { modelName, id } = req.params;
      const companyCode = req.user?.companyCode || "SYSTEM";
      const userRole = req.user?.role || "user";

      const item = await crudService.update(modelName as SupportedModelName, id, req.body, companyCode, userRole);
      return res.status(200).json({
        status: "success",
        data: sanitizeResourceForClient(modelName as SupportedModelName, item),
      });
    } catch (error: any) {
      console.error("[crudController.update] Error:", error);
      return res.status(500).json({
        status: "error",
        message: "Loi khi cap nhat tai nguyen",
        details: error.message,
      });
    }
  },

  async delete(req: AuthenticatedRequest, res: Response) {
    try {
      const { modelName, id } = req.params;
      const companyCode = req.user?.companyCode || "SYSTEM";
      const userRole = req.user?.role || "user";

      const item = await crudService.delete(modelName as SupportedModelName, id, companyCode, userRole);
      return res.status(200).json({
        status: "success",
        message: "Xoa tai nguyen thanh cong",
        data: item,
      });
    } catch (error: any) {
      console.error("[crudController.delete] Error:", error);
      return res.status(500).json({
        status: "error",
        message: "Loi khi xoa tai nguyen",
        details: error.message,
      });
    }
  },
};
