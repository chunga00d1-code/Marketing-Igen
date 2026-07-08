import { Request, Response } from "express";
import { permissionService } from "../service/permission.service";

export const permissionController = {
  /**
   * POST /api/v1/permissions
   */
  async create(req: Request, res: Response) {
    try {
      const permission = await permissionService.createPermission(req.body);
      return res.status(201).json({
        status: "success",
        message: "Tạo mới mã quyền thành công.",
        data: permission,
      });
    } catch (error: any) {
      console.error("[permissionController.create] Error:", error);
      return res.status(400).json({
        status: "error",
        message: error.message || "Không thể tạo mới mã quyền.",
      });
    }
  },

  /**
   * GET /api/v1/permissions
   */
  async getList(req: Request, res: Response) {
    try {
      const { page, limit, module, search } = req.query as any;

      const filter: any = {};
      if (module) {
        filter.module = module;
      }
      if (search) {
        filter.$or = [
          { code: { $regex: search, $options: "i" } },
          { name: { $regex: search, $options: "i" } },
        ];
      }

      const result = await permissionService.getPermissions(filter, {
        page: page ? parseInt(page, 10) : undefined,
        limit: limit ? parseInt(limit, 10) : undefined,
      });

      return res.status(200).json({
        status: "success",
        ...result,
      });
    } catch (error: any) {
      console.error("[permissionController.getList] Error:", error);
      return res.status(500).json({
        status: "error",
        message: "Không thể lấy danh sách mã quyền.",
        details: error.message,
      });
    }
  },

  /**
   * GET /api/v1/permissions/:code
   */
  async getDetail(req: Request, res: Response) {
    try {
      const { code } = req.params;
      const permission = await permissionService.getPermissionByCode(code);
      if (!permission) {
        return res.status(404).json({
          status: "error",
          message: "Không tìm thấy mã quyền được yêu cầu.",
        });
      }
      return res.status(200).json({
        status: "success",
        data: permission,
      });
    } catch (error: any) {
      console.error("[permissionController.getDetail] Error:", error);
      return res.status(500).json({
        status: "error",
        message: "Không thể lấy thông tin mã quyền.",
        details: error.message,
      });
    }
  },

  /**
   * PATCH /api/v1/permissions/:code
   */
  async update(req: Request, res: Response) {
    try {
      const { code } = req.params;
      const updated = await permissionService.updatePermission(code, req.body);
      if (!updated) {
        return res.status(404).json({
          status: "error",
          message: "Không tìm thấy mã quyền để cập nhật.",
        });
      }
      return res.status(200).json({
        status: "success",
        message: "Cập nhật thông tin mã quyền thành công.",
        data: updated,
      });
    } catch (error: any) {
      console.error("[permissionController.update] Error:", error);
      return res.status(400).json({
        status: "error",
        message: error.message || "Không thể cập nhật mã quyền.",
      });
    }
  },

  /**
   * DELETE /api/v1/permissions/:code
   */
  async delete(req: Request, res: Response) {
    try {
      const { code } = req.params;
      await permissionService.deletePermission(code);
      return res.status(200).json({
        status: "success",
        message: "Xóa mã quyền thành công.",
      });
    } catch (error: any) {
      console.error("[permissionController.delete] Error:", error);
      return res.status(400).json({
        status: "error",
        message: error.message || "Không thể xóa mã quyền.",
      });
    }
  },
};
