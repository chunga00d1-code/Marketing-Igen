/* eslint-disable @typescript-eslint/no-explicit-any */
import { PermissionModel } from "../model/permission.model";
import { IPermission } from "../interface/permission.interface";

export const permissionService = {
  /**
   * Tạo m�:i m�"t mã quyền
   */
  async createPermission(data: any): Promise<IPermission> {
    const existing = await PermissionModel.findOne({ code: data.code });
    if (existing) {
      throw new Error(`Mã quyền "${data.code}" �ã t�n tại trên h�! th�ng.`);
    }
    const permission = new PermissionModel(data);
    return await permission.save();
  },

  /**
   * Lấy danh sách mã quyền có h� trợ b�" lọc và phân trang
   */
  async getPermissions(
    filter: any = {},
    pagination: { page?: number; limit?: number } = {}
  ): Promise<{ data: IPermission[]; total: number; page: number; limit: number }> {
    const page = Math.max(1, pagination.page || 1);
    const limit = Math.max(1, pagination.limit || 20);
    const skip = (page - 1) * limit;

    const total = await PermissionModel.countDocuments(filter);
    const data = await PermissionModel.find(filter)
      .sort({ code: 1 })
      .skip(skip)
      .limit(limit);

    return { data, total, page, limit };
  },

  /**
   * Lấy thông tin mã quyền theo code
   */
  async getPermissionByCode(code: string): Promise<IPermission | null> {
    return await PermissionModel.findOne({ code });
  },

  /**
   * Cập nhật thông tin mã quyền
   */
  async updatePermission(code: string, data: any): Promise<IPermission | null> {
    return await PermissionModel.findOneAndUpdate(
      { code },
      { $set: data },
      { new: true }
    );
  },

  /**
   * Xóa m�"t mã quyền khỏi h�! th�ng
   */
  async deletePermission(code: string): Promise<void> {
    const result = await PermissionModel.deleteOne({ code });
    if (result.deletedCount === 0) {
      throw new Error("Không tìm thấy mã quyền �Ồ xóa.");
    }
  }
};
